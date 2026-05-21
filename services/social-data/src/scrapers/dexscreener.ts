import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('dexscreener-scraper');

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  volume: { h24: number };
  priceChange: { h1?: number; h6?: number; h24: number };
  txns: { h24: { buys: number; sells: number } };
  liquidity?: { usd?: number };
  marketCap?: number;
  pairCreatedAt?: number;
}

interface BoostToken {
  tokenAddress: string;
  chainId: string;
  amount: number;
  totalAmount: number;
  icon?: string;
  description?: string;
  links?: Array<{ type: string; url: string }>;
}

const BASE = 'https://api.dexscreener.com';
const SEEN_TTL = 30 * 60; // 30 min

export class DexScreenerScraper {
  private redis: Redis;
  private lastBoostedAt = 0;
  private lastTrendingAt = 0;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  // Fetch token-boost list — tokens actively promoted on DexScreener (strong signal)
  async fetchBoosted(): Promise<RawSignal[]> {
    if (Date.now() - this.lastBoostedAt < 4 * 60_000) return [];
    this.lastBoostedAt = Date.now();

    try {
      const res = await fetch(`${BASE}/token-boosts/latest/v1`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json() as BoostToken[];

      const results: RawSignal[] = [];
      for (const t of data.filter(t => t.chainId === 'solana' && t.tokenAddress).slice(0, 20)) {
        const sig = await this.boostToSignal(t);
        if (sig) results.push(sig);
      }
      return results;
    } catch (err) {
      log.debug({ err }, 'DexScreener boosted fetch failed');
      return [];
    }
  }

  // Fetch trending Solana pairs by volume
  async fetchTrending(): Promise<RawSignal[]> {
    if (Date.now() - this.lastTrendingAt < 6 * 60_000) return [];
    this.lastTrendingAt = Date.now();

    const signals: RawSignal[] = [];

    try {
      // Search for hot Solana memecoins
      const queries = ['solana memecoin', 'pump fun solana', 'sol degen'];
      const query = queries[Math.floor(Math.random() * queries.length)]!;

      const res = await fetch(
        `${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return [];

      const data = await res.json() as { pairs?: DexPair[] };
      const pairs = (data.pairs ?? [])
        .filter(p =>
          p.chainId === 'solana' &&
          p.volume?.h24 > 10_000 &&          // min $10k volume/day
          (p.priceChange?.h1 ?? 0) > 5 &&    // up at least 5% in last hour
          (p.liquidity?.usd ?? 0) > 5_000,   // min $5k liquidity
        )
        .sort((a, b) => (b.priceChange?.h1 ?? 0) - (a.priceChange?.h1 ?? 0))
        .slice(0, 10);

      for (const pair of pairs) {
        const signal = await this.pairToSignal(pair);
        if (signal) signals.push(signal);
      }
    } catch (err) {
      log.debug({ err }, 'DexScreener trending fetch failed');
    }

    return signals;
  }

  // Fetch newly created pairs (< 24h old) with traction
  async fetchNewPairs(): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    try {
      const res = await fetch(
        `${BASE}/latest/dex/search?q=solana`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return [];

      const data = await res.json() as { pairs?: DexPair[] };
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      const pairs = (data.pairs ?? [])
        .filter(p =>
          p.chainId === 'solana' &&
          p.pairCreatedAt && p.pairCreatedAt > oneDayAgo &&
          p.volume?.h24 > 5_000 &&
          (p.txns?.h24?.buys ?? 0) > 50,
        )
        .sort((a, b) => (b.txns?.h24?.buys ?? 0) - (a.txns?.h24?.buys ?? 0))
        .slice(0, 5);

      for (const pair of pairs) {
        const signal = await this.pairToSignal(pair, 'new_pair');
        if (signal) signals.push(signal);
      }
    } catch (err) {
      log.debug({ err }, 'DexScreener new pairs fetch failed');
    }

    return signals;
  }

  async fetchLatest(): Promise<RawSignal[]> {
    const [boosted, trending, newPairs] = await Promise.all([
      this.fetchBoosted(),
      this.fetchTrending(),
      this.fetchNewPairs(),
    ]);
    const all = [...boosted, ...trending, ...newPairs];
    if (all.length > 0) log.info({ count: all.length }, 'DexScreener signals fetched');
    return all;
  }

  private async boostToSignal(t: BoostToken): Promise<RawSignal | null> {
    const seenKey = `dex:seen:${t.tokenAddress}`;
    const isNew = await this.redis.set(seenKey, '1', 'EX', SEEN_TTL, 'NX');
    if (!isNew) return null;

    const boostStrength = Math.min(t.amount / 100, 5); // normalise
    const text = `${t.description ?? 'Boosted token on DexScreener'} Contract: ${t.tokenAddress}`;

    return {
      platform:        'news',
      content:         text,
      contractAddress: t.tokenAddress,
      authorUsername:  'dexscreener',
      authorFollowers: 500_000,
      engagementScore: 20 + boostStrength * 10,
      platformWeight:  1.4,
      influencerWeight: 1.6,
      processed:       false,
      createdAt:       new Date(),
    };
  }

  private async pairToSignal(pair: DexPair, context = 'trending'): Promise<RawSignal | null> {
    const addr = pair.baseToken.address;
    const seenKey = `dex:seen:${addr}`;
    const isNew = await this.redis.set(seenKey, '1', 'EX', SEEN_TTL, 'NX');
    if (!isNew) return null;

    // Cache symbol early so trade notifications can show it
    if (pair.baseToken.symbol) {
      await this.redis.set(`token:${addr}:symbol`, pair.baseToken.symbol, 'EX', 86_400);
    }

    const change1h  = pair.priceChange?.h1  ?? 0;
    const change24h = pair.priceChange?.h24 ?? 0;
    const vol24h    = pair.volume?.h24 ?? 0;
    const buys      = pair.txns?.h24?.buys ?? 0;

    const text = `Solana token ${pair.baseToken.symbol} (${pair.baseToken.name}): +${change1h.toFixed(0)}% (1h), +${change24h.toFixed(0)}% (24h), $${(vol24h / 1000).toFixed(0)}k volume, ${buys} buys. Contract: ${addr}`;

    // Engagement score based on momentum
    const engagementScore = Math.min(
      10 + Math.abs(change1h) * 0.5 + Math.log10(vol24h + 1) * 3,
      80,
    );

    return {
      platform:        'news',
      content:         text,
      contractAddress: addr,
      authorUsername:  'dexscreener',
      authorFollowers: 200_000,
      engagementScore,
      platformWeight:  1.4,
      influencerWeight: 1.4,
      processed:       false,
      createdAt:       new Date(),
    };
  }
}
