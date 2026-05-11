import type { TokenSnapshot } from '@mpg2/shared';
import { DexScreenerClient } from '../api/DexScreenerClient.js';
import { RugCheckClient } from '../api/RugCheckClient.js';
import { QuickScorer } from '../scoring/QuickScorer.js';

const SCAN_INTERVAL_MS = 30_000; // scan every 30s

export interface ScoredToken {
  snapshot: TokenSnapshot;
  score: number;
  liquidityScore: number;
  volumeScore: number;
  priceVelocityScore: number;
  safetyScore: number;
  holderScore: number;
  ageBonus: number;
  reasoning: string;
}

export class TokenDetector {
  private dex = new DexScreenerClient();
  private rugCheck = new RugCheckClient();
  private scorer = new QuickScorer();
  private lastScan = 0;
  private cache: ScoredToken[] = [];

  async getTopCandidates(minScore: number, limit = 5): Promise<ScoredToken[]> {
    const now = Date.now();
    if (now - this.lastScan > SCAN_INTERVAL_MS) {
      await this.scan();
    }
    return this.cache
      .filter(t => t.score >= minScore)
      .slice(0, limit);
  }

  private async scan(): Promise<void> {
    const [newPairs, trending] = await Promise.allSettled([
      this.dex.getNewPairs(30),
      this.dex.getTrendingTokens(),
    ]);

    const raw: TokenSnapshot[] = [
      ...(newPairs.status === 'fulfilled' ? newPairs.value : []),
      ...(trending.status === 'fulfilled' ? trending.value : []),
    ];

    const deduped = dedupe(raw, t => t.mint);
    const enriched = await this.rugCheck.enrich(deduped);

    const scored = enriched.map<ScoredToken>(snap => {
      const qs = this.scorer.score(snap);
      return { snapshot: snap, score: qs.total, ...qs };
    });

    this.cache = scored.sort((a, b) => b.score - a.score);
    this.lastScan = Date.now();
  }
}

function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter(t => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
