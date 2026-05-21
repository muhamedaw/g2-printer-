export interface Trade {
  id?: number;
  userId: string;
  contractAddress: string;
  tokenSymbol?: string | undefined;
  tradeType: TradeType;
  isPaperTrade: boolean;
  source?: TradeSource | undefined;
  entryPrice?: number | undefined;
  exitPrice?: number | undefined;
  quantityTokens: number;
  solAmount: number;
  usdAmount: number;
  pnlUsd?: number | undefined;
  pnlPct?: number | undefined;
  finalScore: number;
  txSignature?: string | undefined;
  gasFeeSOL?: number | undefined;
  jitoTipSOL?: number | undefined;
  sellReason?: TradeCloseReason | undefined;
  copyTradeWallet?: string | undefined;
  createdAt: Date;
}

export type TradeSource = 'social' | 'copy_trade' | 'pump_graduation' | 'sniper' | 'manual';

export type TradeType =
  | 'BUY'
  | 'SELL_TP1' | 'SELL_TP2' | 'SELL_TP3'
  | 'SELL_STOP_LOSS'
  | 'SELL_TRAILING'
  | 'SELL_MANUAL'
  | 'SELL_DEV_RUG'
  | 'SELL_TIMEOUT';

export type TradeCloseReason =
  | 'take_profit_1' | 'take_profit_2' | 'take_profit_3'
  | 'stop_loss' | 'trailing_stop' | 'manual' | 'daily_limit';

export interface Position {
  id?: number;
  userId: string;
  contractAddress: string;
  tokenSymbol?: string | undefined;
  source?: TradeSource | undefined;
  entryPrice: number;
  currentPrice?: number | undefined;
  highestPriceSeen: number;
  quantityRemaining: number;
  usdInvested: number;
  currentUsdValue?: number | undefined;
  unrealizedPnlPct?: number | undefined;
  tp1Executed: boolean;
  tp2Executed: boolean;
  tp3Executed: boolean;
  trailingStopActive: boolean;
  finalScore: number;
  isPaperTrade: boolean;
  openedAt: Date;
  updatedAt: Date;
}
