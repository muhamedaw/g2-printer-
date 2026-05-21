import { createLogger } from '@mpg2/shared';
import type { AiSignal } from '@mpg2/shared';
import type Redis from 'ioredis';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const log = createLogger('wallet-watcher');

const WS_URL = 'wss://pumpportal.fun/api/data';

interface WalletEntry {
  address: string;
  name?: string;
}

interface TradeEvent {
  signature?:     string;
  mint:           string;
  traderPublicKey: string;
  txType:         string; // 'buy' | 'sell' | 'create'
  tokenAmount?:   number;
  solAmount?:     number;
  marketCapSol?:  number;
  name?:          string;
  symbol?:        string;
  pool?:          string;
}

// Batch size for subscribeAccountTrade (PumpPortal limit ~100 per message)
const BATCH_SIZE = 100;

export class WalletWatcher {
  private ws:       WebSocket | null = null;
  private running   = false;
  private retryMs   = 1_000;
  private hbTimer:  ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private wallets:  WalletEntry[] = [];
  private walletSet = new Set<string>();
  private nameMap   = new Map<string, string>(); // address → label
  private eventsTotal = 0;  // total WS messages received
  private eventsBuy   = 0;  // buy events for tracked wallets
  private signalsSent = 0;  // copy_trade signals published

  constructor(private readonly redisPub: Redis) {}

  start(): void {
    this.wallets = this.loadWallets();
    if (this.wallets.length === 0) {
      log.warn('No wallets configured — wallet watcher disabled. Add wallets to services/social-data/wallets.json');
      return;
    }
    for (const w of this.wallets) {
      this.walletSet.add(w.address);
      if (w.name) this.nameMap.set(w.address, w.name);
    }
    log.info({ count: this.wallets.length }, 'Wallet watcher starting');
    this.running = true;
    this.connect();
    // Store wallet names in Redis for notification-engine lookups
    void this.seedRedisNames();

    // Log stats every 5 minutes to diagnose activity
    this.statsTimer = setInterval(() => {
      log.info({ eventsTotal: this.eventsTotal, buyEvents: this.eventsBuy, signalsSent: this.signalsSent }, 'WalletWatcher stats');
      this.eventsTotal = 0;
      this.eventsBuy   = 0;
      this.signalsSent = 0;
    }, 5 * 60_000);
  }

  stop(): void {
    this.running = false;
    if (this.hbTimer)   clearInterval(this.hbTimer);
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.ws?.close();
    this.ws = null;
  }

  private loadWallets(): WalletEntry[] {
    // Look in service root (process.cwd()) and one level up (monorepo root)
    const candidates = [
      resolve(process.cwd(), 'wallets.json'),
      resolve(process.cwd(), '..', '..', 'wallets.json'),
    ];
    for (const p of candidates) {
      try {
        const raw = readFileSync(p, 'utf-8').trim();
        const arr = JSON.parse(raw) as Array<string | WalletEntry>;
        return arr.map(e =>
          typeof e === 'string' ? { address: e } : e,
        );
      } catch { /* try next */ }
    }
    return [];
  }

  private async seedRedisNames(): Promise<void> {
    for (const [addr, name] of this.nameMap) {
      await this.redisPub.set(`copy_trade:wallet:${addr}:name`, name, 'EX', 86_400 * 30).catch(() => null);
    }
  }

  private connect(): void {
    if (!this.running) return;

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      log.warn({ err }, 'WalletWatcher WebSocket constructor failed — retrying');
      this.scheduleReconnect();
      return;
    }

    // Prevent CONNECTING-state deadlock: PumpPortal sometimes accepts TCP but
    // never fires onopen — force-close after 15 s so onclose can reschedule.
    const connTimeout = setTimeout(() => {
      if (this.ws?.readyState === WebSocket.CONNECTING) {
        log.warn('WalletWatcher: connection handshake timeout — force closing');
        this.ws.close();
      }
    }, 15_000);

