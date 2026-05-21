import { createLogger } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('price-subscriber');

const WS_URL = 'wss://pumpportal.fun/api/data';

interface TradeEvent {
  mint: string;
  vSolInBondingCurve: number;
  vTokensInBondingCurve: number;
  txType?: string;
}

// Threshold: if price drops > 20% in a single trade event, trigger immediate position check
const INSTANT_CHECK_THRESHOLD = 0.80;

/**
 * Subscribes to PumpPortal trade events for open positions and caches
 * real-time prices in Redis — eliminates DexScreener polling for pump.fun tokens.
 */
export class PriceSubscriber {
  private ws: WebSocket | null = null;
  private running  = false;
  private retryMs  = 1_000;
  private readonly subscribed  = new Set<string>();
  private readonly lastPrice   = new Map<string, number>(); // mint → last USD price

  constructor(private readonly redis: Redis) {}

  start(): void {
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.ws?.close();
    this.ws = null;
  }

  subscribe(mint: string): void {
    if (this.subscribed.has(mint)) return;
    this.subscribed.add(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));
    }
  }

  unsubscribe(mint: string): void {
    if (!this.subscribed.has(mint)) return;
    this.subscribed.delete(mint);
    this.lastPrice.delete(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'unsubscribeTokenTrade', keys: [mint] }));
    }
  }

  get size(): number { return this.subscribed.size; }

  private connect(): void {
    if (!this.running) return;

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      log.warn({ err }, 'PriceSubscriber WS constructor failed — retrying');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = async () => {
      log.info({ subscriptions: this.subscribed.size }, 'PriceSubscriber WS connected');
      this.retryMs = 1_000;

      if (this.subscribed.size > 0) {
        this.ws!.send(JSON.stringify({
          method: 'subscribeTokenTrade',
          keys:   [...this.subscribed],
        }));
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data as string) as Partial<TradeEvent>;
        const { mint, vSolInBondingCurve: vSol, vTokensInBondingCurve: vTok } = data;
        if (!mint || !vSol || !vTok || vTok <= 0) return;

        // Price in SOL per token → convert to USD via cached SOL price
        const priceSOL   = vSol / vTok;
        const solRaw     = await this.redis.get('sol:price_usd');
        const solUsd     = solRaw ? parseFloat(solRaw) : 150;
        const priceUsd   = priceSOL * solUsd;

        if (priceUsd > 0) {
          await this.redis.set(`token:${mint}:price`, String(priceUsd), 'EX', 120);

          // Detect instant rug: price dropped >20% in a single sell event
          const prev = this.lastPrice.get(mint);
          if (prev && priceUsd < prev * INSTANT_CHECK_THRESHOLD) {
            const dropPct = ((prev - priceUsd) / prev * 100).toFixed(0);
            log.warn({ mint: mint.slice(0, 8), dropPct: dropPct + '%' }, 'Price crash detected — triggering instant position check');
            await this.redis.publish('token:price_crash', mint);
          }
          this.lastPrice.set(mint, priceUsd);
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onerror = () => { /* close will follow */ };

    this.ws.onclose = () => {
      if (this.running) {
        log.info({ retryMs: this.retryMs }, 'PriceSubscriber WS closed — reconnecting');
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 60_000);
    setTimeout(() => this.connect(), delay);
  }
}
