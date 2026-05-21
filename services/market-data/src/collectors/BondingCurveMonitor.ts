import WebSocket from 'ws';
import { createLogger } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('bonding-curve-monitor');
const WS_URL = 'wss://pumpportal.fun/api/data';

// pump.fun graduates at ~85 SOL in the bonding curve
const GRADUATION_SOL = 85;
const ZONE_LOW  = 0.70; // start watching at 70% filled
const ZONE_HIGH = 0.90; // hand off to graduation handler above 90%
const MAX_TRACKED = 40; // cap concurrent subscriptions

export class BondingCurveMonitor {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly tracked = new Set<string>(); // currently subscribed
  private readonly alerted = new Set<string>(); // already fired — no duplicate signals

  constructor(private readonly redis: Redis) {}

  start(): void { this.connect(); }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  watch(mint: string): void {
    if (this.tracked.has(mint) || this.alerted.has(mint)) return;
    if (this.tracked.size >= MAX_TRACKED) {
      // Evict oldest entry (Set preserves insertion order)
      const oldest = this.tracked.values().next().value;
      if (oldest) this.tracked.delete(oldest);
    }
    this.tracked.add(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));
    }
  }

  private connect(): void {
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      log.info('BondingCurveMonitor connected');
      if (this.tracked.size > 0) {
        this.ws!.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [...this.tracked] }));
      }
    });

    this.ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>;
        const mint = data['mint'] as string | undefined;
        if (!mint || !this.tracked.has(mint) || this.alerted.has(mint)) return;

        // pumpportal sends vSolInBondingCurve on trade events; marketCapSol as fallback
        const solInCurve = (
          (data['vSolInBondingCurve'] as number | undefined) ??
          (data['marketCapSol'] as number | undefined) ?? 0
        );
        if (solInCurve <= 0) return;

        const fillPct = solInCurve / GRADUATION_SOL;

        if (fillPct >= ZONE_LOW && fillPct < ZONE_HIGH) {
          // Prime entry zone — fire once then stop tracking this token
          this.alerted.add(mint);
          this.tracked.delete(mint);
          log.info(
            { mint: mint.slice(0, 8), fill: (fillPct * 100).toFixed(0) + '%', solInCurve: solInCurve.toFixed(1) },
            'Bonding curve prime zone — emitting signal',
          );
          await this.redis.publish('market:bonding_curve_peak', JSON.stringify({
            mint,
            symbol:     data['symbol'],
            fillPct,
            solInCurve,
            detectedAt: new Date().toISOString(),
          }));
        } else if (fillPct >= ZONE_HIGH) {
          // Too close to graduation — let graduation handler take over
          this.tracked.delete(mint);
        }
      } catch { /* skip malformed */ }
    });

    this.ws.on('error', err => log.warn({ err }, 'BondingCurveMonitor WS error'));
    this.ws.on('close', () => {
      log.info('BondingCurveMonitor WS closed — reconnecting in 5s');
      this.reconnectTimer = setTimeout(() => this.connect(), 5_000);
    });
  }
}
