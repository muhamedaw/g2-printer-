import 'dotenv/config';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';
import type { Trade } from '@mpg2/shared';
import { TelegramNotifier }               from './TelegramNotifier.js';
import { TwitterBot }                     from './TwitterBot.js';
import { InstagramBot }                   from './InstagramBot.js';
import { TikTokBot }                      from './TikTokBot.js';
import { registerCommands }               from './commands.js';
import { formatTrade }                    from './formatters.js';
import { sendDailyReport, sendWeeklyReport } from './reports.js';
import { checkWorkerHealth, checkDailyLossAlert, checkInactivityAlert } from './alerts.js';

const log = createLogger('notification-engine');

const token = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
if (!token) log.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');

const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const redisConn = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const notifier       = token ? new TelegramNotifier(token) : null;
const twitterBot     = new TwitterBot();
const instagramBot   = new InstagramBot();
const tikTokBot      = new TikTokBot();
const queue          = new Queue('notification-engine', { connection: redisConn });

// ─── Redis subscriber — trade events ─────────────────────────────────────────

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

tikTokBot.setRedis(redis);
twitterBot.setRedis(redis);
instagramBot.setRedis(redis);

interface NearTpAlert {
  userId: string;
  mint:   string;
  symbol: string;
  type:   string;
  pnlPct: string;
  label:  string;
}

const subscribeToTrades = (): void => {
  void redisSub.subscribe('trade:executed', 'trade:alert', err => {
    if (err) log.error({ err }, 'Subscribe failed');
  });
};

subscribeToTrades();
redisSub.on('error', err => log.warn({ err }, 'redisSub connection error'));
redisSub.on('ready', () => {
  log.info('redisSub reconnected — re-subscribing');
  subscribeToTrades();
});

redisSub.on('message', (channel, message) => {
  if (channel === 'trade:executed') {
    const trade = JSON.parse(message) as Trade;
    // Push to user's trade history
    void redis.lpush(`trades:${trade.userId}`, JSON.stringify(trade)).catch(() => null);
    void redis.ltrim(`trades:${trade.userId}`, 0, 499).catch(() => null);
    // Queue notification
    void queue.add('notify-trade', { trade }, { removeOnComplete: true }).catch(() => null);
    return;
  }
  if (channel === 'trade:alert') {
    const alert = JSON.parse(message) as NearTpAlert;
    void handleNearTpAlert(alert).catch(() => null);
  }
});

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function handleNotifyTrade(trade: Trade): Promise<void> {
  // Telegram notification
  if (notifier) {
    const chatId = await redis.get(`user:${trade.userId}:chat_id`)
      ?? (process.env['ADMIN_TELEGRAM_CHAT_ID'] ?? null);
    if (chatId) {
      const walletRaw = await redis.get(`portfolio:${trade.userId}:balance`);
      const walletUsd = walletRaw ? parseFloat(walletRaw) : undefined;
      // Resolve copy-trade wallet label for notifications
      const copyWalletName = trade.copyTradeWallet
        ? (await redis.get(`copy_trade:wallet:${trade.copyTradeWallet}:name`).catch(() => null)) ?? trade.copyTradeWallet.slice(0, 8)
        : undefined;
      const text = formatTrade(trade, walletUsd, copyWalletName);
      await notifier.send(chatId, text);
    }
  }

  // Social media announcements (fire-and-forget per platform)
  if (trade.tradeType === 'BUY') {
    void twitterBot.announceBuy(trade);
    if (trade.tokenSymbol) void twitterBot.likeCoinMentions(trade.tokenSymbol);
    void instagramBot.announceTrade(trade);
    void tikTokBot.draftCaption(trade);
  } else if (trade.pnlPct && trade.pnlPct > 0) {
    void twitterBot.announceSell(trade);
    void instagramBot.announceTrade(trade);
    void tikTokBot.draftCaption(trade);
  }
}

async function handleDailyReport(): Promise<void> {
  if (!notifier) return;
  await sendDailyReport(redis, notifier);
  log.info('Daily report sent');
}

async function handleWeeklyReport(): Promise<void> {
  if (!notifier) return;
  await sendWeeklyReport(redis, notifier);
  log.info('Weekly report sent');
}

