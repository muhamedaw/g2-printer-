export interface Token {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  detectedAt: Date;
  source: TokenSource;
}

export type TokenSource =
  | 'pump_fun_launch'
  | 'pump_fun_graduation'
  | 'social_signal'
  | 'wallet_copy'
  | 'manual';

export interface TokenSafety {
  tokenAddress: string;
  overallScore: number;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  topHolderPct: number;
  top10HoldersPct: number;
  holderCount: number;
  isHoneypot: boolean;
  liquidityUsd: number;
  tokenAgeMinutes: number;
  buySellRatio: number;
  rugcheckScore: number;
  dnaMatchFound: boolean;
  rejectionReason?: string | undefined;
  passed: boolean;
  checkedAt: Date;
  expiresAt: Date;
}

export interface TokenDNA {
  patternId: string;
  creatorWallet: string;
  contractPatterns: string[];
  lpPatterns: string[];
  holderPatterns: string[];
  ruggedTokens: string[];
  confidence: number;
}

// DexScreener API response shape
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
  info?: {
    imageUrl?: string;
    websites?: Array<{ url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
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
  rugScore: number;
  topHolderPct: number;
  fetchedAt: Date;
}

export interface RugCheckResult {
  mint: string;
  score: number;
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
