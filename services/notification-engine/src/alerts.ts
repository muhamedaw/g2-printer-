import type Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';
import type { TelegramNotifier } from './TelegramNotifier.js';

const log = createLogger('alerts');

const WORKER_NAMES = [
  'market-data',
  'social-data',
  'ai-brain',
  'security-engine',
  'risk-engine',
  'trade-engine',
] as const;

// Suppress repeated alerts — only fire once per outage window
const alertedWorkers = new Set<string>();

export async function checkWorkerHealth(redis: Redis, notifier: TelegramNotifier): Promise<void> {
  const adminChatId = process.env['ADMIN_TELEGRAM_CHAT_ID'];
  if (!adminChatId) return;

  const recovered: string[] = [];

  for (const name of WORKER_NAMES) {
    const raw   = await redis.get(`heartbeat:${name}`);
    const isUp  = raw !== null && Date.now() - Number(raw) < 180_000;

    if (!isUp && !alertedWorkers.has(name)) {
      alertedWorkers.add(name);
      const ageStr = raw ? `${Math.round((Date.now() - Number(raw)) / 1000)}s ago` : 'never';
      await notifier.send(adminChatId,
        `⚠️ <b>Worker Down</b>\n` +
        `<b>Service:</b> ${name}\n` +
        `<b>Last seen:</b> ${ageStr}\n` +
        `<b>Time:</b> ${new Date().toISOString()}`
      );
      log.warn({ name, ageStr }, 'Worker heartbeat missing — alert sent');
    } else if (isUp && alertedWorkers.has(name)) {
      alertedWorkers.delete(name);
      recovered.push(name);
    }
  }

  if (recovered.length > 0) {
    await notifier.send(adminChatId,
      `✅ <b>Worker Recovered</b>\n` +
      recovered.map(n => `• ${n}`).join('\n')
    );
  }
}

// Track last notified inactivity to avoid spam
let lastInactivityAlertMs = 0;
const INACTIVITY_ALERT_EVERY_MS = 60 * 60 * 1_000; // at most once per hour
const INACTIVITY_THRESHOLD_MS  = 45 * 60 * 1_000;  // 45 minutes of no trades

export async function checkInactivityAlert(redis: Redis, notifier: TelegramNotifier): Promise<void> {
  const adminChatId = process.env['ADMIN_TELEGRAM_CHAT_ID'];
  if (!adminChatId) return;

  // Only alert if we haven't alerted recently
  if (Date.now() - lastInactivityAlertMs < INACTIVITY_ALERT_EVERY_MS) return;

  // Check last trade time across all users
  try {
    const users = await redis.smembers('users:live_trading');
    for (const uid of users) {
      const lastTradeRaw = await redis.lindex(`trades:${uid}`, 0);
      if (!lastTradeRaw) continue;
      const trade = JSON.parse(lastTradeRaw) as { createdAt?: string };
      const lastTradeMs = trade.createdAt ? new Date(trade.createdAt).getTime() : 0;
      if (lastTradeMs && Date.now() - lastTradeMs > INACTIVITY_THRESHOLD_MS) {
        const minutesAgo = Math.round((Date.now() - lastTradeMs) / 60_000);
        // Check if the bot is paused or emergency stopped before alerting
        const paused    = await redis.get(`trading:${uid}:paused`);
        const emergency = await redis.get('system:emergency_stop');
        if (paused || emergency) return; // expected inactivity

        lastInactivityAlertMs = Date.now();
        await notifier.send(adminChatId,
          `⚠️ <b>لا يوجد نشاط تداول منذ ${minutesAgo} دقيقة</b>\n\n` +
          `النظام يعمل لكن لم يُنفَّذ أي شراء أو بيع.\n` +
          `استخدم /debug لتشخيص السبب.`
        );
        log.warn({ uid, minutesAgo }, 'Trading inactivity alert sent');
      }
    }
  } catch (err) {
    log.warn({ err }, 'inactivity check failed');
  }
}

export async function checkDailyLossAlert(redis: Redis, notifier: TelegramNotifier): Promise<void> {
  const adminChatId = process.env['ADMIN_TELEGRAM_CHAT_ID'];
  if (!adminChatId) return;

  try {
    // Aggregate daily loss across all users from Redis
    const keys = await redis.keys(`risk:daily_loss:*:${new Date().toISOString().slice(0, 10)}`);
    if (keys.length === 0) return;

    const values = await redis.mget(...keys);
    const total  = values.reduce((sum, v) => sum + Number(v ?? 0), 0);

    // Alert if total system daily loss exceeds $1000 equivalent positions
    if (total > 1000) {
      await notifier.send(adminChatId,
        `🚨 <b>High System Loss Alert</b>\n` +
        `Total daily loss across all users: <b>${total.toFixed(2)} USDC</b>\n` +
        `Time: ${new Date().toISOString()}`
      );
    }
  } catch (err) {
    log.warn({ err }, 'daily loss check failed');
  }
}
