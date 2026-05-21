import 'dotenv/config';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { createLogger, type TokenSnapshot } from '@mpg2/shared';
import { getTrendingTokens, getNewPairs, getTokensByMints } from './collectors/dexscreener.js';
import { enrichTokens } from './collectors/rugcheck.js';
import { isHoneypot } from './collectors/jupiter.js';
import { PumpFunCollector } from './collectors/pump.js';
import { HeliusCollector } from './collectors/helius.js';
import { PatternClassifier } from './whale-tracker/PatternClassifier.js';
import { WalletRegistry } from './whale-tracker/WalletRegistry.js';
import { CopyTradeDetector } from './whale-tracker/CopyTradeDetector.js';
import { startHeliusWebhookServer } from './whale-tracker/HeliusWebhookServer.js';
import { MetricsCollector } from './metrics/MetricsCollector.js';

const log = createLogger('market-data-worker');

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

const queue    = new Queue('market-data', { connection: redisConn });
const metrics    = new MetricsCollector(redisPub);
const helius     = new HeliusCollector(redisPub);
const detector   = new CopyTradeDetector(redisPub);
const registry   = new WalletRegistry(redisPub);
const pump       = new PumpFunCollector(redisPub);

// ─── Copy signal → buy signal bridge ─────────────────────────────────────────
// When a tracked whale buys, forward to risk engine as a copy_trade source

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

redisSub.subscribe('whale:copy_signal', 'whale:add_request', 'market:graduation', 'market:new_token', 'market:bonding_curve_peak', err => {
  if (err) log.error({ err }, 'redisSub subscribe failed');
});

redisSub.on('message', (ch, msg) => {
  if (ch === 'whale:add_request') {
    const req = JSON.parse(msg) as { address: string; nickname: string | null };
    void registry.addWallet(req.address, req.nickname ?? undefined).catch(err =>
      log.warn({ err, address: req.address }, 'addWallet failed')
    );
    return;
  }

  if (ch === 'whale:copy_signal') {
    const signal = JSON.parse(msg) as import('./whale-tracker/CopyTradeDetector.js').CopySignal;
    metrics.incCopySignals();
    void emitCopyTradeBuySignal(signal).catch(err =>
      log.warn({ err }, 'copy trade buy signal failed'),
    );
    return;
  }

  if (ch === 'market:graduation') {
    const event = JSON.parse(msg) as { mint: string; symbol?: string };
    void emitGraduationBuySignal(event.mint, event.symbol).catch(err =>
      log.warn({ err }, 'graduation buy signal failed'),
    );
    return;
  }

  if (ch === 'market:new_token') {
    const event = JSON.parse(msg) as { mint: string; symbol?: string; marketCapSol?: number };
    // Track tokens with real early traction (≥5 SOL MC at launch) for bonding curve monitoring
    if ((event.marketCapSol ?? 0) >= 5) {
      pump.watchCurve(event.mint);
    }
    return;
  }

  if (ch === 'market:bonding_curve_peak') {
    const event = JSON.parse(msg) as { mint: string; symbol?: string; fillPct: number };
    void emitBondingCurveBuySignal(event.mint, event.symbol, event.fillPct).catch(err =>
      log.warn({ err }, 'bonding curve buy signal failed'),
    );
  }
});

// ─── Copy trade + Graduation → risk:buy_signal bridge ────────────────────────

async function fetchAndCachePrice(mint: string): Promise<number | null> {
  try {
    const snaps = await getTokensByMints([mint]);
    const snap = snaps[0];
    const price = snap?.priceUsd ?? null;
    if (price && price > 0) {
      const liquidityUsd = snap?.liquidityUsd ?? 0;
      await Promise.all([
        redisPub.set(`token:${mint}`, JSON.stringify({ priceUsd: price, liquidityUsd }), 'EX', 120),
        redisPub.set(`token:${mint}:price`, String(price), 'EX', 120),
        redisPub.set(`token:${mint}:first_price`, String(price), 'EX', 86_400, 'NX'),
        redisPub.set(`token:${mint}:first_seen`, String(Date.now()), 'EX', 86_400, 'NX'),
      ]);
    }
    return price;
  } catch { return null; }
}

