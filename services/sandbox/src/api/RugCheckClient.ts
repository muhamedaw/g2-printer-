import type { RugCheckResult, TokenSnapshot } from '@mpg2/shared';

const BASE = 'https://api.rugcheck.xyz/v1';

export class RugCheckClient {
  async check(mint: string): Promise<Pick<TokenSnapshot, 'rugScore' | 'topHolderPct'>> {
    try {
      const res = await fetch(`${BASE}/tokens/${mint}/report/summary`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return { rugScore: 50, topHolderPct: 0 };
      const data = await res.json() as RugCheckResult;
      const topHolderPct = data.topHolders?.[0]?.pct ?? 0;
      return { rugScore: data.score ?? 0, topHolderPct };
    } catch {
      return { rugScore: 50, topHolderPct: 0 };
    }
  }

  async enrich(snapshots: TokenSnapshot[]): Promise<TokenSnapshot[]> {
    return Promise.all(snapshots.map(async (snap) => {
      const safety = await this.check(snap.mint);
      return { ...snap, ...safety };
    }));
  }
}