async function handleHealthCheck(): Promise<void> {
  if (!notifier) return;
  await checkWorkerHealth(redis, notifier);
  await checkDailyLossAlert(redis, notifier);
  await checkInactivityAlert(redis, notifier);
}

async function handleNearTpAlert(alert: NearTpAlert): Promise<void> {
  if (!notifier) return;

  // PROMPT 92: NEAR_GRADUATION alert — broadcast to all active users
  if (alert.type === 'NEAR_GRADUATION') {
    const users = await redis.smembers('users:live_trading').catch(() => [] as string[]);
    const adminChat = process.env['ADMIN_TELEGRAM_CHAT_ID'] ?? null;
    const chatIds = new Set<string>();
    for (const uid of users) {
      const cid = await redis.get(`user:${uid}:chat_id`).catch(() => null);
      if (cid) chatIds.add(cid);
    }
    if (adminChat) chatIds.add(adminChat);
    const ca = alert.mint;
    const url = `https://pump.fun/${ca}`;
    const caShort = `${ca.slice(0, 8)}…${ca.slice(-6)}`;
    const msg = `🎓 <b>${alert.symbol}</b> — bonding curve ${alert.pnlPct}%\n` +
      `📈 قريب من التخرج إلى PumpSwap/Raydium\n` +
      `📄 <a href="${url}">${caShort}</a>`;
    for (const cid of chatIds) {
      await notifier.send(cid, msg).catch(() => null);
    }
    log.info({ symbol: alert.symbol, pct: alert.pnlPct }, 'Near-graduation alert broadcast');
    return;
  }

  // SOURCE_DISABLED alert from PROMPT 91
  if (alert.type === 'SOURCE_DISABLED') {
    const chatId = await redis.get(`user:${alert.userId}:chat_id`)
      ?? (process.env['ADMIN_TELEGRAM_CHAT_ID'] ?? null);
    if (chatId) {
      await notifier.send(chatId,
        `⚠️ <b>مصدر معطَّل تلقائياً</b>\n` +
        `🔴 ${alert.symbol} — EV ${alert.pnlPct}% بعد 20+ صفقة\n` +
        `⏰ معطَّل لمدة 6 ساعات للحماية من الخسائر`,
      ).catch(() => null);
    }
    return;
  }

  const chatId = await redis.get(`user:${alert.userId}:chat_id`)
    ?? (process.env['ADMIN_TELEGRAM_CHAT_ID'] ?? null);
  if (!chatId) return;

  const ca = alert.mint;
  const caShort = `${ca.slice(0, 8)}…${ca.slice(-6)}`;
  const url = ca.endsWith('pump') ? `https://pump.fun/${ca}` : `https://dexscreener.com/solana/${ca}`;

  await notifier.send(chatId,
    `🔔 <b>${alert.symbol}</b> approaching ${alert.label}\n` +
    `📈 Current: +${alert.pnlPct}% → TP at +${tpTargetPct(alert.type)}%\n` +
    `📄 <a href="${url}">${caShort}</a>`,
  );
  log.info({ userId: alert.userId, symbol: alert.symbol, type: alert.type, pnlPct: alert.pnlPct }, 'Near-TP alert sent');
}