async function emitCopyTradeBuySignal(
  signal: import('./whale-tracker/CopyTradeDetector.js').CopySignal,
): Promise<void> {
  const price = await fetchAndCachePrice(signal.tokenMint);
  if (!price) {
    log.debug({ mint: signal.tokenMint }, 'Copy trade: no price available — skipped');
    return;
  }

  // Track whale rotation: record this wallet's buy and count unique wallets in last 2h
  const rotKey      = `whale:rotation:${signal.tokenMint}`;
  const twoHrsAgo   = Date.now() - 2 * 60 * 60 * 1_000;
  await redisPub.zadd(rotKey, Date.now(), signal.wallet);
  await redisPub.expire(rotKey, 4 * 60 * 60);
  await redisPub.zremrangebyscore(rotKey, '-inf', twoHrsAgo);
  const rotCount = await redisPub.zcard(rotKey);

  // Score = wallet quality base + rotation bonus (multiple whales = high conviction)
  let baseScore = 50 + (signal.walletScore / 2);
  const rotBonus = rotCount >= 5 ? 15 : rotCount >= 3 ? 10 : rotCount >= 2 ? 5 : 0;
  const finalScore = Math.min(baseScore + rotBonus, 100);

  if (rotBonus > 0) {
    log.info(
      { mint: signal.tokenMint.slice(0, 8), rotCount, rotBonus, score: finalScore.toFixed(0) },
      'Whale rotation detected — score boosted',
    );
  }

  const reasoning = rotBonus > 0
    ? `Copy trade: ${rotCount} tracked wallets bought in 2h (rotation bonus +${rotBonus}). Lead: ${signal.wallet.slice(0, 8)}`
    : `Copy trade from wallet ${signal.wallet.slice(0, 8)} (score: ${signal.walletScore})`;

  const aiSignal = {
    contractAddress:    signal.tokenMint,
    sentimentScore:     baseScore,
    authenticityScore:  signal.walletScore,
    trendScore:         finalScore,
    narrativeFreshness: 80,
    finalAiScore:       finalScore,
    platformsDetected:  ['twitter' as const],
    platformCount:      1,
    influencerCount:    rotCount,
    reasoning,
    passedToSafety:     false,
    source:             'copy_trade' as const,
    createdAt:          new Date(),
  };
  await redisPub.publish('ai:signal', JSON.stringify(aiSignal));
  log.info({ wallet: signal.wallet.slice(0, 8), mint: signal.tokenMint.slice(0, 8), score: finalScore.toFixed(0), rotCount }, 'Copy trade → security engine');
}

async function emitGraduationBuySignal(mint: string, symbol?: string): Promise<void> {
  // Wait 30s to let PumpSwap liquidity settle and confirm real buy pressure
  await new Promise(r => setTimeout(r, 30_000));

  // Reject if dev wallet already dumped during the 30s wait
  const creatorWallet = await redisPub.get(`token:${mint}:creator`);
  const firstSeenRaw  = await redisPub.get(`token:${mint}:first_seen`);
  if (creatorWallet && firstSeenRaw) {
    const devSold = await helius.checkWalletSoldMint(creatorWallet, mint, parseInt(firstSeenRaw)).catch(() => false);
    if (devSold) {
      log.warn({ mint: mint.slice(0, 8) }, 'Graduation: dev already sold — skipped (rug prevention)');
      return;
    }
  }

  const price = await fetchAndCachePrice(mint);
  if (!price) {
    log.debug({ mint }, 'Graduation: no price available — skipped');
    return;
  }

  const aiSignal = {
    contractAddress:    mint,
    tokenSymbol:        symbol,
    sentimentScore:     90,
    authenticityScore:  85,
    trendScore:         92,
    narrativeFreshness: 95,
    finalAiScore:       90,
    platformsDetected:  ['news' as const],
    platformCount:      1,
    influencerCount:    0,
    reasoning:          'Pump.fun bonding curve fully filled — graduated to PumpSwap (highest conviction entry)',
    passedToSafety:     false,
    source:             'pump_graduation' as const,
    createdAt:          new Date(),
  };
  await redisPub.publish('ai:signal', JSON.stringify(aiSignal));
  log.info({ mint: mint.slice(0, 8), symbol }, 'Graduation → security engine');
}

