import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('gecko-terminal-scraper');

const BASE = 'https://api.geckoterminal.com/api/v2';
const TWO_HOURS = 2 * 60 * 60 * 1000;
const SEEN_TTL = 30 * 60; // 30 min — re-signal if still trending

interface GeckoPool {
  id: string;
  attributes: {
    base_token_price_usd:      string;
    name:                      string;
    pool_created_at:           string;
    volume_usd:                { h24: string; h1: string };
    price_change_percentage:   { h1: string; h24: string };
    transactions:              { h1: { buys: number; sells: number } };
    reserve_in_usd:            string;
  };
  relationships: {
    base_token: { data: { id: string } };
  };
}

interface GeckoResponse {
  data: GeckoPool[];
}

export class GeckoTerminalScraper {
  private lastFetchAt = 0;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async fetchLatest(): Promise<RawSignal[]> {
    // Rate-limit: every 5 minutes
    if (Date.now() - this.lastFetchAt < 5 * 60_000) return [];
    this.lastFetchAt = Date.now();

    const signals: RawSignal[] = [];

    try {
      const res = await fetch(
        `${BASE}/networks/solana/new_pools?page=1`,
        {
          headers: { 'Accept': 'application/json;version=20230302' },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) return [];

      const data = await res.json() as GeckoResponse;
      const pools = data.data ?? [];

      for (const pool of pools) {
        const createdAt  = new Date(pool.attributes.pool_created_at);
        const ageMs      = Date.now() - createdAt.getTime();
        if (ageMs > TWO_HOURS) continue; // only tokens < 2 hours old

        const vol24h     = parseFloat(pool.attributes.volume_usd.h24 ?? '0');
        const vol1h      = parseFloat(pool.attributes.volume_usd.h1  ?? '0');
        const change1h   = parseFloat(pool.attributes.price_change_percentage.h1 ?? '0');
        const liquidity  = parseFloat(pool.attributes.reserve_in_usd ?? '0');
        const buys1h     = pool.attributes.transactions?.h1?.buys ?? 0;

        if (vol24h < 3_000) continue;   // min $3k volume
        if (liquidity < 2_000) continue; // min $2k liquidity
        if (buys1h < 10) continue;       // min activity

        // Extract mint address from relationship id (format: "solana_<mint>")
        const relId = pool.relationships.base_token.data.id;
        const mint  = relId.replace('solana_', '');
        if (!mint) continue;
        const seenKey = `gecko:seen:${pool.id}`;
        const alreadySeen = await this.redis.set(seenKey, '1', 'EX', SEEN_TTL, 'NX');
        if (!alreadySeen) continue; // NX returns null if key already exists

        const engagementScore = Math.min(
          15 + Math.max(change1h, 0) * 0.4 + Math.log10(vol1h + 1) * 4,
          70,
        );

        const name = pool.attributes.name.split(' /')[0];
        // Cache symbol early so trade notifications show token name instead of address
        await this.redis.set(`token:${mint}:symbol`, name ?? '', 'EX', 86_400);
        const text = `Solana token ${name}: +${change1h.toFixed(0)}% (1h), $${(vol1h / 1000).toFixed(0)}k volume, $${(liquidity / 1000).toFixed(0)}k liquidity, ${buys1h} buys/1h. Contract: ${mint}`;

        signals.push({
          platform:        'news',
          content:         text,
          contractAddress: mint,
          authorUsername:  'geckoterminal',
          authorFollowers: 100_000,
          engagementScore,
          platformWeight:  1.3,
          influencerWeight: 1.2,
          processed:       false,
          createdAt:       new Date(),
        });
      }
    } catch (err) {
      log.debug({ err }, 'GeckoTerminal fetch failed');
    }

    if (signals.length > 0) log.info({ count: signals.length }, 'GeckoTerminal signals fetched');
    return signals;
  }
}
