import 'dotenv/config';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';
import type { RawSignal, Trade } from '@mpg2/shared';
import { calculateAiScore } from './ScoreCalculator.js';
import { RegimeDetector }   from './models/RegimeDetector.js';
import { SelfLearner }      from './SelfLearner.js';
import { isAvailable }      from './ollama/OllamaClient.js';
import { isGroqAvailable }  from './groq/GroqClient.js';

const log = createLogger('ai-brain-worker');

const redisConn = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const redisPub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const queue   = new Queue('ai-brain', { connection: redisConn });
const regime  = new RegimeDetector(redisPub);
const learner = new SelfLearner(redisPub);

// Buffer: contract → signals received so far (cleared after processing)
const signalBuffer = new Map<string, RawSignal[]>();

// ─── Velocity tracker ─────────────────────────────────────────────────────────
// Records signal timestamps per contract to detect acceleration patterns.
// Example: 3 signals in window T-1 → 9 signals in window T = 3x acceleration → score boost.

const velocityTs = new Map<string, number[]>(); // contract → Unix ms timestamps
const VEL_WINDOW  = 15 * 60 * 1_000;           // 15-min comparison window

function recordVelocity(contract: string): void {
  const now = Date.now();
  const ts  = velocityTs.get(contract) ?? [];
  ts.push(now);
  // Keep only the last 30 min (two full windows)
  const cutoff = now - 2 * VEL_WINDOW;
  velocityTs.set(contract, ts.filter(t => t >= cutoff));
}

function velocityBonus(contract: string): number {
  const now  = Date.now();
  const ts   = velocityTs.get(contract) ?? [];
  const curr = ts.filter(t => t >= now - VEL_WINDOW).length;
  const prev = ts.filter(t => t >= now - 2 * VEL_WINDOW && t < now - VEL_WINDOW).length;
  if (prev === 0 || curr < 4) return 0; // need at least 4 signals in recent window
  const ratio = curr / prev;
  if (ratio >= 4) return 12; // 4× acceleration — rare, very bullish
  if (ratio >= 2) return 7;  // 2× acceleration — solid momentum
  if (ratio >= 1.5) return 3; // 1.5× — mild uptick
  return 0;
}

// Prune stale velocity data every 10 minutes (contracts with no recent signals)
setInterval(() => {
  const cutoff = Date.now() - 2 * VEL_WINDOW;
  for (const [contract, ts] of velocityTs) {
    const fresh = ts.filter(t => t >= cutoff);
    if (fresh.length === 0) velocityTs.delete(contract);
    else velocityTs.set(contract, fresh);
  }
}, 10 * 60_000);

// ─── Redis subscriber — collect raw signals ───────────────────────────────────

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const SELL_TYPES = new Set(['SELL_TP1','SELL_TP2','SELL_TP3','SELL_STOP_LOSS','SELL_TRAILING','SELL_MANUAL','SELL_DEV_RUG','SELL_TIMEOUT']);

const subscribeChannels = (): void => {
  void redisSub.subscribe('social:raw_signal', 'trade:executed', err => {
    if (err) log.error({ err }, 'Failed to subscribe');
  });
};
subscribeChannels();

redisSub.on('error', err => log.warn({ err }, 'redisSub error'));
redisSub.on('ready', () => {
  log.info('redisSub reconnected — re-subscribing');
  subscribeChannels();
});

// Track buy times in-memory to compute holdMinutes for SelfLearner
// Key: `${userId}:${contractAddress}`, Value: Unix ms timestamp
const buyTimes = new Map<string, number>();

