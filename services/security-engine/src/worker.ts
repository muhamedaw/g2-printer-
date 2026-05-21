import 'dotenv/config';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { createLogger, DEFAULT_RISK } from '@mpg2/shared';
import type { AiSignal, TokenSafety } from '@mpg2/shared';
import { rugCheck }            from './checkers/RugChecker.js';
import { isHoneypot }          from './checkers/HoneypotChecker.js';
import { checkLiquidity }      from './checkers/LiquidityChecker.js';
import { checkHolders }        from './checkers/HolderChecker.js';
import { checkMintAuthority }  from './checkers/MintChecker.js';
import { DnaChecker }          from './checkers/DnaChecker.js';
import { SafetyCache }         from './SafetyCache.js';
import { checkGoPlus }         from './checkers/GoPlusChecker.js';

const log = createLogger('security-engine-worker');

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

const queue  = new Queue('security-engine', { connection: redisConn });
const dna    = new DnaChecker(redisPub);
const cache  = new SafetyCache(redisPub);

// ─── Redis subscriber — respond to AI signals ─────────────────────────────────

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const subscribeChannels = (): void => {
  void redisSub.subscribe('ai:signal', err => {
    if (err) log.error({ err }, 'Failed to subscribe to ai:signal');
  });
};
subscribeChannels();

redisSub.on('error', err => log.warn({ err }, 'redisSub error'));
redisSub.on('ready', () => {
  log.info('redisSub reconnected — re-subscribing');
  subscribeChannels();
});

redisSub.on('message', (_channel, message) => {
  const signal = JSON.parse(message) as AiSignal;
  void redisPub.incr('stats:daily:signals_received').then(n => { if (n === 1) redisPub.expire('stats:daily:signals_received', 86_400).catch(() => null); }).catch(() => null);
  void queue.add('check-token', { contractAddress: signal.contractAddress, aiSignal: signal }, {
    jobId: `safety-${signal.contractAddress}`,
    removeOnComplete: true,
  });
});

// ─── Core safety check ────────────────────────────────────────────────────────

async function fetchHolderCount(mint: string): Promise<number> {
  const apiKey = process.env['HELIUS_API_KEY'];
  if (!apiKey) return 0;
  try {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTokenSupply',
        params: [mint],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return 0;
    // getTokenSupply doesn't give holder count; use getTokenAccounts pagination count approximation
    const res2 = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'getTokenLargestAccounts',
        params: [mint],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const data = await res2.json() as { result?: { value?: unknown[] } };
    return data.result?.value?.length ?? 0;
  } catch { return 0; }
}

async function fullSafetyCheck(contractAddress: string, liquidityUsd: number): Promise<TokenSafety> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_RISK.SAFETY_CACHE_MINUTES * 60_000);

  const isPumpToken = contractAddress.endsWith('pump');

  // Run all checks in parallel — skip mint check for pump.fun tokens (bonding curve
  // always holds mint authority; check is meaningless until graduation)
  const [rug, honeypot, mint, holderCount, goplus] = await Promise.all([
    rugCheck(contractAddress),
    isHoneypot(contractAddress),
    isPumpToken
      ? Promise.resolve<import('./checkers/MintChecker.js').MintCheckResult>({ mintAuthorityRevoked: false, freezeAuthorityRevoked: false, passed: true })
      : checkMintAuthority(contractAddress),
    fetchHolderCount(contractAddress),
    checkGoPlus(contractAddress, isPumpToken),
  ]);
  const topHolders = rug.topHolders ?? [];

  // For pump.fun bonding-curve tokens, the curve contract is the "top holder" (100%).
  // Pass holder check with 0 (unknown) so the check is skipped — real distribution
  // only matters post-graduation when we check via rugcheck topHolders.
  const holderResult = checkHolders(isPumpToken ? 0 : holderCount, isPumpToken ? [] : topHolders);
  // Graduation/bonding-curve signals have fresh liquidity — relax minimum floor
  const relaxMin = isPumpToken || liquidityUsd < DEFAULT_RISK.MIN_LIQUIDITY_USD;
  const liquidityResult = checkLiquidity(liquidityUsd, relaxMin);
  const dnaResult = await dna.check(contractAddress, '');

  const rejectionReasons: string[] = [];
  if (honeypot)                             rejectionReasons.push('Honeypot detected');
  if (goplus.isHoneypot && !honeypot)       rejectionReasons.push('GoPlus: token cannot be sold');
  if (!goplus.passed && goplus.rejectionReason && !goplus.isHoneypot) rejectionReasons.push(goplus.rejectionReason);
  if (!mint.passed && mint.rejectionReason) rejectionReasons.push(mint.rejectionReason);
  if (!holderResult.passed && holderResult.rejectionReason) rejectionReasons.push(holderResult.rejectionReason);
  if (!liquidityResult.passed && liquidityResult.rejectionReason) rejectionReasons.push(liquidityResult.rejectionReason);
  if (dnaResult.matched && dnaResult.reason) rejectionReasons.push(dnaResult.reason);
  // rugcheck.xyz scores are NOT 0-100; they're raw cumulative risk scores (0-50000+).
  // pump.fun tokens always score high (bonding curve flags). Use a high threshold
  // and disable for pump tokens (rugcheck flags pump.fun mechanics as risky by design).
  const rugThreshold = isPumpToken ? Infinity : 15_000;
  if (rug.score > rugThreshold)       rejectionReasons.push(`High rug score: ${rug.score}`);

  const passed = rejectionReasons.length === 0;

  // Normalize overallScore: clamp rugcheck raw score to 0-100 (lower raw = safer)
  const overallScore = Math.max(0, Math.round(100 - Math.min(rug.score / 500, 100)));
  return {
    tokenAddress:           contractAddress,
    overallScore,
    mintAuthorityRevoked:   mint.mintAuthorityRevoked,
    freezeAuthorityRevoked: mint.freezeAuthorityRevoked,
    topHolderPct:           holderResult.topHolderPct,
    top10HoldersPct:        holderResult.top10HoldersPct,
    holderCount:            holderResult.holderCount,
    giniCoefficient:        holderResult.giniCoefficient,
    isHoneypot:             honeypot,
    liquidityUsd,
    tokenAgeMinutes:        0,
    buySellRatio:           0,
    rugcheckScore:          rug.score,
    dnaMatchFound:          dnaResult.matched,
    ...(rejectionReasons.length > 0 ? { rejectionReason: rejectionReasons[0] } : {}),
    passed,
    checkedAt:  now,
    expiresAt,
  };
}

