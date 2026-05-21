import type { Trade, Position } from '@mpg2/shared';

const TP1 = 1.5;
const TP2 = 3.0;
const TP3 = 6.0;

export function formatTrade(trade: Trade, walletUsd?: number, copyWalletName?: string): string {
  const type = trade.tradeType;
  const symbol = trade.tokenSymbol ?? shortAddr(trade.contractAddress);
  const ca = trade.contractAddress;
  const caDisplay = `${ca.slice(0, 8)}…${ca.slice(-6)}`;
  const caLine = `📄 CA: <a href="${tokenUrl(ca)}">${caDisplay}</a>`;
  const walletLine = walletUsd != null ? `\n💼 Wallet: $${walletUsd.toFixed(2)}` : '';
  const sourceLine = sourceLabel(trade.source, copyWalletName);

  if (type === 'BUY') {
    return (
      `🟢 <b>BUY</b> — ${symbol}\n` +
      `${caLine}\n` +
      `${sourceLine}` +
      `💵 Size: $${trade.usdAmount.toFixed(2)}\n` +
      `📍 Entry: $${(trade.entryPrice ?? 0).toFixed(8)}\n` +
      `📊 Score: ${trade.finalScore.toFixed(0)}/100` +
      walletLine
    );
  }

  const pnlSign  = (trade.pnlPct ?? 0) >= 0 ? '🟢' : '🔴';
  const pnlPct   = ((trade.pnlPct ?? 0) * 100).toFixed(1);
  const pnlUsd   = (trade.pnlUsd ?? 0).toFixed(2);
  const exitLabel = exitName(type);

  return (
    `${pnlSign} <b>${exitLabel}</b> — ${symbol}\n` +
    `${caLine}\n` +
    `${sourceLine}` +
    `💵 Proceeds: $${trade.usdAmount.toFixed(2)}\n` +
    `📈 PnL: ${pnlSign} ${pnlPct}% ($${pnlUsd})\n` +
    `🚪 Exit: $${(trade.exitPrice ?? 0).toFixed(8)}` +
    walletLine
  );
}

