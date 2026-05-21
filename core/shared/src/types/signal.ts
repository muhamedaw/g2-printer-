export type Platform = 'twitter' | 'reddit' | 'telegram' | 'news' | 'tiktok' | 'instagram';

export interface RawSignal {
  id?: number;
  platform: Platform;
  content: string;
  contractAddress?: string | undefined;
  authorUsername?: string | undefined;
  authorFollowers: number;
  engagementScore: number;
  platformWeight: number;
  influencerWeight: number;
  rawData?: Record<string, unknown> | undefined;
  processed: boolean;
  createdAt: Date;
}

export interface AiSignal {
  contractAddress: string;
  tokenSymbol?: string | undefined;
  sentimentScore: number;
  authenticityScore: number;
  trendScore: number;
  narrativeFreshness: number;
  finalAiScore: number;
  platformsDetected: Platform[];
  platformCount: number;
  influencerCount: number;
  reasoning: string;
  passedToSafety: boolean;
  source?: 'social' | 'copy_trade' | 'pump_graduation' | 'sniper';
  userId?: string;
  copyTradeWallet?: string | undefined;
  createdAt: Date;
}

export interface BuySignal {
  contractAddress: string;
  tokenSymbol?: string | undefined;
  finalScore: number;
  positionSizeUsd: number;
  aiScore: number;
  safetyScore: number;
  platformsDetected: Platform[];
  reasoning: string;
  source: 'social' | 'copy_trade' | 'pump_graduation' | 'sniper' | 'manual';
  userId: string;
  copyTradeWallet?: string | undefined;
  createdAt: Date;
}