redisSub.on('message', (channel, message) => {
  if (channel === 'social:raw_signal') {
    try {
      const signal = JSON.parse(message) as RawSignal;
      if (!signal.contractAddress) return;

      recordVelocity(signal.contractAddress);

      const existing = signalBuffer.get(signal.contractAddress) ?? [];
      existing.push(signal);
      signalBuffer.set(signal.contractAddress, existing);

      // Queue for AI scoring when we have ≥2 signals for a contract
      if (existing.length >= 2) {
        void queue.add('score-contract', { contractAddress: signal.contractAddress, queuedAt: Date.now() }, {
          jobId:            `score-${signal.contractAddress}`,
          removeOnComplete: true,
          removeOnFail:     true,
        });
      }
    } catch { /* ignore malformed */ }
    return;
  }

  if (channel === 'trade:executed') {
    try {
      const trade = JSON.parse(message) as Trade;
      const key = `${trade.userId}:${trade.contractAddress}`;

      if (trade.tradeType === 'BUY') {
        buyTimes.set(key, Date.now());
        return;
      }

      if (!SELL_TYPES.has(trade.tradeType) || trade.pnlPct == null) return;

      const buyMs = buyTimes.get(key);
      const holdMinutes = buyMs ? Math.round((Date.now() - buyMs) / 60_000) : 0;
      buyTimes.delete(key);

      void learner.recordOutcome({
        contractAddress: trade.contractAddress,
        aiScore:         trade.finalScore,
        pnlPct:          trade.pnlPct,
        exitReason:      trade.tradeType,
        holdMinutes,
      }).catch(err => log.warn({ err }, 'recordOutcome failed'));

      // Per-source EV tracking (used by /stats and PROMPT 91 auto-disable)
      if (trade.source) {
        const src = trade.source;
        const pnl = trade.pnlPct * 100;
        void Promise.all([
          redisPub.incrbyfloat(`ev:${src}:pnl_sum`, pnl),
          redisPub.incr(`ev:${src}:count`),
          pnl > 0
            ? Promise.all([redisPub.incrbyfloat(`ev:${src}:win_sum`, pnl), redisPub.incr(`ev:${src}:win_count`)])
            : Promise.all([redisPub.incrbyfloat(`ev:${src}:loss_sum`, Math.abs(pnl)), redisPub.incr(`ev:${src}:loss_count`)]),
        ]).catch(() => null);
      }
    } catch { /* ignore malformed */ }
  }
});

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function handleScoreContract(contractAddress: string, queuedAt?: number): Promise<void> {
  // Drop ghost jobs — no buffer data means signal is stale or already processed
  if (queuedAt && Date.now() - queuedAt > 20 * 60 * 1_000) {
    signalBuffer.delete(contractAddress);
    return;
  }

  const signals = signalBuffer.get(contractAddress) ?? [];
  signalBuffer.delete(contractAddress);

  if (signals.length === 0) return;

  const aiSignal = await calculateAiScore(contractAddress, signals);
  if (!aiSignal) return;

  // Apply self-learner calibration
  const regimeData   = await regime.getCurrent();
  const multiplier   = await learner.getScoreMultiplier(70);
  // Cache multiplier in Redis so risk-engine can apply to sniper/copy/graduation signals too
  void redisPub.set('learning:score_multiplier', String(multiplier.toFixed(4)), 'EX', 3_600).catch(() => null);
  const calibrated   = Math.min(aiSignal.finalAiScore * multiplier, 100);

  // Velocity acceleration bonus: rewards tokens with rapidly increasing mention rate
  const velBonus = velocityBonus(contractAddress);
  const boosted  = Math.min(calibrated + velBonus, 100);

  if (boosted < regimeData.minScore) {
    log.debug({ contractAddress, boosted, minScore: regimeData.minScore }, 'Score below regime threshold — skipped');
    void redisPub.incr('stats:daily:ai_filtered').then(n => { if (n === 1) redisPub.expire('stats:daily:ai_filtered', 86_400).catch(() => null); }).catch(() => null);
    return;
  }

  void redisPub.incr('stats:daily:ai_passed').then(n => { if (n === 1) redisPub.expire('stats:daily:ai_passed', 86_400).catch(() => null); }).catch(() => null);

  if (velBonus > 0) {
    log.info({ contractAddress: contractAddress.slice(0, 8), velBonus, boosted: boosted.toFixed(1) }, 'Velocity acceleration bonus applied');
  }

  const enriched = { ...aiSignal, finalAiScore: boosted, passedToSafety: true };
  await redisPub.publish('ai:signal', JSON.stringify(enriched));
  log.info({ contractAddress, score: boosted.toFixed(1), platforms: aiSignal.platformCount }, 'Signal passed to safety');
}

async function handleUpdateRegime(): Promise<void> {
  await regime.detect();
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker('ai-brain', async (job: Job) => {
  switch (job.name) {
    case 'score-contract':  return handleScoreContract(job.data.contractAddress as string, job.data.queuedAt as number | undefined);
    case 'update-regime':   return handleUpdateRegime();
    default: log.warn({ jobName: job.name }, 'unknown job');
  }
}, { connection: redisConn, concurrency: 2, lockDuration: 120_000, lockRenewTime: 30_000 });

worker.on('failed',    (job, err) => log.error({ err, jobName: job?.name }, 'job failed'));
worker.on('completed', job        => log.debug({ jobName: job.name }, 'job done'));

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('AI Brain worker starting…');

  if (isGroqAvailable()) {
    log.info('Groq fast-path ACTIVE — sentiment via llama-3.1-8b-instant (~200ms)');
  }

  const ollamaOk = await isAvailable();
  if (!ollamaOk) {
    log.warn('Ollama not reachable — using keyword heuristics for sentiment/narrative scoring (scores still valid)');
  } else {
    log.info('Ollama connected — LLM scoring active');
  }

  // Regime detection every 15 minutes
  await queue.upsertJobScheduler('update-regime', { every: 900_000 }, { name: 'update-regime', data: {} });

  // Immediate regime detection
  await queue.add('update-regime', {}, { priority: 1 });

  const hb = setInterval(() => {
    void redisPub.set('heartbeat:ai-brain', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redisPub.set('heartbeat:ai-brain', String(Date.now()), 'EX', 300).catch(() => null);

  // Log SelfLearner stats every 30 minutes
  setInterval(async () => {
    try {
      const stats = await learner.getStats();
      if (stats.totalTrades === 0) return;
      const multiplier = await learner.getScoreMultiplier(70);
      log.info({
        totalTrades: stats.totalTrades,
        winRate:     `${stats.winRate.toFixed(1)}%`,
        avgPnl:      `${stats.avgPnl.toFixed(2)}%`,
        avgAiScore:  stats.avgAiScore.toFixed(1),
        scoreMultiplier: multiplier.toFixed(2),
        calibrationActive: stats.totalTrades >= 20,
      }, 'SelfLearner stats');
    } catch { /* non-critical */ }
  }, 30 * 60_000);

  log.info('AI Brain worker ready');

  process.on('SIGTERM', async () => {
    clearInterval(hb);
    redisSub.disconnect();
    await worker.close();
    await queue.close();
    redisConn.disconnect();
    redisPub.disconnect();
    log.info('Graceful shutdown complete');
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});