async function emitBondingCurveBuySignal(mint: string, symbol?: string, fillPct = 0.75): Promise<void> {
  const price = await fetchAndCachePrice(mint);
  if (!price) {
    log.debug({ mint }, 'Bonding curve: no price available — skipped');
    return;
  }

  // Reject if dev already sold (same check as graduation)
  const creatorWallet = await redisPub.get(`token:${mint}:creator`);
  const firstSeenRaw  = await redisPub.get(`token:${mint}:first_seen`);
  if (creatorWallet && firstSeenRaw) {
    const devSold = await helius.checkWalletSoldMint(creatorWallet, mint, parseInt(firstSeenRaw)).catch(() => false);
    if (devSold) {
      log.warn({ mint: mint.slice(0, 8) }, 'Bonding curve: dev already sold — skipped');
      return;
    }
  }

  const fillPctStr = (fillPct * 100).toFixed(0);
  const aiSignal = {
    contractAddress:    mint,
    tokenSymbol:        symbol,
    sentimentScore:     80,
    authenticityScore:  88,
    trendScore:         92,
    narrativeFreshness: 90,
    finalAiScore:       87,
    platformsDetected:  ['news' as const],
    platformCount:      1,
    influencerCount:    0,
    reasoning:          `Bonding curve ${fillPctStr}% filled — prime entry before graduation pump`,
    passedToSafety:     false,
    source:             'pump_graduation' as const,
    createdAt:          new Date(),
  };
  await redisPub.publish('ai:signal', JSON.stringify(aiSignal));
  log.info({ mint: mint.slice(0, 8), symbol, fill: fillPctStr + '%' }, 'Bonding curve peak → security engine');
}

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function cacheSolPrice(): Promise<void> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return;
    const data = await res.json() as { solana?: { usd?: number; usd_24h_change?: number } };
    const price     = data.solana?.usd;
    const change24h = data.solana?.usd_24h_change;
    if (price)     await redisPub.set('sol:price_usd', String(price), 'EX', 300);
    if (change24h != null) await redisPub.set('market:sol_price_change_24h', String(change24h), 'EX', 600);
  } catch { /* ignore */ }
}

async function handleCollectPrices(): Promise<void> {
  const [trending, newPairs] = await Promise.all([
    getTrendingTokens().catch(() => [] as TokenSnapshot[]),
    getNewPairs(20).catch(() => [] as TokenSnapshot[]),
  ]);

  const combined = dedup([...trending, ...newPairs]);
  const enriched = await enrichTokens(combined);

  // Cache full token data for security engine + trade engine
  for (const t of enriched) {
    if (t.priceUsd > 0) {
      await Promise.all([
        redisPub.set(`token:${t.mint}`, JSON.stringify({ priceUsd: t.priceUsd, liquidityUsd: t.liquidityUsd }), 'EX', 120),
        redisPub.set(`token:${t.mint}:price`, String(t.priceUsd), 'EX', 120),
        redisPub.set(`token:${t.mint}:first_price`, String(t.priceUsd), 'EX', 86_400, 'NX'),
        redisPub.set(`token:${t.mint}:first_seen`, String(Date.now()), 'EX', 86_400, 'NX'),
      ]);
    }
  }

  // Honeypot filter on first 10
  const sample = enriched.slice(0, 10);
  const honeypotFlags = await Promise.all(sample.map(t => isHoneypot(t.mint).catch(() => false)));
  const safe = enriched.filter((_, i) => i >= 10 || !honeypotFlags[i]);

  metrics.incTokensScanned(safe.length);
  metrics.incPriceUpdates(safe.filter(t => t.priceUsd > 0).length);
  await redisPub.publish('market:token_data', JSON.stringify(safe));
  log.info({ count: safe.length }, 'collect-prices done');
}

