import 'dotenv/config';
import Redis from 'ioredis';
import { createLogger, DEFAULT_RISK } from '@mpg2/shared';
import type { AiSignal, TokenSafety, BuySignal, Trade } from '@mpg2/shared';
import { DailyLossGuard }   from './guards/DailyLossGuard.js';
import { DrawdownMonitor }  from './guards/DrawdownMonitor.js';
import { calculatePositionSize } from './PositionSizer.js';

const log = createLogger('risk-engine-worker');

const redisPub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const dailyGuard    = new DailyLossGuard(redisPub);
const drawdownMon   = new DrawdownMonitor(redisPub);

// ─── Redis subscriber ─────────────────────────────────────────────────────────

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const SELL_TYPES = new Set(['SELL_TP1','SELL_TP2','SELL_TP3','SELL_STOP_LOSS','SELL_TRAILING','SELL_MANUAL','SELL_DEV_RUG','SELL_TIMEOUT']);

const subscribeChannels = (): void => {
  void redisSub.subscribe('safety:passed', 'trade:executed', err => {
    if (err) log.error({ err }, 'Subscribe failed');
  });
};
subscribeChannels();

redisSub.on('error', err => log.warn({ err }, 'redisSub error'));
redisSub.on('ready', () => {
  log.info('redisSub reconnected — re-subscribing');
  subscribeChannels();
});

redisSub.on('message', (channel, message) => {
  if (channel === 'safety:passed') {
    const payload = JSON.parse(message) as { aiSignal: AiSignal; safety: TokenSafety };
    void processRiskCheck(payload.aiSignal, payload.safety).catch(err =>
      log.error({ err }, 'Risk check error'),
    );
    return;
  }
  if (channel === 'trade:executed') {
    const trade = JSON.parse(message) as Trade;
    if (SELL_TYPES.has(trade.tradeType) && trade.pnlPct != null) {
      void handleTradeOutcome(trade).catch(err =>
        log.warn({ err }, 'Circuit breaker update failed'),
      );
    }
  }
});

// ─── Circuit breakers ─────────────────────────────────────────────────────────

const CIRCUIT_PAUSE_SECONDS  = 30 * 60;   // 30 min auto-resume
const CIRCUIT_HIGH_THRESHOLD_SECONDS = 2 * 60 * 60; // 2 h
const WIN_RATE_LOOKBACK = 30;
const WIN_RATE_FLOOR    = 0.20;
const HIGH_THRESHOLD_SCORE = 90;

const EV_DISABLE_THRESHOLD = -0.05; // source EV < -5% after ≥20 trades → pause 6h
const EV_DISABLE_SECONDS   = 6 * 60 * 60;
const EV_MIN_TRADES        = 20;

async function checkAndDisableNegativeEvSource(source: string, userId: string): Promise<void> {
  const keys = await redisPub.mget(
    `ev:${source}:count`,
    `ev:${source}:win_count`,
    `ev:${source}:win_sum`,
    `ev:${source}:loss_count`,
    `ev:${source}:loss_sum`,
  );
  const count     = parseFloat(keys[0] ?? '0');
  const winCount  = parseFloat(keys[1] ?? '0');
  const winSum    = parseFloat(keys[2] ?? '0');
  const lossCount = parseFloat(keys[3] ?? '0');
  const lossSum   = parseFloat(keys[4] ?? '0');

  if (count < EV_MIN_TRADES) return;

  const wr     = winCount / count;
  const avgWin  = winCount > 0 ? winSum / winCount : 0;
  const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
  const ev      = avgWin > 0 ? (wr * avgWin - (1 - wr) * avgLoss) / avgWin : -1;

  if (ev < EV_DISABLE_THRESHOLD) {
    const alreadyDisabled = await redisPub.get(`circuit:source:${source}:disabled`);
    if (alreadyDisabled) return;

    await redisPub.set(`circuit:source:${source}:disabled`, '1', 'EX', EV_DISABLE_SECONDS);
    log.warn({ source, ev: ev.toFixed(3), count, wr: (wr * 100).toFixed(0) }, `Source EV < ${EV_DISABLE_THRESHOLD} after ${count} trades — disabled 6h`);
    // Telegram alert to all active users
    await redisPub.publish('trade:alert', JSON.stringify({
      userId,
      mint: 'system',
      symbol: source.toUpperCase(),
      type: 'SOURCE_DISABLED',
      pnlPct: (ev * 100).toFixed(1),
      label: `مصدر ${source} معطَّل 6h (EV ${(ev * 100).toFixed(1)}%)`,
    }));
  }
}

