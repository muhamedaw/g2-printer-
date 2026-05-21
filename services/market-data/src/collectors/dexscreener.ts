import { CircuitBreaker, type TokenSnapshot } from '@mpg2/shared';
import { sleep } from '@mpg2/shared';

const BASE = 'https://api.dexscreener.com';
const breaker = new CircuitBreaker('dexscreener', 5, 60_000);
let lastRequest = 0;

async function politeGet(url: string): Promise<unknown> {
  const wait = 500 - (Date.now() - lastRequest);
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`DexScreener ${res.status}: ${url}`);
  return res.json();
}

export async function getTrendingTokens(): Promise<TokenSnapshot[]> {
  return breaker.execute(async () => {
    const data = await politeGet(`${BASE}/token-boosts/top/v1`) as Array<{ tokenAddress: string; chainId: string }>;
    const mints = data.filter(t => t.chainId === 'solana').slice(0, 20).map(t => t.tokenAddress);
    return getTokensByMints(mints);
  });
}

export async function getNewPairs(limit = 30): Promise<TokenSnapshot[]> {
  return breaker.execute(async () => {
    const data = await politeGet(`${BASE}/token-profiles/latest/v1`) as Array<{ tokenAddress: string; chainId: string }>;
    const mints = data.filter(t => t.chainId === 'solana').slice(0, limit).map(t => t.tokenAddress);
    return getTokensByMints(mints);
  });
}

export async function getTokensByMints(mints: string[]): Promise<TokenSnapshot[]> {
  if (mints.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
  const snapshots: TokenSnapshot[] = [];
  for (const chunk of chunks) {
    try {
      const pairs = await politeGet(`${BASE}/tokens/v1/solana/${chunk.join(',')}`) as any[];
      for (const p of pairs) {
        const price = parseFloat(p.priceUsd ?? '0');
        if (price <= 0) continue;
        snapshots.push({
          mint: p.baseToken?.address ?? '',
          symbol: p.baseToken?.symbol ?? '?',
          name: p.baseToken?.name ?? '?',
          priceUsd: price,
          liquidityUsd: p.liquidity?.usd ?? 0,
          volumeH24: p.volume?.h24 ?? 0,
          volumeH1: p.volume?.h1 ?? 0,
          priceChangeH1: p.priceChange?.h1 ?? 0,
          priceChangeH24: p.priceChange?.h24 ?? 0,
          txBuysH1: p.txns?.h1?.buys ?? 0,
          txSellsH1: p.txns?.h1?.sells ?? 0,
          pairCreatedAt: p.pairCreatedAt ?? Date.now(),
          rugScore: 0,
          topHolderPct: 0,
          fetchedAt: new Date(),
        });
      }
    } catch { /* skip failed chunk */ }
  }
  return snapshots;
}

export async function getTokenPrice(mint: string): Promise<number | null> {
  try {
    const snaps = await getTokensByMints([mint]);
    return snaps[0]?.priceUsd ?? null;
  } catch { return null; }
}
