export type SandboxStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'STOPPED';
export type TradeAction = 'BUY' | 'SELL';
export type ExitReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIMEOUT' | 'MANUAL' | 'RUGPULL';

export interface SandboxConfig {
  userId: string;
  sessionId: string;
  startingCapital: number;    // USD
  durationMs: number;
  maxPositions: number;
  positionSizePercent: number; // % of capital per trade
  takeProfitPercent: number;
  stopLossPercent: number;
  minScoreThreshold: number;   // 0–100, only buy if score ≥ this
  paper: true;
}

export interface SandboxPosition {
  positionId: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  entryPrice: number;
  currentPrice: number;
  fakeSolSpent: number;
  fakeTokensHeld: number;
  score: number;
  openedAt: Date;
  pnlUsd: number;
  pnlPercent: number;
}

export interface SandboxTrade {
  tradeId: string;
  sessionId: string;
  tokenMint: string;
  tokenSymbol: string;
  action: TradeAction;
  fakeUsdAmount: number;
  price: number;
  score: number;
  exitReason?: ExitReason | undefined;
  pnlUsd?: number;
  pnlPercent?: number;
  executedAt: Date;
}

export interface SandboxState {
  config: SandboxConfig;
  status: SandboxStatus;
  capital: number;
  peakCapital: number;
  openPositions: Map<string, SandboxPosition>;
  closedTrades: SandboxTrade[];
  startedAt: Date;
  endsAt: Date;
  totalTrades: number;
  winningTrades: number;
  totalPnlUsd: number;
}

export interface QuickScore {
  total: number;           // 0–100
  liquidityScore: number;  // 0–25
  volumeScore: number;     // 0–20
  priceVelocityScore: number; // 0–20
  safetyScore: number;     // 0–20
  holderScore: number;     // 0–10
  ageBonus: number;        // 0–5
  reasoning: string;
}

export interface SandboxReport {
  sessionId: string;
  durationMs: number;
  startingCapital: number;
  endingCapital: number;
  totalPnlUsd: number;
  totalPnlPercent: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  bestTrade: SandboxTrade | null;
  worstTrade: SandboxTrade | null;
  avgHoldTimeMs: number;
}
