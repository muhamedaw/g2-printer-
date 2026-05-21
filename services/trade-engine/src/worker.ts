import 'dotenv/config';
import Redis from 'ioredis';
import { getDb, trades, upsertPositionInDb, deletePositionFromDb, getUserCapitalUsd } from '@mpg2/db';
import { createLogger, DEFAULT_RISK } from '@mpg2/shared';
import type { BuySignal, Position, Trade } from '@mpg2/shared';
import { PaperExecutor }    from './PaperExecutor.js';
import { LiveExecutor }     from './LiveExecutor.js';
import { PositionManager }  from './PositionManager.js';
import { WalletManager }    from './WalletManager.js';
import { PriceSubscriber }  from './PriceSubscriber.js';

const log = createLogger('trade-engine-worker');

const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const walletMgr  = new WalletManager();
const paper      = new PaperExecutor(redis);
const live       = new LiveExecutor(walletMgr);
const priceSub   = new PriceSubscriber(redis);
const posMgr     = new PositionManager(
  redis,
  saveTrade,
  async (userId, mint) => {
    await deletePositionFromDb(userId, mint);
    priceSub.unsubscribe(mint);
    syncPortfolioCache(userId).catch(() => null);
  },
  upsertPositionInDb,
);

// ─── Portfolio cache sync ─────────────────────────────────────────────────────