function tpTargetPct(alertType: string): string {
  if (alertType === 'NEAR_TP1') return '50';
  if (alertType === 'NEAR_TP2') return '200';
  if (alertType === 'NEAR_TP3') return '500';
  return '?';
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker('notification-engine', async (job: Job) => {
  switch (job.name) {
    case 'notify-trade':    return handleNotifyTrade(job.data.trade as Trade);
    case 'daily-report':    return handleDailyReport();
    case 'weekly-report':   return handleWeeklyReport();
    case 'health-check':        return handleHealthCheck();
    case 'twitter-influencers':  return twitterBot.monitorInfluencers();
    case 'instagram-engage':     return instagramBot.engageWithHashtags();
    case 'instagram-follow':     return instagramBot.followCryptoAccounts();
    case 'tiktok-engage':        return tikTokBot.requestHashtagEngagement();
    default: log.warn({ jobName: job.name }, 'unknown job');
  }
}, { connection: redisConn, concurrency: 2 });

worker.on('failed',    (job, err) => log.error({ err, jobName: job?.name }, 'job failed'));
worker.on('completed', job        => log.debug({ jobName: job.name }, 'job done'));

// ─── Scheduled reports: daily at 22:00, weekly on Sundays ────────────────────

async function scheduleReports(): Promise<void> {
  // Daily at 22:00 UTC
  await queue.upsertJobScheduler('daily-report',  { pattern: '0 22 * * *'  }, { name: 'daily-report',  data: {} });
  // Weekly Sunday at 22:30 UTC
  await queue.upsertJobScheduler('weekly-report', { pattern: '30 22 * * 0' }, { name: 'weekly-report', data: {} });
  // Health check every 2 minutes
  await queue.upsertJobScheduler('health-check',        { every: 120_000 },         { name: 'health-check',        data: {} });
  await queue.upsertJobScheduler('twitter-influencers', { every: 600_000 },  { name: 'twitter-influencers', data: {} });
  // Instagram: engage every 15 min, follow once per day
  await queue.upsertJobScheduler('instagram-engage',    { every: 900_000 },  { name: 'instagram-engage',    data: {} });
  await queue.upsertJobScheduler('instagram-follow',    { pattern: '0 9 * * *' }, { name: 'instagram-follow', data: {} });
  // TikTok: trigger engagement check every 8 min
  await queue.upsertJobScheduler('tiktok-engage',       { every: 480_000 },  { name: 'tiktok-engage',       data: {} });
  log.info('Report schedulers registered');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Notification Engine starting…');

  if (notifier) {
    const bot = notifier.getBot();
    registerCommands(bot, redis);

    // Register command menu so "/" shows all options in Telegram
    await bot.api.setMyCommands([
      { command: 'start',      description: 'ابدأ التداول وسجّل حسابك' },
      { command: 'status',     description: 'حالة النظام والمحفظة' },
      { command: 'positions',  description: 'المراكز المفتوحة الحالية' },
      { command: 'pnl',        description: 'الأرباح والخسائر' },
      { command: 'stop',       description: 'إيقاف فتح صفقات جديدة' },
      { command: 'resume',     description: 'استئناف التداول' },
      { command: 'close',      description: 'إغلاق مركز يدوياً (mint address)' },
      { command: 'emergency',  description: '🚨 إيقاف طارئ فوري لكل شيء' },
      { command: 'resume_all', description: 'إلغاء الإيقاف الطارئ' },
      { command: 'watch',      description: 'شراء يدوي لتوكن (أدخل mint address)' },
      { command: 'stats',      description: 'أداء كل مصدر إشارة (social/sniper/copy)' },
      { command: 'journal',    description: 'آخر 10 صفقات مغلقة مع التفاصيل' },
      { command: 'wallets',    description: 'أفضل محافظ copy-trade بالـ win rate' },
      { command: 'help',       description: 'عرض جميع الأوامر' },
      { command: 'debug',      description: 'تشخيص لماذا لا تحدث صفقات' },
    ]).catch(err => log.warn({ err }, 'setMyCommands failed — continuing'));

    // Catch handler: log command errors without crashing the polling loop
    bot.catch(err => {
      const cmd = (err.ctx.message?.text ?? '').slice(0, 30);
      log.error({ err: err.error, cmd }, 'Command handler error');
      err.ctx.reply('❌ حدث خطأ، حاول مجدداً.').catch(() => null);
    });

    const startBotWithRestart = async (): Promise<void> => {
      while (true) {
        try {
          await bot.start({ onStart: () => log.info('Telegram bot polling started') });
        } catch (err) {
          log.warn({ err }, 'Telegram bot crashed — restarting in 10s');
          await new Promise(r => setTimeout(r, 10_000));
        }
      }
    };
    void startBotWithRestart();
  }

  await scheduleReports();

  const hb = setInterval(() => {
    void redis.set('heartbeat:notification-engine', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redis.set('heartbeat:notification-engine', String(Date.now()), 'EX', 300).catch(() => null);

  log.info('Notification Engine ready');

  process.on('SIGTERM', async () => {
    clearInterval(hb);
    redisSub.disconnect();
    if (notifier) await notifier.getBot().stop();
    await worker.close();
    await queue.close();
    redis.disconnect();
    redisConn.disconnect();
    log.info('Graceful shutdown complete');
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});
