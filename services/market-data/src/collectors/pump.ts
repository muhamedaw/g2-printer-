import WebSocket from 'ws';
import { createLogger } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('pump-collector');
const WS_URL = 'wss://pumpportal.fun/api/data';

const GRADUATION_SOL = 85;   // pump.fun graduates at ~85 SOL in bonding curve
const CURVE_ZONE_LOW  = 0.70;
const CURVE_ZONE_HIGH = 0.90;
const MAX_CURVE_TRACKED = 40;

export class PumpFunCollector {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Bonding curve tracking on the same WS connection (avoids second connection = rate limit)
  private readonly curveTracked = new Set<string>();
  private readonly curveAlerted = new Set<string>();

  constructor(private readonly redis: Redis) {}

  start(): void {
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  watchCurve(mint: string): void {
    if (this.curveTracked.has(mint) || this.curveAlerted.has(mint)) return;
    if (this.curveTracked.size >= MAX_CURVE_TRACKED) {
      const oldest = this.curveTracked.values().next().value;
      if (oldest) this.curveTracked.delete(oldest);
    }
    this.curveTracked.add(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));
    }
  }

  private connect(): void {
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      log.info('PumpFun WebSocket connected');
      this.ws!.send(JSON.stringify({ method: 'subscribeNewToken' }));
      this.ws!.send(JSON.stringify({ method: 'subscribeMigrations' }));
      // Re-subscribe to tracked curve tokens after reconnect
      if (this.curveTracked.size > 0) {
        this.ws!.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [...this.curveTracked] }));
      }
    });

    this.ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>;
        const mint = data['mint'] as string | undefined;
        if (!mint) return;

        // Bonding curve trade event for tracked tokens
        if (this.curveTracked.has(mint) && !this.curveAlerted.has(mint)) {
          const solInCurve = (
            (data['vSolInBondingCurve'] as number | undefined) ??
            (data['marketCapSol'] as number | undefined) ?? 0
          );
          if (solInCurve > 0) {
            const fillPct = solInCurve / GRADUATION_SOL;
            if (fillPct >= CURVE_ZONE_LOW && fillPct < CURVE_ZONE_HIGH) {
              this.curveAlerted.add(mint);
              this.curveTracked.delete(mint);
              log.info(
                { mint: mint.slice(0, 8), fill: (fillPct * 100).toFixed(0) + '%' },
                'Bonding curve prime zone — emitting signal',
              );
              void this.redis.publish('market:bonding_curve_peak', JSON.stringify({
                mint, symbol: data['symbol'], fillPct, solInCurve,
                detectedAt: new Date().toISOString(),
              })).catch(() => null);
            } else if (fillPct >= CURVE_ZONE_HIGH) {
              // Graduation imminent — graduation handler takes over
              this.curveTracked.delete(mint);
            }
          }
          return; // don't double-process as create/migrate
        }

        if (data['txType'] === 'create') {
          const creator = data['traderPublicKey'] as string | undefined;
          await this.redis.publish('market:new_token', JSON.stringify({
            mint,
            symbol:      data['symbol'],
            name:        data['name'],
            creator,
            initialBuy:  data['initialBuy'],
            source:      'pump_fun_launch',
            detectedAt:  new Date().toISOString(),
          }));
          // Store creator wallet so graduation handler can check for dev dumps
          if (creator) {
            await this.redis.set(`token:${mint}:creator`, creator, 'EX', 86_400);
          }
          const mcSol = data['marketCapSol'] as number | undefined;
          if (mcSol && mcSol > 0) {
            await this.redis.set(`token:${mint}:mc_sol`, String(mcSol), 'EX', 300);
          }

        } else if (data['txType'] === 'migrate') {
          // Token graduated to PumpSwap (pump.fun replaced Raydium with PumpSwap in March 2025)
          log.info({ mint, symbol: data['symbol'] }, 'Pump.fun graduation to PumpSwap detected');
          await this.redis.publish('market:graduation', JSON.stringify({
            mint,
            symbol:     data['symbol'],
            name:       data['name'],
            source:     'pump_graduation',
            detectedAt: new Date().toISOString(),
          }));
        }
      } catch { /* skip malformed */ }
    });

    this.ws.on('error', (err) => log.warn({ err }, 'PumpFun WS error'));

    this.ws.on('close', () => {
      log.info('PumpFun WS closed — reconnecting in 5s');
      this.reconnectTimer = setTimeout(() => this.connect(), 5_000);
    });
  }
}
