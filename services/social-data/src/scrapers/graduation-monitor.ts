import { createLogger } from '@mpg2/shared';
import type { AiSignal } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('graduation-monitor');

interface GeckoPool {
  id: string;
  attributes: {
    name: string;
    address: string;
    pool_created_at: string;
    reserve_in_usd: string | null;
    price_change_percentage?: { m5?: string; m15?: string; m30?: string; h1?: string };
    transactions?: { m30?: { buys: number; sells: number }; h1?: { buys: number; sells: number } };
    volume_usd?: { m5?: string; m30?: string; h1?: string };
  };
  relationships: {
    base_token: { data: { id: string; type: string } };
    quote_token: { data: { id: string; type: string } };
    dex:         { data: { id: string; type: string } };
  };
}

const SEEN_TTL   = 4 * 60 * 60;  // 4h dedup
const MIN_AGE_S  = 60;            // skip if < 1 min old (bad data)
const MAX_AGE_S  = 30 * 60;       // skip if > 30 min old (opportunity passed)
const MIN_LIQ    = 20_000;        // $20k min liquidity (partial graduation fill)
const MIN_VOL_H1 = 5_000;         // $5k min h1 volume

export class GraduationMonitor {
  constructor(private readonly redisPub: Redis) {}

  async fetchGraduations(): Promise<void> {
    // Pump.fun graduated tokens appear on PumpSwap (pump.fun's AMM)
    // and sometimes Raydium. GeckoTerminal indexes both.
    await Promise.all([
      this.pollDex('pumpswap'),
      this.pollDex('raydium'),
    ]);
  }

  private async pollDex(dexId: string): Promise<void> {
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/dexes/${dexId}/pools?page=1`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) return;

      const data = await res.json() as { data?: GeckoPool[] };
      const pools = data.data ?? [];
      const now   = Math.floor(Date.now() / 1000);

      for (const pool of pools) {
        const baseId   = pool.relationships.base_token.data.id ?? '';
        const mint     = baseId.replace('solana_', '');
        if (!mint || mint === baseId) continue; // not a solana token

        const created  = pool.attributes.pool_created_at;
        let ageSec     = 99_999;
        try {
          const ts = Math.floor(new Date(created).getTime() / 1000);
          ageSec = now - ts;
        } catch { continue; }

        if (ageSec < MIN_AGE_S || ageSec > MAX_AGE_S) continue;

        const liq    = parseFloat(pool.attributes.reserve_in_usd ?? '0') || 0;
        const volH1  = parseFloat(pool.attributes.volume_usd?.h1 ?? '0') || 0;
        if (liq < MIN_LIQ) continue;
        if (volH1 > 0 && volH1 < MIN_VOL_H1) continue; // skip low-volume if data available

        await this.emitGraduation(pool, mint, ageSec, liq, dexId);
      }
    } catch (err) {
      log.debug({ err, dexId }, 'Graduation poll failed');
    }
  }

  private async emitGraduation(pool: GeckoPool, mint: string, ageSecs: number, liqUsd: number, dexId: string): Promise<void> {
    const seenKey = `grad:seen:${mint}`;
    const isNew   = await this.redisPub.set(seenKey, '1', 'EX', SEEN_TTL, 'NX');
    if (!isNew) return;

    const symbol  = pool.attributes.name.split(' / ')[0] ?? 'UNKNOWN';
    const ageMin  = ageSecs / 60;
    // Use the tightest available momentum window: fresh tokens (< 10min) use 5m, older use 15m/30m/1h
    const momKey  = ageMin <= 10 ? 'm5' : ageMin <= 20 ? 'm15' : ageMin <= 30 ? 'm30' : 'h1';
    const pcp     = pool.attributes.price_change_percentage;
    const ch1h    = parseFloat((pcp?.[momKey as keyof typeof pcp] ?? pcp?.h1 ?? '0') as string) || 0;
    const buysH1  = pool.attributes.transactions?.h1?.buys ?? pool.attributes.transactions?.m30?.buys ?? 0;

    // Get/cache price from DexScreener (graduation tokens are tradeable)
    let priceUsd = 0;
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (r.ok) {
        const d = await r.json() as { pairs?: Array<{ priceUsd?: string }> };
        priceUsd = parseFloat(d.pairs?.[0]?.priceUsd ?? '0') || 0;
      }
    } catch { /* ignore */ }

    if (priceUsd > 0) {
      await this.redisPub.set(`token:${mint}:price`,       String(priceUsd), 'EX', 300);
      await this.redisPub.set(`token:${mint}:first_price`, String(priceUsd), 'EX', 4 * 3600, 'NX');
      await this.redisPub.set(`token:${mint}:first_seen`,  String(Date.now()), 'EX', 4 * 3600, 'NX');
    }

    // Score: base depends on DEX (pumpswap = confirmed pump.fun graduation = higher quality)
    const baseScore = dexId === 'pumpswap' ? 88 : 85;
    // Age bonus: faster graduation = stronger momentum signal
    const ageBonus  = ageSecs < 5 * 60 ? 5 : ageSecs < 10 * 60 ? 3 : ageSecs < 20 * 60 ? 1 : 0;
    const liqBonus  = liqUsd >= 100_000 ? 5 : liqUsd >= 50_000 ? 3 : 0;
    const momBonus  = ch1h   >= 30      ? 4 : ch1h   >= 10      ? 2 : 0;
    const finalScore = Math.min(baseScore + ageBonus + liqBonus + momBonus, 100);

    const aiSignal: AiSignal = {
      contractAddress:    mint,
      tokenSymbol:        symbol,
      sentimentScore:     85,
      authenticityScore:  90,
      trendScore:         finalScore,
      narrativeFreshness: 98,
      finalAiScore:       finalScore,
      platformsDetected:  ['news'],
      platformCount:      1,
      influencerCount:    0,
      reasoning: `Pump.fun graduation: ${symbol} | ${dexId} | liq $${Math.round(liqUsd / 1000)}k | buys ${buysH1} | +${ch1h.toFixed(0)}% 1h | ${ageSecs}s ago`,
      passedToSafety: false,
      source:         'pump_graduation',
      createdAt:      new Date(),
    };

    await this.redisPub.publish('ai:signal', JSON.stringify(aiSignal));
    log.info({
      mint:    mint.slice(0, 8),
      symbol,
      dexId,
      liqUsd:  Math.round(liqUsd),
      ageSecs,
      ch1h:    ch1h.toFixed(0) + '%',
      score:   finalScore,
    }, 'Pump.fun graduation detected → security-engine');
  }
}
