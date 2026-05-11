export type WalletPattern = 'institutional' | 'insider' | 'lucky_retail' | 'unknown';

export interface SmartWallet {
  id?: number;
  walletAddress: string;
  nickname?: string | undefined;
  pattern: WalletPattern;
  winRate: number;
  avgProfitX: number;
  avgLossPct: number;
  totalTrades: number;
  winningTrades: number;
  isActive: boolean;
  lastTradeAt?: Date | undefined;
  addedAt: Date;
}

export interface WalletPerformance {
  walletAddress: string;
  period30d: {
    trades: number;
    winRate: number;
    totalPnlUsd: number;
    bestTradeX: number;
  };
}