async function handleTradeOutcome(trade: Trade): Promise<void> {
  const userId  = trade.userId;
  const lossKey = `circuit:${userId}:consecutive_losses`;

  if ((trade.pnlPct ?? 0) < 0) {
    // Record actual USD loss for daily loss guard (was never called — bug fix)
    if (trade.pnlUsd != null && trade.pnlUsd < 0) {
      await dailyGuard.recordLoss(userId, Math.abs(trade.pnlUsd));
    }

    const losses = await redisPub.incr(lossKey);
    await redisPub.expire(lossKey, 86_400);

    if (losses >= DEFAULT_RISK.MAX_CONSECUTIVE_LOSSES) {
      await redisPub.set(`trading:${userId}:paused`, '1', 'EX', CIRCUIT_PAUSE_SECONDS);
      await redisPub.del(lossKey);
      log.warn({ userId, losses }, `Circuit breaker: ${losses} consecutive losses — paused 30 min`);
    }
  } else {
    await redisPub.del(lossKey);
  }

  // Per-source EV check: auto-disable source if negative EV after 20+ trades
  if (trade.source) {
    void checkAndDisableNegativeEvSource(trade.source, userId).catch(() => null);
  }

  // Global win-rate circuit — check last 20 outcomes
  const raw = await redisPub.lrange('learning:outcomes', 0, WIN_RATE_LOOKBACK - 1);
  if (raw.length >= WIN_RATE_LOOKBACK) {
    const outcomes = raw.map(r => JSON.parse(r) as { pnlPct: number });
    const winRate  = outcomes.filter(o => o.pnlPct > 0).length / outcomes.length;
    if (winRate < WIN_RATE_FLOOR) {
      await redisPub.set('circuit:global:high_threshold', '1', 'EX', CIRCUIT_HIGH_THRESHOLD_SECONDS);
      log.warn({ winRate: (winRate * 100).toFixed(0) }, 'Circuit breaker: win rate < 30% — requiring score ≥ 90 for 2h');
    }
  }
}

// ─── Quarter-Kelly multiplier ────────────────────────────────────────────────
// Reads per-source EV data written by ai-brain (PROMPT 81) and returns a
// Quarter-Kelly fraction clamped to [0.5, 1.5].  Requires ≥10 trades to
// activate — falls back to 1.0 until there is enough data.

async function getKellyMultiplier(source: string): Promise<number> {
  const keys = await redisPub.mget(
    `ev:${source}:count`,
    `ev:${source}:win_count`,
    `ev:${source}:win_sum`,
    `ev:${source}:loss_count`,
    `ev:${source}:loss_sum`,
  );
  const count     = parseFloat(keys[0] ?? '0');
  const winCount  = parseFloat(keys[1] ?? '0');
  const winSum    = parseFloat(keys[2] ?? '0');
  const lossCount = parseFloat(keys[3] ?? '0');
  const lossSum   = parseFloat(keys[4] ?? '0');

  if (count < 10 || winCount === 0) return 1.0;

  const wr     = winCount / count;
  const avgWin = winSum  / winCount;
  const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
  const ev     = wr * avgWin - (1 - wr) * avgLoss;

  if (avgWin <= 0) return 1.0;

  const kelly = 0.25 * ev / avgWin;
  return Math.max(0.5, Math.min(1.5, kelly));
}

// ─── Risk check ───────────────────────────────────────────────────────────────

// Off-peak: +2 to minimum score (was +5 — too strict, blocked snipers at 85 completely).
// Snipers score exactly 85 and should not trade during low-liquidity off-peak hours.
// Social signals at 87+ can still trade at night. Circuit breaker handles bad-WR periods.
function tradingHoursScoreFloor(): number {
  const hour = new Date().getUTCHours();
  const isPeak = (hour >= 13 && hour < 18) || (hour >= 20);
  return isPeak ? 0 : 2;
}

async function processRiskCheck(aiSignal: AiSignal, safety: TokenSafety): Promise<void> {
  // Emergency stop check (OpenClaw critical fix)
  const emergencyStop = await redisPub.get('system:emergency_stop');
  if (emergencyStop) {
    log.warn({ contract: aiSignal.contractAddress }, 'Emergency stop active — signal blocked');
    return;
  }

  // For multi-tenant: look up all users who have trading enabled
  const usersRaw = await redisPub.smembers('users:live_trading');
  const users = usersRaw.length > 0 ? usersRaw : ['system'];

  for (const userId of users) {
    try {
      await checkAndEmitBuySignal(userId, aiSignal, safety);
    } catch (err) {
      log.warn({ err, userId }, 'Risk check failed for user');
    }
  }
}

