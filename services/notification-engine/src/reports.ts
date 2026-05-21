import type Redis from 'ioredis';
import type { Trade } from '@mpg2/shared';
import type { TelegramNotifier } from './TelegramNotifier.js';

async function getActiveChatIds(redis: Redis): Promise<string[]> {
  return redis.smembers('users:live_trading');
}

async function getUserTrades(redis: Redis, userId: string, limit = 200): Promise<Trade[]> {
  const raw = await redis.lrange(`trades:${userId}`, 0, limit - 1);
  return raw.map(r => JSON.parse(r) as Trade);
}

function sourceBreakdown(trades: Trade[]): string {
  const map = new Map<string, { wins: number; total: number }>();
  for (const t of trades) {
    const src = t.source ?? 'social';
    const s = map.get(src) ?? { wins: 0, total: 0 };
    s.total++;
    if ((t.pnlUsd ?? 0) > 0) s.wins++;
    map.set(src, s);
  }
  const emoji: Record<string, string> = { social: '📡', sniper: '🎯', copy_trade: '👤', pump_graduation: '🎓' };
  return [...map.entries()]
    .map(([src, s]) => `  ${emoji[src] ?? '📌'} ${src}: ${s.wins}/${s.total} (${(s.wins / s.total * 100).toFixed(0)}%)`)
    .join('\n');
}

export async function sendDailyReport(redis: Redis, notifier: TelegramNotifier): Promise<void> {
  const chatIds = await getActiveChatIds(redis);

  for (const chatId of chatIds) {
    const trades = await getUserTrades(redis, chatId, 100);
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter(t => {
      const d = new Date(t.createdAt).toISOString().slice(0, 10);
      return d === today && t.pnlUsd !== undefined;
    });

    const balanceRaw = await redis.get(`portfolio:${chatId}:balance`);
    const balance    = balanceRaw ? parseFloat(balanceRaw) : null;
    const balLine    = balance != null ? `\n💼 رصيد المحفظة: $${balance.toFixed(2)}` : '';

    if (todayTrades.length === 0) {
      await notifier.send(chatId, `📅 <b>التقرير اليومي — ${today}</b>\n\nلا توجد صفقات مغلقة اليوم.${balLine}`);
      continue;
    }

    const totalPnl = todayTrades.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
    const wins     = todayTrades.filter(t => (t.pnlUsd ?? 0) > 0).length;
    const winRate  = (wins / todayTrades.length * 100).toFixed(0);
    const best     = todayTrades.reduce((a, b) => (a.pnlPct ?? 0) > (b.pnlPct ?? 0) ? a : b);
    const sign     = totalPnl >= 0 ? '🟢' : '🔴';

    await notifier.send(chatId,
      `📅 <b>التقرير اليومي — ${today}</b>\n\n` +
      `📊 الصفقات المغلقة: ${todayTrades.length}\n` +
      `🎯 نسبة الربح: ${winRate}%\n` +
      `${sign} الربح/الخسارة: $${totalPnl.toFixed(2)}\n` +
      `🏆 أفضل صفقة: ${best.tokenSymbol ?? best.contractAddress.slice(0, 6)} +${((best.pnlPct ?? 0) * 100).toFixed(1)}%\n` +
      `\n<b>المصادر:</b>\n${sourceBreakdown(todayTrades)}${balLine}`,
    );
  }
}

export async function sendWeeklyReport(redis: Redis, notifier: TelegramNotifier): Promise<void> {
  const chatIds = await getActiveChatIds(redis);
  const weekAgo = Date.now() - 7 * 86400_000;

  for (const chatId of chatIds) {
    const trades = await getUserTrades(redis, chatId, 500);
    const weekTrades = trades.filter(t =>
      t.pnlUsd !== undefined && new Date(t.createdAt).getTime() > weekAgo,
    );

    const balanceRaw = await redis.get(`portfolio:${chatId}:balance`);
    const balance    = balanceRaw ? parseFloat(balanceRaw) : null;
    const balLine    = balance != null ? `\n💼 رصيد المحفظة: $${balance.toFixed(2)}` : '';

    if (weekTrades.length === 0) {
      await notifier.send(chatId, `📆 <b>التقرير الأسبوعي</b>\n\nلا توجد صفقات مغلقة هذا الأسبوع.${balLine}`);
      continue;
    }

    const totalPnl = weekTrades.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
    const wins     = weekTrades.filter(t => (t.pnlUsd ?? 0) > 0).length;
    const winRate  = (wins / weekTrades.length * 100).toFixed(0);
    const best     = weekTrades.reduce((a, b) => (a.pnlPct ?? 0) > (b.pnlPct ?? 0) ? a : b);
    const worst    = weekTrades.reduce((a, b) => (a.pnlPct ?? 0) < (b.pnlPct ?? 0) ? a : b);
    const sign     = totalPnl >= 0 ? '🟢' : '🔴';

    // PROMPT 84: Dragon Wallet audit — flag copy wallets with < 25% WR after ≥ 10 trades
    const walletKeys = await redis.keys('copy_trade:wallet:*:total').catch(() => [] as string[]);
    const badWallets: string[] = [];
    for (const key of walletKeys) {
      const addr  = key.replace('copy_trade:wallet:', '').replace(':total', '');
      const total = parseInt(await redis.get(key) ?? '0', 10);
      if (total < 10) continue;
      const wins = parseInt(await redis.get(`copy_trade:wallet:${addr}:wins`) ?? '0', 10);
      if (wins / total < 0.25) {
        const name = await redis.get(`copy_trade:wallet:${addr}:name`).catch(() => null) ?? addr.slice(0, 8);
        badWallets.push(`  ❌ ${name} — WR ${(wins / total * 100).toFixed(0)}% (${total} صفقة)`);
      }
    }
    const walletAudit = badWallets.length > 0
      ? `\n\n🔍 <b>محافظ ضعيفة الأداء (يُنصح بالمراجعة):</b>\n${badWallets.slice(0, 5).join('\n')}`
      : '';

    await notifier.send(chatId,
      `📆 <b>التقرير الأسبوعي</b>\n\n` +
      `📊 إجمالي الصفقات: ${weekTrades.length}\n` +
      `🎯 نسبة الربح: ${winRate}%\n` +
      `${sign} الربح/الخسارة: $${totalPnl.toFixed(2)}\n` +
      `🏆 أفضل: ${best.tokenSymbol ?? best.contractAddress.slice(0, 6)} +${((best.pnlPct ?? 0) * 100).toFixed(1)}%\n` +
      `📉 أسوأ: ${worst.tokenSymbol ?? worst.contractAddress.slice(0, 6)} ${((worst.pnlPct ?? 0) * 100).toFixed(1)}%\n` +
      `\n<b>المصادر:</b>\n${sourceBreakdown(weekTrades)}${balLine}${walletAudit}`,
    );
  }
}
