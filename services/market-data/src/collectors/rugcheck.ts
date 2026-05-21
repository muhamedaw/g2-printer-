import { CircuitBreaker, type TokenSnapshot } from '@mpg2/shared';

const BASE = 'https://api.rugcheck.xyz/v1';
const breaker = new CircuitBreaker('rugcheck', 5, 60_000);

export async function checkToken(mint: string): Promise<Pick<TokenSnapshot, 'rugScore' | 'topHolderPct'>> {
  return breaker.execute(async () => {
    const res = await fetch(`${BASE}/tokens/${mint}/report/summary`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { rugScore: 50, topHolderPct: 0 };
    const data = await res.json() as { score?: number; topHolders?: Array<{ pct: number }> };
    return {
      rugScore: data.score ?? 0,
      topHolderPct: data.topHolders?.[0]?.pct ?? 0,
    };
  }).catch(() => ({ rugScore: 50, topHolderPct: 0 }));
}

export async function enrichTokens(tokens: TokenSnapshot[]): Promise<TokenSnapshot[]> {
  return Promise.all(tokens.map(async t => {
    const safety = await checkToken(t.mint);
    return { ...t, ...safety };
  }));
}