// Plan tier → max open positions
const PLAN_MAX_POSITIONS: Record<string, number> = {
  free:    3,
  starter: 5,
  pro:     10,
  whale:   25,
};

async function checkAndEmitBuySignal(
  userId: string,
  aiSignal: AiSignal,
  safety: TokenSafety,
): Promise<void> {
  // Respect manual pause (set via /stop command)
  const isPaused = await redisPub.get(`trading:${userId}:paused`);
  if (isPaused) {
    log.debug({ userId }, 'Trading paused — skipped');
    return;
  }

  // Get portfolio value
  const portfolioRaw = await redisPub.get(`portfolio:${userId}:usd`);
  const portfolioUsd = portfolioRaw ? parseFloat(portfolioRaw) : DEFAULT_RISK.CAPITAL_TOTAL_USD;

  // Per-user capital ceiling (set during plan upgrade)
  const capitalRaw = await redisPub.get(`user:${userId}:capital_usd`);
  const effectiveCapital = capitalRaw ? Math.min(portfolioUsd, parseFloat(capitalRaw)) : portfolioUsd;

  // Daily loss guard
  const lossCheck = await dailyGuard.canTrade(userId, effectiveCapital);
  if (!lossCheck.allowed) {
    log.debug({ userId, reason: lossCheck.reason }, 'Daily loss guard blocked trade');
    return;
  }

  // Drawdown guard — update peak first so isBreached has accurate reference
  await drawdownMon.updatePeak(userId, effectiveCapital);
  const drawdownBreached = await drawdownMon.isBreached(userId, effectiveCapital);
  if (drawdownBreached) {
    log.debug({ userId }, 'Drawdown limit — trade blocked');
    return;
  }

  // Per-user max positions from plan (Bug 2 fix — was using global DEFAULT_RISK constant)
  const planTier = (await redisPub.get(`user:${userId}:plan`)) ?? 'free';
  const maxPositionsOverride = await redisPub.get(`user:${userId}:max_positions`);
  const maxPositions = maxPositionsOverride
    ? parseInt(maxPositionsOverride, 10)
    : (PLAN_MAX_POSITIONS[planTier] ?? DEFAULT_RISK.MAX_OPEN_POSITIONS);

  const openCountRaw = await redisPub.get(`portfolio:${userId}:open_count`);
  const openPositions = openCountRaw ? parseInt(openCountRaw, 10) : 0;

  // Global win-rate circuit breaker: require score ≥ 90 during losing streak
  const highThreshold = await redisPub.get('circuit:global:high_threshold');
  if (highThreshold && aiSignal.finalAiScore < HIGH_THRESHOLD_SCORE) {
    log.info({ userId, score: aiSignal.finalAiScore.toFixed(1), source: aiSignal.source ?? 'social' }, 'Circuit breaker: score < 90 — filtered');
    return;
  }

  // Auto-disabled source check (PROMPT 91): if EV < -5% after 20+ trades, source is paused 6h
  const src0 = aiSignal.source ?? 'social';
  const srcDisabled = await redisPub.get(`circuit:source:${src0}:disabled`);
  if (srcDisabled) {
    const ttlLeft = await redisPub.ttl(`circuit:source:${src0}:disabled`);
    log.info({ userId, source: src0, ttlLeft }, 'Source auto-disabled (negative EV) — skipped');
    return;
  }

  // PROMPT 14 — Per-wallet performance filter for copy_trade
  if (aiSignal.source === 'copy_trade' && aiSignal.copyTradeWallet) {
    const addr = aiSignal.copyTradeWallet;
    const [totalRaw, winsRaw] = await Promise.all([
      redisPub.get(`copy_trade:wallet:${addr}:total`),
      redisPub.get(`copy_trade:wallet:${addr}:wins`),
    ]);
    const total = parseInt(totalRaw ?? '0', 10);
    const wins  = parseInt(winsRaw  ?? '0', 10);
    if (total >= 5 && wins / total < 0.40) {
      log.info({ addr: addr.slice(0, 8), total, wins, wr: ((wins / total) * 100).toFixed(0) }, 'Copy-trade wallet WR < 40% — skipped');
      return;
    }
  }

  // Per-source concurrent position limits — snipers reduced in non-bull regimes (higher rug rate)
  const regimeForSrc = (await redisPub.get('market:regime').catch(() => null));
  const isBullRegime = regimeForSrc ? ['BULL', 'EXTREME_BULL'].includes((JSON.parse(regimeForSrc) as { regime: string }).regime) : false;
  const sniperMax    = isBullRegime ? 3 : 2;
  const SOURCE_MAX: Record<string, number> = { sniper: sniperMax, copy_trade: 5, social: 4, pump_graduation: 3 };
  const src = aiSignal.source ?? 'social';
  const srcMax = SOURCE_MAX[src] ?? 4;
  const posKeys = await redisPub.smembers(`positions:${userId}`);
  let srcCount = 0;
  for (const mint of posKeys) {
    const raw = await redisPub.hget(`position:${userId}:${mint}`, 'data');
    if (raw && (JSON.parse(raw) as { source?: string }).source === src) srcCount++;
  }
  if (srcCount >= srcMax) {
    log.debug({ userId, source: src, srcCount, srcMax }, 'Source slot limit reached — skipped');
    return;
  }

  // Social signals go through full Groq+Ollama scoring which tops out at ~83 for typical content.
  // Sniper/copy/grad signals have predefined scores 85-95 so don't need the reduction.
  const sourceAdjust = (aiSignal.source === 'social' || aiSignal.source == null) ? -5 : 0;
  const minScore = DEFAULT_RISK.MIN_SCORE_TO_BUY + tradingHoursScoreFloor() + sourceAdjust;

  // Apply SelfLearner calibration to signals that bypass ai-brain (sniper/copy/graduation)
  // Social signals are already calibrated by ai-brain before reaching here
  const isBypassSource = aiSignal.source === 'sniper' || aiSignal.source === 'copy_trade' || aiSignal.source === 'pump_graduation';
  let effectiveScore = aiSignal.finalAiScore;
  if (isBypassSource) {
    const multRaw = await redisPub.get('learning:score_multiplier');
    const mult = multRaw ? parseFloat(multRaw) : 1.0;
    effectiveScore = Math.min(aiSignal.finalAiScore * mult, 100);
  }

  if (effectiveScore < minScore) {
    log.info({ userId, score: effectiveScore.toFixed(1), rawScore: aiSignal.finalAiScore.toFixed(1), minScore, source: aiSignal.source ?? 'social' }, 'Score below threshold — skipped');
    return;
  }

  // Quarter-Kelly multiplier: grows size on profitable sources, shrinks on negative-EV ones
  const kellyMult = await getKellyMultiplier(src);

  // Size the position (sniper gets 40% of normal size — see PositionSizer)
  const sizeResult = calculatePositionSize(effectiveCapital, aiSignal.finalAiScore, openPositions, maxPositions, aiSignal.source, kellyMult);
  if (!sizeResult.allowed) {
    log.debug({ userId, reason: sizeResult.reason }, 'Position sizer blocked trade');
    return;
  }

  // Preserve signal source (copy_trade, pump_graduation, etc.)
  const source: BuySignal['source'] = (aiSignal.source as BuySignal['source']) ?? 'social';

  // Emit buy signal
  const buySignal: BuySignal = {
    contractAddress:   aiSignal.contractAddress,
    tokenSymbol:       aiSignal.tokenSymbol,
    finalScore:        aiSignal.finalAiScore,
    positionSizeUsd:   sizeResult.positionUsd,
    aiScore:           aiSignal.finalAiScore,
    safetyScore:       safety.overallScore,
    platformsDetected: aiSignal.platformsDetected,
    reasoning:         aiSignal.reasoning,
    source,
    userId,
    copyTradeWallet:   aiSignal.copyTradeWallet,
    createdAt:         new Date(),
  };

  await redisPub.publish('risk:buy_signal', JSON.stringify(buySignal));
  void redisPub.incr('stats:daily:risk_passed').then(n => { if (n === 1) redisPub.expire('stats:daily:risk_passed', 86_400).catch(() => null); }).catch(() => null);
  log.info({
    userId,
    contractAddress: aiSignal.contractAddress,
    positionUsd: sizeResult.positionUsd.toFixed(2),
    score: aiSignal.finalAiScore.toFixed(1),
    plan: planTier,
    source,
  }, 'Buy signal emitted');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Risk Engine worker starting…');

  const hb = setInterval(() => {
    void redisPub.set('heartbeat:risk-engine', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redisPub.set('heartbeat:risk-engine', String(Date.now()), 'EX', 300).catch(() => null);

  log.info('Risk Engine worker ready — subscribed to safety:passed');

  process.on('SIGTERM', () => {
    clearInterval(hb);
    redisSub.disconnect();
    redisPub.disconnect();
    log.info('Graceful shutdown complete');
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});