// ─── Job handler ──────────────────────────────────────────────────────────────

const SCAM_SYMBOL_PATTERNS = [
  /^\d{2}\/\d{2}\/\d{4}$/,                      // date: 06/22/2027
  /^\d{2}-\d{2}-\d{4}$/,                        // date with dashes
  /^(rug|scam|test|fake|honeypot)/i,             // explicit scam labels
  /^\d+$/,                                        // numbers only
  /^[^a-zA-Z0-9]+$/,                             // punctuation only (e.g. ".")
  /^.{1}$/,                                       // single character
  /offic[^i]al/i,                                // OFFICAL (missing i in OFFICIAL)
  /^(official|offical|off1cial|offi[ck]ial)/i,  // impersonation "official" tokens
  /^(admin|founder|team|dev|ceo|insider|alpha|vip)$/i, // authority impersonation
];

async function handleCheckToken(contractAddress: string, aiSignal: AiSignal): Promise<void> {
  // Scam symbol filter — reject obvious scam token names before any checks
  const sym = aiSignal.tokenSymbol ?? '';
  if (sym && SCAM_SYMBOL_PATTERNS.some(p => p.test(sym))) {
    log.info({ contractAddress: contractAddress.slice(0, 8), sym }, 'Scam symbol pattern — rejected');
    return;
  }

  // Check cache first
  const cached = await cache.get(contractAddress);
  if (cached) {
    if (cached.passed) {
      await redisPub.publish('safety:passed', JSON.stringify({ aiSignal, safety: cached }));
    }
    return;
  }

  // Get liquidity from market data Redis cache
  const tokenDataRaw = await redisPub.get(`token:${contractAddress}`);
  const liquidityUsd = tokenDataRaw
    ? (JSON.parse(tokenDataRaw) as { liquidityUsd?: number }).liquidityUsd ?? 0
    : 0;

  const safety = await fullSafetyCheck(contractAddress, liquidityUsd);
  await cache.set(safety);

  if (safety.passed) {
    log.info({ contractAddress, score: safety.overallScore }, 'Safety PASSED — forwarding to risk engine');
    void redisPub.incr('stats:daily:security_passed').then(n => { if (n === 1) redisPub.expire('stats:daily:security_passed', 86_400).catch(() => null); }).catch(() => null);
    await redisPub.publish('safety:passed', JSON.stringify({ aiSignal, safety }));
  } else {
    log.info({ contractAddress: contractAddress.slice(0, 8), reason: safety.rejectionReason, topHolder: safety.topHolderPct?.toFixed(0) + '%', top10: safety.top10HoldersPct?.toFixed(0) + '%', rugScore: safety.rugcheckScore, holders: safety.holderCount }, 'Safety FAILED');
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker('security-engine', async (job: Job) => {
  if (job.name === 'check-token') {
    return handleCheckToken(job.data.contractAddress as string, job.data.aiSignal as AiSignal);
  }
  log.warn({ jobName: job.name }, 'unknown job');
}, { connection: redisConn, concurrency: 5 });

worker.on('failed',    (job, err) => log.error({ err, jobName: job?.name }, 'job failed'));
worker.on('completed', job        => log.debug({ jobName: job.name }, 'job done'));

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Security Engine worker starting…');

  const hb = setInterval(() => {
    void redisPub.set('heartbeat:security-engine', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redisPub.set('heartbeat:security-engine', String(Date.now()), 'EX', 300).catch(() => null);

  log.info('Security Engine worker ready');

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
