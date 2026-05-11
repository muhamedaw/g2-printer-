export interface DexScreenerToken {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns: { h24: { buys: number; sells: number }; h1: { buys: number; sells: number } };
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: { imageUrl?: string; websites?: Array<{ url: string }>; socials?: Array<{ type: string; url: string }> };
}

export interface RugCheckResult {
  mint: string;
  score: number;          // 0 = clean, 100 = definite rug
  risks: RugRisk[];
  tokenMeta?: { name: string; symbol: string; decimals: number };
  topHolders?: Array<{ address: string; pct: number }>;
  markets?: Array<{ liquidityUsd: number }>;
}

export interface RugRisk {
  name: string;
  value: string;
  description: string;
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
}

export interface TokenSnapshot {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  liquidityUsd: number;
  volumeH24: number;
  volumeH1: number;
  priceChangeH1: number;
  priceChangeH24: number;
  txBuysH1: number;
  txSellsH1: number;
  pairCreatedAt: number;
  rugScore: number;       // from RugCheck, 0=clean
  topHolderPct: number;   // top holder % concentration
  fetchedAt: Date;
}
