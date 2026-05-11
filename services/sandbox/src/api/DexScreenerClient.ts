import type { DexScreenerToken, TokenSnapshot } from '@mpg2/shared';

const BASE = 'https://api.dexscreener.com';

export class DexScreenerClient {
  async getNewPairs(limit = 50): Promise<TokenSnapshot[]> {
    const res = await fetch(`${BASE}/token-profiles/latest/v1`);
    if (!res.ok) throw new Error(`DexScreener /latest status ${res.status}`);
    const data = await res.json() as Array<{ tokenAddress: string; chainId: string }>;
    const solanaMints = data
      .filter(t => t.chainId === 'solana')
      .slice(0, limit)
      .map(t => t.tokenAddress);
    if (solanaMints.length === 0) return [];
    return this.getTokensByMints(solanaMints);
  }

  async getTrendingTokens(): Promise<TokenSnapshot[]> {
    const res = await fetch(`${BASE}/token-boosts/top/v1`);
    if (!res.ok) throw new Error(`DexScreener /boosts status ${res.status}`);
    const data = await res.json() as Array<{ tokenAddress: string; chainId: string }>;
    const mints = data.filter(t => t.chainId === 'solana').slice(0, 20).map(t => t.tokenAddress);
    if (mints.length === 0) return [];
    return this.getTokensByMints(mints);
  }

  async getTokensByMints(mints: string[]): Promise<TokenSnapshot[]> {
    // DexScreener accepts up to 30 addresses per call
    const chunks = chunkArray(mints, 30);
    const snapshots: TokenSnapshot[] = [];
    for (const chunk of chunks) {
      const res = await fetch(`${BASE}/tokens/v1/solana/${chunk.join(',')}`);
      if (!res.ok) continue;
      const pairs = await res.json() as DexScreenerToken[];
      for (const pair of pairs) {
        const snap = this.pairToSnapshot(pair);
        if (snap) snapshots.push(snap);
      }
    }
    return snapshots;
  }

  async getTokenPrice(mint: string): Promise<number | null> {
    const snaps = await this.getTokensByMints([mint]);
    return snaps[0]?.priceUsd ?? null;
  }

  private pairToSnapshot(pair: DexScreenerToken): TokenSnapshot | null {
    const price = parseFloat(pair.priceUsd ?? '0');
    if (price <= 0) return null;
    return {
      mint: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      priceUsd: price,
      liquidityUsd: pair.liquidity?.usd ?? 0,
      volumeH24: pair.volume?.h24 ?? 0,
      volumeH1: pair.volume?.h1 ?? 0,
      priceChangeH1: pair.priceChange?.h1 ?? 0,
      priceChangeH24: pair.priceChange?.h24 ?? 0,
      txBuysH1: pair.txns?.h1?.buys ?? 0,
      txSellsH1: pair.txns?.h1?.sells ?? 0,
      pairCreatedAt: pair.pairCreatedAt ?? Date.now(),
      rugScore: 0,
      topHolderPct: 0,
      fetchedAt: new Date(),
    };
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
