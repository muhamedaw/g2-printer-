import { CircuitBreaker, createLogger } from '@mpg2/shared';
import type { RugCheckResult } from '@mpg2/shared';

const log = createLogger('rug-checker');
const BASE = 'https://api.rugcheck.xyz/v1';
const breaker = new CircuitBreaker('rugcheck', 5, 60_000);

export async function rugCheck(mint: string): Promise<RugCheckResult> {
  return breaker.execute(async () => {
    const res = await fetch(`${BASE}/tokens/${mint}/report`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log.debug({ mint, status: res.status }, 'rugcheck API error — fallback score');
      return fallback(mint);
    }
    const raw = await res.json() as {
      score?: number;
      risks?: Array<{ name: string; value: string; description: string; score: number; level: string }>;
      tokenMeta?: { name: string; symbol: string; decimals: number };
      topHolders?: Array<{ address: string; pct: number }>;
      markets?: Array<{ liquidityUsd: number }>;
    };
    const result: RugCheckResult = {
      mint,
      score: raw.score ?? 0,
      risks: (raw.risks ?? []).map(r => ({
        name:        r.name,
        value:       r.value,
        description: r.description,
        score:       r.score,
        level:       (r.level ?? 'low') as 'low' | 'medium' | 'high' | 'critical',
      })),
    };
    if (raw.tokenMeta)  result.tokenMeta  = raw.tokenMeta;
    if (raw.topHolders) result.topHolders = raw.topHolders;
    if (raw.markets)    result.markets    = raw.markets;
    return result;
  }).catch(() => fallback(mint));
}

function fallback(mint: string): RugCheckResult {
  return { mint, score: 50, risks: [] };
}