async function handleCollectNewTokens(): Promise<void> {
  const fresh = await getNewPairs(5).catch(() => [] as TokenSnapshot[]);
  for (const t of fresh) {
    if (t.priceUsd > 0) {
      await Promise.all([
        redisPub.set(`token:${t.mint}`, JSON.stringify({ priceUsd: t.priceUsd, liquidityUsd: t.liquidityUsd }), 'EX', 120),
        redisPub.set(`token:${t.mint}:price`, String(t.priceUsd), 'EX', 120),
        redisPub.set(`token:${t.mint}:first_price`, String(t.priceUsd), 'EX', 86_400, 'NX'),
        redisPub.set(`token:${t.mint}:first_seen`, String(Date.now()), 'EX', 86_400, 'NX'),
      ]);
    }
    await redisPub.publish('market:new_token', JSON.stringify({ mint: t.mint, source: 'dex_new_pair', detectedAt: new Date().toISOString() }));
  }
}

// Track seen txSigs to avoid re-processing
const seenTxSigs = new Set<string>();

async function handleScanWallets(): Promise<void> {
  const active = await registry.getActive();
  if (active.length === 0) return;

  const addresses = active.map(w => w.walletAddress);

  // Poll recent swaps via Helius (works without public webhook URL)
  const swaps = await helius.pollWalletSwaps(addresses).catch(() => []);
  let copySignals = 0;

  for (const swap of swaps) {
    if (seenTxSigs.has(swap.txSig)) continue;
    seenTxSigs.add(swap.txSig);
    if (seenTxSigs.size > 5000) {
      const first = seenTxSigs.values().next().value;
      if (first) seenTxSigs.delete(first);
    }

    if (swap.side !== 'buy' || swap.solAmount < 0.1) continue;

    const scoreRaw = await redisPub.hget('whale:scores', swap.wallet);
    if (!scoreRaw) continue;

    const { score, copyWeight } = JSON.parse(scoreRaw) as { score: number; copyWeight: number };
    if (score < 50) continue;

    const solPriceRaw = await redisPub.get('sol:price_usd');
    const solPrice = solPriceRaw ? parseFloat(solPriceRaw) : 150;
    const usdAmount = swap.solAmount * solPrice;

    const copySignal = {
      wallet:      swap.wallet,
      tokenMint:   swap.mint,
      usdAmount,
      copyWeight,
      walletScore: score,
    };
    await redisPub.publish('whale:copy_signal', JSON.stringify(copySignal));
    copySignals++;
  }

  if (copySignals > 0) log.info({ copySignals }, 'Copy signals from wallet polling');

  // Re-classify stale wallets
  const stale = active.filter(w => {
    const lastTrade = w.lastTradeAt ? new Date(w.lastTradeAt).getTime() : 0;
    return Date.now() - lastTrade > 86_400_000;
  }).slice(0, 3);

  for (const wallet of stale) {
    const profile = await new PatternClassifier().classify(wallet.walletAddress).catch(() => null);
    if (profile && profile.pattern !== 'unknown') {
      await registry.updatePerformance(wallet.walletAddress, profile.winRate > 50, profile.winRate / 100);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  log.debug({ active: active.length, stale: stale.length }, 'wallet scan done');
}

const DEV_SELL_MIN_AGE_MS = 5 * 60 * 1_000; // wait 5 min before checking (give TP a chance)

async function handleWatchDevSells(): Promise<void> {
  const mints = await redisPub.smembers('dev:mints:active');
  if (mints.length === 0) return;

  for (const mint of mints) {
    const wallet = await redisPub.get(`dev:${mint}:wallet`);
    if (!wallet) {
      await redisPub.srem('dev:mints:active', mint);
      continue;
    }
    const launchRaw = await redisPub.get(`dev:${mint}:launch`);
    const launchMs  = launchRaw ? Number(launchRaw) : 0;

    // Skip positions younger than 5 min — let TP/SL handle them first
    if (launchMs && Date.now() - launchMs < DEV_SELL_MIN_AGE_MS) {
      continue;
    }

    const sold = await helius.checkWalletSoldMint(wallet, mint, launchMs).catch(() => false);
    if (sold) {
      log.warn({ mint: mint.slice(0, 8), wallet: wallet.slice(0, 8) }, 'DEV SELL detected — rug warning');
      await redisPub.publish('market:dev_sell', JSON.stringify({ mint, wallet }));
      await redisPub.srem('dev:mints:active', mint);
      await redisPub.del(`dev:${mint}:wallet`, `dev:${mint}:launch`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

async function handleRefreshWalletScores(): Promise<void> {
  const all = await registry.getAll();
  let refreshed = 0;
  for (const w of all) {
    const { scoreWallet } = await import('./whale-tracker/WalletScorer.js');
    const scored = scoreWallet(w);
    await detector.updateWalletScore(w.walletAddress, scored.score, scored.copyWeight);
    refreshed++;
  }
  log.info({ refreshed }, 'Wallet scores refreshed');
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker('market-data', async (job: Job) => {
  switch (job.name) {
    case 'collect-prices':         return handleCollectPrices();
    case 'collect-new-tokens':     return handleCollectNewTokens();
    case 'scan-wallets':           return handleScanWallets();
    case 'refresh-wallet-scores':  return handleRefreshWalletScores();
    case 'flush-metrics':          return metrics.flush();
    case 'cache-sol-price':        return cacheSolPrice();
    case 'watch-dev-sells':        return handleWatchDevSells();
    default: log.warn({ jobName: job.name }, 'unknown job');
  }
}, { connection: redisConn, concurrency: 3 });

worker.on('failed',    (job, err) => log.error({ err, jobName: job?.name }, 'job failed'));
worker.on('completed', job        => log.debug({ jobName: job.name }, 'job done'));

// ─── Schedules ────────────────────────────────────────────────────────────────

async function scheduleJobs(): Promise<void> {
  await queue.upsertJobScheduler('collect-prices',        { every: 60_000  }, { name: 'collect-prices',        data: {} });
  await queue.upsertJobScheduler('collect-new-tokens',    { every: 30_000  }, { name: 'collect-new-tokens',    data: {} });
  await queue.upsertJobScheduler('scan-wallets',          { every: 60_000  }, { name: 'scan-wallets',          data: {} });
  await queue.upsertJobScheduler('refresh-wallet-scores', { every: 900_000 }, { name: 'refresh-wallet-scores', data: {} });
  await queue.upsertJobScheduler('flush-metrics',         { every: 60_000  }, { name: 'flush-metrics',         data: {} });
  await queue.upsertJobScheduler('cache-sol-price',       { every: 240_000 }, { name: 'cache-sol-price',       data: {} });
  await queue.upsertJobScheduler('watch-dev-sells',       { every: 120_000 }, { name: 'watch-dev-sells',       data: {} });
  log.info('Job schedulers registered');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Market Data worker starting…');

  pump.start();
  startHeliusWebhookServer(detector, Number(process.env['WEBHOOK_PORT'] ?? 3003));
  void cacheSolPrice(); // cache SOL price immediately

  await scheduleJobs();
  await queue.add('collect-prices', {}, { priority: 1 });

  // Seed known high-quality wallets from env (comma-separated)
  const seeds = (process.env['SEED_WALLETS'] ?? '').split(',').filter(Boolean);
  if (seeds.length > 0) {
    void registry.seedKnownWallets(seeds);
  }

  const hb = setInterval(() => {
    void redisPub.set('heartbeat:market-data', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redisPub.set('heartbeat:market-data', String(Date.now()), 'EX', 300).catch(() => null);

  log.info('Market Data worker ready');

  process.on('SIGTERM', async () => {
    clearInterval(hb);
    pump.stop();
    redisSub.disconnect();
    await worker.close();
    await queue.close();
    redisConn.disconnect();
    redisPub.disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});

function dedup(tokens: TokenSnapshot[]): TokenSnapshot[] {
  const seen = new Set<string>();
  return tokens.filter(t => {
    if (seen.has(t.mint)) return false;
    seen.add(t.mint);
    return true;
  });
}