export function formatPosition(pos: Position): string {
  const symbol   = pos.tokenSymbol ?? shortAddr(pos.contractAddress);
  const pnlPct   = ((pos.unrealizedPnlPct ?? 0) * 100).toFixed(1);
  const pnlSign  = (pos.unrealizedPnlPct ?? 0) >= 0 ? '🟢' : '🔴';
  const tps      = [pos.tp1Executed ? '✅' : '⬜', pos.tp2Executed ? '✅' : '⬜', pos.tp3Executed ? '✅' : '⬜'].join('');
  const ageMin   = Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 60_000);
  const ageStr   = ageMin >= 60 ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m` : `${ageMin}m`;
  const src      = sourceLabel(pos.source).replace(/\n$/, '');

  // Next TP and SL target prices for easy monitoring on DexScreener
  const slPct   = pos.source === 'sniper' ? 0.85 : 0.80; // sniper -15%, others -20%
  const slPrice = pos.entryPrice * slPct;
  let nextTpLabel = '';
  if (!pos.tp1Executed) {
    nextTpLabel = `TP1 $${(pos.entryPrice * TP1).toFixed(8)} (+50%)`;
  } else if (!pos.tp2Executed) {
    nextTpLabel = `TP2 $${(pos.entryPrice * TP2).toFixed(8)} (+200%)`;
  } else if (!pos.tp3Executed) {
    nextTpLabel = `TP3 $${(pos.entryPrice * TP3).toFixed(8)} (+500%)`;
  } else {
    nextTpLabel = '🌙 All TPs hit';
  }

  return (
    `📌 <b>${symbol}</b>  ${src}\n` +
    `💰 $${pos.usdInvested.toFixed(2)}  ⏱ ${ageStr}\n` +
    `📍 Entry: $${pos.entryPrice.toFixed(8)}\n` +
    `💹 Now: $${(pos.currentPrice ?? pos.entryPrice).toFixed(8)}  ${pnlSign} ${pnlPct}%\n` +
    `🎯 ${nextTpLabel}\n` +
    `🛑 SL: $${slPrice.toFixed(8)}\n` +
    `TPs: ${tps}  Trail: ${pos.trailingStopActive ? '🟡' : '⬜'}`
  );
}

export function formatPortfolioSummary(positions: Position[], trades: Trade[]): string {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const closedTrades = trades.filter(t => t.pnlUsd !== undefined && t.tradeType !== 'BUY');
  const todayTrades  = closedTrades.filter(t => new Date(t.createdAt).getTime() >= todayMs);

  const totalInvested = positions.reduce((s, p) => s + p.usdInvested, 0);
  const unrealizedPnl = positions.reduce((s, p) => s + ((p.unrealizedPnlPct ?? 0) * p.usdInvested), 0);

  const todayPnl  = todayTrades.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const todayWins = todayTrades.filter(t => (t.pnlUsd ?? 0) > 0).length;

  const realizedPnl = closedTrades.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const winRate     = closedTrades.length > 0
    ? (closedTrades.filter(t => (t.pnlUsd ?? 0) > 0).length / closedTrades.length * 100).toFixed(0)
    : '—';

  const SOURCE_EMOJI: Record<string, string> = {
    social: '📡', sniper: '🎯', copy_trade: '👤', pump_graduation: '🎓',
  };
  type Bucket = { pnl: number; wins: number; total: number };
  const bySource = new Map<string, Bucket>();
  for (const t of todayTrades) {
    const src = t.source ?? 'social';
    const b = bySource.get(src) ?? { pnl: 0, wins: 0, total: 0 };
    b.pnl += t.pnlUsd ?? 0;
    b.total++;
    if ((t.pnlUsd ?? 0) > 0) b.wins++;
    bySource.set(src, b);
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const lines: string[] = [`📊 <b>Portfolio — ${dateStr}</b>\n`];

  // Today
  lines.push(`📅 <b>Today</b>`);
  if (todayTrades.length > 0) {
    const pnlSign = todayPnl >= 0 ? '🟢' : '🔴';
    lines.push(`${pnlSign} $${todayPnl.toFixed(2)} | ${todayWins}W / ${todayTrades.length - todayWins}L`);
    for (const [src, b] of bySource) {
      const emoji = SOURCE_EMOJI[src] ?? '📌';
      const sign  = b.pnl >= 0 ? '+' : '';
      lines.push(`  ${emoji} ${src}: ${sign}$${b.pnl.toFixed(2)} (${b.wins}W/${b.total - b.wins}L)`);
    }
  } else {
    lines.push('لا توجد صفقات مغلقة اليوم بعد');
  }

  // Open positions
  lines.push('');
  lines.push(`📂 <b>Open (${positions.length})</b>`);
  if (positions.length > 0) {
    lines.push(`💵 Invested: $${totalInvested.toFixed(2)}`);
    lines.push(`📈 Unrealized: ${unrealizedPnl >= 0 ? '🟢' : '🔴'} $${unrealizedPnl.toFixed(2)}`);
  } else {
    lines.push('لا توجد مراكز مفتوحة');
  }

  // All-time
  lines.push('');
  lines.push(`📋 <b>All-time</b> (${closedTrades.length} trades)`);
  lines.push(`${realizedPnl >= 0 ? '🟢' : '🔴'} $${realizedPnl.toFixed(2)} | WR ${winRate}%`);

  return lines.join('\n');
}

function sourceLabel(source?: string, copyWalletName?: string): string {
  switch (source) {
    case 'sniper':          return '🎯 Source: Sniper (new token)\n';
    case 'copy_trade':      return `👤 Copy: ${copyWalletName ?? 'wallet'}\n`;
    case 'pump_graduation': return '🎓 Source: Pump Graduation\n';
    case 'social':          return '📡 Source: Social signals\n';
    case 'manual':          return '👁 Source: Manual (/watch)\n';
    default:                return '';
  }
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function tokenUrl(addr: string): string {
  return addr.endsWith('pump')
    ? `https://pump.fun/${addr}`
    : `https://dexscreener.com/solana/${addr}`;
}

function exitName(type: Trade['tradeType']): string {
  switch (type) {
    case 'SELL_TP1':        return 'TP1 (+50%)';
    case 'SELL_TP2':        return 'TP2 (3x)';
    case 'SELL_TP3':        return 'TP3 (6x)';
    case 'SELL_STOP_LOSS':  return 'STOP LOSS';
    case 'SELL_TRAILING':   return 'TRAILING STOP';
    case 'SELL_MANUAL':     return 'MANUAL CLOSE';
    case 'SELL_DEV_RUG':    return 'DEV RUG — EMERGENCY EXIT';
    case 'SELL_TIMEOUT':    return 'TIME EXIT';
    default:                return type;
  }
}