    this.ws.onopen = () => {
      clearTimeout(connTimeout);
      log.info({ wallets: this.wallets.length }, 'WalletWatcher connected — subscribing');
      this.retryMs = 1_000;

      // Subscribe in batches to stay within PumpPortal limits
      const addresses = this.wallets.map(w => w.address);
      for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE);
        this.ws!.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: batch }));
      }

      if (this.hbTimer) clearInterval(this.hbTimer);
      this.hbTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ method: 'ping' }));
        }
      }, 30_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Partial<TradeEvent>;
        if (!data.mint || !data.traderPublicKey) return;
        this.eventsTotal++;
        if (!this.walletSet.has(data.traderPublicKey)) return;
        if (data.txType === 'buy') {
          this.eventsBuy++;
          void this.handleCopyBuy(data as TradeEvent);
        } else if (data.txType === 'sell') {
          void this.handleCopySell(data as TradeEvent);
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onerror = () => { clearTimeout(connTimeout); /* onclose will handle reconnect */ };

    this.ws.onclose = () => {
      clearTimeout(connTimeout);
      if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
      if (this.running) {
        log.info({ retryMs: this.retryMs }, 'WalletWatcher WS closed — reconnecting');
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 60_000);
    setTimeout(() => this.connect(), delay);
  }

  private async handleCopyBuy(event: TradeEvent): Promise<void> {
    const walletName = this.nameMap.get(event.traderPublicKey) ?? event.traderPublicKey.slice(0, 8);
    const mcSol      = event.marketCapSol ?? 0;
    const solSpent   = event.solAmount ?? 0;

    // Skip dust buys — less than 0.1 SOL spent means no real conviction
    if (solSpent < 0.1 && solSpent > 0) {
      log.debug({ mint: event.mint.slice(0, 8), solSpent, wallet: walletName }, 'Copy buy skipped — dust buy');
      return;
    }

    // Skip if market cap already very high (late entry > 200 SOL = likely pumped)
    if (mcSol > 200) {
      log.debug({ mint: event.mint.slice(0, 8), mcSol, wallet: walletName }, 'Copy buy skipped — mcap too high');
      return;
    }

    // Estimate price and cache it for trade-engine
    const solPriceRaw = await this.redisPub.get('sol:price_usd').catch(() => null);
    const solPrice    = solPriceRaw ? parseFloat(solPriceRaw) : 150;
    const mcUsd       = mcSol * solPrice;
    const priceEst    = mcUsd > 0 ? mcUsd / 1_000_000_000 : 0.000001;
    await this.redisPub.set(`token:${event.mint}:price`, String(priceEst), 'EX', 300).catch(() => null);

    // Track first-seen time so trade-engine can reject stale tokens
    const alreadySeen = await this.redisPub.get(`token:${event.mint}:first_seen`).catch(() => null);
    if (!alreadySeen) {
      await this.redisPub.set(`token:${event.mint}:first_seen`, String(Date.now()), 'EX', 4 * 3600).catch(() => null);
      await this.redisPub.set(`token:${event.mint}:first_price`, String(priceEst), 'EX', 4 * 3600).catch(() => null);
    }

    // P14: skip wallets with < 40% win rate once we have ≥ 5 completed trades
    const totalStr = await this.redisPub.get(`copy_trade:wallet:${event.traderPublicKey}:total`).catch(() => null);
    const winsStr  = await this.redisPub.get(`copy_trade:wallet:${event.traderPublicKey}:wins`).catch(() => null);
    const total    = totalStr ? parseInt(totalStr, 10) : 0;
    const wins     = winsStr  ? parseInt(winsStr,  10) : 0;
    if (total >= 5 && wins / total < 0.40) {
      log.debug({ wallet: walletName, total, winRate: (wins / total * 100).toFixed(0) + '%' }, 'Wallet win rate < 40% — skipped');
      return;
    }

    // Dynamic score: wallet track record + rotation boost (multiple wallets buying = high conviction)
    let finalAiScore = 85; // default — no history yet
    if (total >= 5) {
      const winRate = wins / total;
      finalAiScore = winRate >= 0.60 ? 92 : 87;
    }

    // Rotation detection: track unique wallet buys per token in last 10 min
    const rotKey    = `copy_rotation:${event.mint}`;
    const tenMinAgo = Date.now() - 10 * 60 * 1_000;
    await this.redisPub.zadd(rotKey, Date.now(), event.traderPublicKey).catch(() => null);
    await this.redisPub.expire(rotKey, 600).catch(() => null);
    await this.redisPub.zremrangebyscore(rotKey, '-inf', tenMinAgo).catch(() => null);
    const rotCount = await this.redisPub.zcard(rotKey).catch(() => 1);
    if (rotCount >= 3) {
      finalAiScore = Math.max(finalAiScore, 95);
    } else if (rotCount === 2) {
      finalAiScore = Math.max(finalAiScore, 90);
    }
    if (rotCount > 1) {
      log.info({ mint: event.mint.slice(0, 8), rotCount, score: finalAiScore }, 'Copy rotation detected — score boosted');
    }

    const aiSignal: AiSignal = {
      contractAddress:    event.mint,
      tokenSymbol:        event.symbol ?? undefined,
      sentimentScore:     88,
      authenticityScore:  90,
      trendScore:         85,
      narrativeFreshness: 95,
      finalAiScore,
      platformsDetected:  ['news'],
      platformCount:      1,
      influencerCount:    1,
      reasoning:          `Copy trade: ${walletName} bought ${event.symbol ?? event.mint.slice(0, 8)} | mcap ${mcSol.toFixed(1)} SOL | score ${finalAiScore}`,
      passedToSafety:     false,
      source:             'copy_trade',
      copyTradeWallet:    event.traderPublicKey,
      createdAt:          new Date(),
    };

    await this.redisPub.publish('ai:signal', JSON.stringify(aiSignal));
    this.signalsSent++;
    log.info({ mint: event.mint.slice(0, 8), symbol: event.symbol, wallet: walletName, mcSol: mcSol.toFixed(1), score: finalAiScore }, 'Copy buy signal fired');
  }

  private async handleCopySell(event: TradeEvent): Promise<void> {
    const walletName = this.nameMap.get(event.traderPublicKey) ?? event.traderPublicKey.slice(0, 8);
    // Notify trade-engine to close any copy_trade position in this token
    await this.redisPub.publish('copy_trade:wallet_sold', JSON.stringify({
      mint:       event.mint,
      walletAddr: event.traderPublicKey,
      walletName,
    })).catch(() => null);
    log.info({ mint: event.mint.slice(0, 8), wallet: walletName }, 'Copy wallet sold — close signal forwarded');
  }
}