async function syncPortfolioCache(userId: string): Promise<void> {
  // open_count: derived from the positions set (always accurate)
  const openCount = await redis.scard(`positions:${userId}`);
  await redis.set(`portfolio:${userId}:open_count`, String(openCount));

  // Refresh from DB if key is missing (TTL -2) OR has no expiry (TTL -1).
  // Keys set without TTL stay stale forever and cause wrong position sizes.
  const ttl = await redis.ttl(`portfolio:${userId}:usd`);
  if (ttl < 0) {
    const capitalUsd = await getUserCapitalUsd(userId);
    await redis.set(`portfolio:${userId}:usd`, String(capitalUsd), 'EX', 300);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isLiveMode(userId: string): Promise<boolean> {
  const paused    = await redis.get(`trading:${userId}:paused`);
  if (paused) return false;
  const mode      = await redis.get(`user:${userId}:paper_mode`);
  const paperMode = mode === null ? true : mode === '1';
  return !paperMode && walletMgr.isConfigured();
}

async function getEncryptedKey(userId: string): Promise<string | null> {
  return redis.get(`user:${userId}:encrypted_wallet`);
}

async function getCurrentPrice(mint: string): Promise<number | null> {
  const raw = await redis.get(`token:${mint}:price`);
  if (raw) return parseFloat(raw);

  // Cache miss: try Jupiter (covers graduated tokens quickly)
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mint}`, { signal: AbortSignal.timeout(4_000) });
    if (res.ok) {
      const data = await res.json() as { data?: Record<string, { price: number }> };
      const price = data.data?.[mint]?.price ?? null;
      if (price && price > 0) {
        await redis.set(`token:${mint}:price`,       String(price),        'EX', 10);
        await redis.set(`token:${mint}:first_price`, String(price), 'EX', 86_400, 'NX');
        await redis.set(`token:${mint}:first_seen`,  String(Date.now()), 'EX', 86_400, 'NX');
        return price;
      }
    }
  } catch { /* fall through */ }

  // Fallback: DexScreener (covers pump.fun bonding-curve tokens)
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const data = await res.json() as { pairs?: Array<{ priceUsd?: string; baseToken?: { symbol?: string; name?: string } }> };
      const pair     = data.pairs?.[0];
      const priceStr = pair?.priceUsd;
      const price    = priceStr ? parseFloat(priceStr) : null;
      if (price && price > 0) {
        await redis.set(`token:${mint}:price`,       String(price),        'EX', 10);
        await redis.set(`token:${mint}:first_price`, String(price), 'EX', 86_400, 'NX');
        await redis.set(`token:${mint}:first_seen`,  String(Date.now()), 'EX', 86_400, 'NX');
        // Cache symbol so BUY notifications can show it
        const sym = pair?.baseToken?.symbol;
        if (sym) await redis.set(`token:${mint}:symbol`, sym, 'EX', 86_400);
        return price;
      }
    }
  } catch { /* ignore */ }

  return null;
}

async function getSolPrice(): Promise<number> {
  const raw = await redis.get('sol:price_usd');
  return raw ? parseFloat(raw) : 150;
}

// ─── Redis subscriber ─────────────────────────────────────────────────────────

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const subscribeChannels = (): void => {
  void redisSub.subscribe('risk:buy_signal', 'trade:manual_close', 'market:dev_sell', 'copy_trade:wallet_sold', 'token:price_crash', err => {
    if (err) log.error({ err }, 'Subscribe failed');
  });
};
subscribeChannels();

redisSub.on('error', err => log.warn({ err }, 'redisSub error'));
redisSub.on('ready', () => {
  log.info('redisSub reconnected — re-subscribing to buy channels');
  subscribeChannels();
});

redisSub.on('message', (channel, message) => {
  if (channel === 'risk:buy_signal') {
    const signal = JSON.parse(message) as BuySignal;
    void handleBuySignal(signal).catch(err => log.error({ err }, 'Buy signal handler error'));
  }
  if (channel === 'trade:manual_close') {
    const { userId, contractAddress } = JSON.parse(message) as { userId: string; contractAddress: string };
    void handleManualClose(userId, contractAddress).catch(err => log.error({ err }, 'Manual close error'));
  }
  if (channel === 'market:dev_sell') {
    const { mint } = JSON.parse(message) as { mint: string };
    void handleDevSell(mint).catch(err => log.error({ err }, 'Dev sell handler error'));
  }
  if (channel === 'copy_trade:wallet_sold') {
    const { mint, walletName } = JSON.parse(message) as { mint: string; walletName: string };
    void handleCopyWalletSell(mint, walletName).catch(err => log.error({ err }, 'Copy wallet sell handler error'));
  }
  if (channel === 'token:price_crash') {
    // Instant rug detected — immediately check all positions holding this token
    void handlePriceCrash(message).catch(err => log.warn({ err }, 'Price crash handler error'));
  }
});

// ─── DB persistence ───────────────────────────────────────────────────────────

const db = getDb();

async function updateRunningBalance(userId: string, delta: number): Promise<void> {
  const key = `portfolio:${userId}:balance`;
  const existing = await redis.get(key);
  if (!existing) {
    const capital = await getUserCapitalUsd(userId).catch(() => DEFAULT_RISK.CAPITAL_TOTAL_USD);
    await redis.set(key, String(capital + delta));
  } else {
    await redis.incrbyfloat(key, delta);
  }
}

async function saveTrade(trade: Trade): Promise<void> {
  // Update running wallet balance: BUY decrements, SELL increments
  const delta = trade.tradeType === 'BUY' ? -trade.usdAmount : trade.usdAmount;
  updateRunningBalance(trade.userId, delta).catch(() => null);

  // P14: track per-wallet win/loss stats for copy-trade performance filter
  if (trade.source === 'copy_trade' && trade.copyTradeWallet && trade.tradeType !== 'BUY') {
    const addr = trade.copyTradeWallet;
    const TTL  = 30 * 86_400; // 30 days
    redis.incr(`copy_trade:wallet:${addr}:total`).then(n => redis.expire(`copy_trade:wallet:${addr}:total`, TTL)).catch(() => null);
    if ((trade.pnlPct ?? 0) > 0) {
      redis.incr(`copy_trade:wallet:${addr}:wins`).then(() => redis.expire(`copy_trade:wallet:${addr}:wins`, TTL)).catch(() => null);
    }
  }

  try {
    await db.insert(trades).values({
      userId:          trade.userId,
      contractAddress: trade.contractAddress,
      tokenSymbol:     trade.tokenSymbol ?? null,
      tradeType:       trade.tradeType,
      isPaperTrade:    trade.isPaperTrade,
      source:          trade.source ?? null,
      entryPrice:      trade.entryPrice?.toString() ?? null,
      exitPrice:       trade.exitPrice?.toString() ?? null,
      quantityTokens:  trade.quantityTokens?.toString() ?? null,
      solAmount:       trade.solAmount?.toString() ?? null,
      usdAmount:       trade.usdAmount.toString(),
      pnlUsd:          trade.pnlUsd?.toString() ?? null,
      pnlPct:          trade.pnlPct?.toString() ?? null,
      finalScore:      trade.finalScore.toString(),
      txSignature:     trade.txSignature ?? null,
      jitoTipSOL:      trade.jitoTipSOL?.toString() ?? null,
      sellReason:      trade.sellReason ?? null,
      copyTradeWallet: trade.copyTradeWallet ?? null,
    });
  } catch (err) {
    log.warn({ err }, 'Failed to save trade to DB');
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const PLAN_MAX_POSITIONS: Record<string, number> = { free: 3, starter: 5, pro: 10, whale: 25 };

async function handleBuySignal(signal: BuySignal): Promise<void> {
  // Skip duplicate: already holding this contract
  const existing = await redis.hget(`position:${signal.userId}:${signal.contractAddress}`, 'data');
  if (existing) return;

  // SL cooldown: blocked for 4h after a stop loss or timeout on this token
  const slCooldown = await redis.get(`token:${signal.contractAddress}:sl_cooldown`);
  if (slCooldown) {
    log.info({ contract: signal.contractAddress.slice(0, 8) }, 'SL cooldown active — rebuy blocked');
    return;
  }

  // TP cooldown: blocked for 2h after profitable trailing exit (token already pumped and pulled back)
  const tpCooldown = await redis.get(`token:${signal.contractAddress}:tp_cooldown`);
  if (tpCooldown) {
    log.debug({ contract: signal.contractAddress.slice(0, 8) }, 'TP cooldown active — rebuy blocked');
    return;
  }

  // Enforce plan-based max open positions (consistent with risk-engine)
  const planTier = (await redis.get(`user:${signal.userId}:plan`)) ?? 'free';
  const maxPositions = PLAN_MAX_POSITIONS[planTier] ?? 3;
  const openCount = await redis.scard(`positions:${signal.userId}`);
  if (openCount >= maxPositions) {
    log.debug({ userId: signal.userId, openCount, maxPositions, plan: planTier }, 'Max positions reached — buy skipped');
    return;
  }

  const price = await getCurrentPrice(signal.contractAddress);
  if (!price || price <= 0) {
    log.warn({ contract: signal.contractAddress }, 'No price — buy skipped');
    return;
  }

  // Enrich signal with token symbol if missing (social signals don't carry it from ai-brain)
  if (!signal.tokenSymbol) {
    const cached = await redis.get(`token:${signal.contractAddress}:symbol`);
    if (cached) signal.tokenSymbol = cached;
  }

  // Reject stale buy signals (queue backlog — tighter window for memecoins)
  // graduation signals live longer (filling takes hours); social/sniper must be fresh
  const signalAgeMs = Date.now() - new Date(signal.createdAt).getTime();
  const maxSignalAgeMs = signal.source === 'pump_graduation' ? 30 * 60_000 : 15 * 60_000;
  if (signalAgeMs > maxSignalAgeMs) {
    log.info(
      { contract: signal.contractAddress.slice(0, 8), ageMinutes: (signalAgeMs / 60_000).toFixed(1), source: signal.source },
      'Stale signal — buy skipped',
    );
    return;
  }

  // Reject if token has been in our system too long (likely dead)
  // Graduation signals fill bonding curves over hours — allow more time
  const firstSeenRaw = await redis.get(`token:${signal.contractAddress}:first_seen`);
  if (firstSeenRaw) {
    const firstSeenMs = parseInt(firstSeenRaw, 10);
    const tokenAgeMs = Date.now() - firstSeenMs;
    const maxAgeMs = signal.source === 'pump_graduation' ? 8 * 60 * 60 * 1_000 : 3 * 60 * 60 * 1_000;
    if (tokenAgeMs > maxAgeMs) {
      log.info(
        { contract: signal.contractAddress.slice(0, 8), ageHours: (tokenAgeMs / 3_600_000).toFixed(1), source: signal.source },
        'Token too old — buy skipped',
      );
      return;
    }
  }

  // Reject late entries AND declining tokens using first-seen price
  const firstPriceRaw = await redis.get(`token:${signal.contractAddress}:first_price`);
  if (firstPriceRaw) {
    const firstPrice = parseFloat(firstPriceRaw);
    if (firstPrice > 0) {
      const ratio = price / firstPrice;
      if (ratio > 2.5) {
        log.info({ contract: signal.contractAddress.slice(0, 8), pumpRatio: ratio.toFixed(2) }, 'Late entry detected (>2.5x from first price) — buy skipped');
        return;
      }
      // Skip if price already dumped >20% from first seen (buying into a decline)
      if (ratio < 0.80 && signal.source !== 'pump_graduation') {
        log.info({ contract: signal.contractAddress.slice(0, 8), dumpRatio: ratio.toFixed(2) }, 'Price declined >20% from first seen — buy skipped');
        return;
      }
    }
  }

  const useLive  = await isLiveMode(signal.userId);
  const solPrice = await getSolPrice();
  let trade;

  let position;

  if (useLive) {
    const encKey = await getEncryptedKey(signal.userId);
    if (!encKey) {
      log.warn({ userId: signal.userId }, 'No encrypted wallet — falling back to paper');
      const result = await paper.buy(signal, price);
      trade = result.trade; position = result.position;
    } else {
      try {
        const result = await live.buy(signal, encKey, price, solPrice);
        trade = result.trade; position = result.position;
        await redis.hset(`position:${signal.userId}:${signal.contractAddress}`, {
          data: JSON.stringify(result.position),
        });
        await redis.sadd(`positions:${signal.userId}`, signal.contractAddress);
      } catch (err) {
        log.error({ err, userId: signal.userId }, 'Live buy failed — falling back to paper');
        const result = await paper.buy(signal, price);
        trade = result.trade; position = result.position;
      }
    }
  } else {
    const result = await paper.buy(signal, price);
    trade = result.trade; position = result.position;
  }

  // Attach copy-trade wallet address for P14 stats tracking
  if (signal.source === 'copy_trade' && signal.copyTradeWallet) {
    trade.copyTradeWallet = signal.copyTradeWallet;
  }

  await saveTrade(trade);
  if (position) {
    upsertPositionInDb(position).catch(err => log.warn({ err }, 'Position DB save failed'));
    priceSub.subscribe(signal.contractAddress);
    syncPortfolioCache(signal.userId).catch(() => null);
    void redis.incr('stats:daily:buys_executed').then(n => { if (n === 1) redis.expire('stats:daily:buys_executed', 86_400).catch(() => null); }).catch(() => null);
  }
  await redis.publish('trade:executed', JSON.stringify(trade));
}

async function handleDevSell(mint: string): Promise<void> {
  const users = await redis.smembers('users:live_trading');
  const targets = users.length > 0 ? users : ['system'];
  for (const userId of targets) {
    await handleManualClose(userId, mint, 'SELL_DEV_RUG').catch(() => null);
  }
  log.warn({ mint: mint.slice(0, 8) }, 'Dev rug — all positions force-closed');
}

async function handleManualClose(userId: string, contractAddress: string, reason: import('@mpg2/shared').TradeType = 'SELL_MANUAL'): Promise<void> {
  const raw = await redis.hget(`position:${userId}:${contractAddress}`, 'data');
  if (!raw) return;

  const position = JSON.parse(raw) as Position;
  const price    = await getCurrentPrice(contractAddress);
  const exitPrice = price ?? position.entryPrice;

  const useLive  = await isLiveMode(userId);
  const solPrice = await getSolPrice();
  let trade;

  if (useLive && !position.isPaperTrade) {
    const encKey = await getEncryptedKey(userId);
    if (encKey) {
      try {
        trade = await live.sell(position, encKey, exitPrice, 1.0, reason, solPrice);
      } catch (err) {
        log.error({ err }, 'Live sell failed — paper close');
        trade = await paper.sell(position, exitPrice, 1.0, reason);
      }
    } else {
      trade = await paper.sell(position, exitPrice, 1.0, reason);
    }
  } else {
    trade = await paper.sell(position, exitPrice, 1.0, reason);
  }

  priceSub.unsubscribe(contractAddress);
  await redis.del(`position:${userId}:${contractAddress}`);
  await redis.srem(`positions:${userId}`, contractAddress);
  deletePositionFromDb(userId, contractAddress).catch(err => log.warn({ err }, 'Position DB delete failed'));
  syncPortfolioCache(userId).catch(() => null);
  await saveTrade(trade);
  await redis.publish('trade:executed', JSON.stringify(trade));
}

async function handleCopyWalletSell(mint: string, walletName: string): Promise<void> {
  const users = await redis.smembers('users:live_trading');
  for (const userId of users) {
    const raw = await redis.hget(`position:${userId}:${mint}`, 'data');
    if (!raw) continue;
    const position = JSON.parse(raw) as Position;
    if (position.source !== 'copy_trade') continue;
    await handleManualClose(userId, mint, 'SELL_MANUAL').catch(() => null);
    log.info({ userId, mint: mint.slice(0, 8), wallet: walletName }, 'Copy wallet sold — position closed');
  }
}

async function handlePriceCrash(mint: string): Promise<void> {
  // Price dropped >20% in one tick — immediately check all positions holding this token
  const users = await redis.smembers('users:live_trading');
  for (const userId of users) {
    const raw = await redis.hget(`position:${userId}:${mint}`, 'data');
    if (!raw) continue;
    await posMgr.checkPosition(userId, mint).catch(() => null);
  }
}

// ─── Position monitor ─────────────────────────────────────────────────────────

async function monitorLoop(): Promise<void> {
  while (true) {
    try {
      const users = await redis.smembers('users:live_trading');
      for (const userId of users) {
        await posMgr.checkAllPositions(userId).catch(err =>
          log.warn({ err, userId }, 'Position monitor error'),
        );
      }
    } catch (err) {
      log.warn({ err }, 'Monitor loop error');
    }
    // 5s interval: catches rugs 3× faster (rug can wipe -80% in a single 15s window)
    await new Promise(r => setTimeout(r, 5_000));
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Trade Engine starting…');
  log.info({ liveReady: walletMgr.isConfigured() }, 'Wallet manager status');

  // NOTE: do NOT add 'system' to users:live_trading — it duplicates all trades
  // and breaks per-user plan limits. Only real users (added via /start) should be here.

  // Subscribe to trade events for all positions already open in Redis
  // and sync portfolio cache for all users
  priceSub.start();
  const users = await redis.smembers('users:live_trading');
  for (const userId of users) {
    const mints = await redis.smembers(`positions:${userId}`);
    for (const mint of mints) priceSub.subscribe(mint);
    syncPortfolioCache(userId).catch(() => null);
  }
  log.info({ subscriptions: priceSub.size }, 'PriceSubscriber: subscribed to existing positions');

  void monitorLoop();

  const hb = setInterval(() => {
    void redis.set('heartbeat:trade-engine', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redis.set('heartbeat:trade-engine', String(Date.now()), 'EX', 300).catch(() => null);

  // Periodic portfolio cache refresh: ensures portfolio:usd stays fresh even when idle
  setInterval(() => {
    void redis.smembers('users:live_trading').then(uids =>
      Promise.all(uids.map(uid => syncPortfolioCache(uid).catch(() => null))),
    ).catch(() => null);
  }, 60_000);

  log.info('Trade Engine ready');

  process.on('SIGTERM', () => {
    clearInterval(hb);
    priceSub.stop();
    redisSub.disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});
