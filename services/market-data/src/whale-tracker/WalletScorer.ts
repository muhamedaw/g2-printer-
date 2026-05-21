import type { SmartWallet } from '@mpg2/shared';

export interface WalletScore {
  address:     string;
  score:       number; // 0-100
  copyWeight:  number; // multiplier for position sizing (0.5-2.0)
  reasons:     string[];
}

export function scoreWallet(wallet: SmartWallet): WalletScore {
  const reasons: string[] = [];
  let score = 0;

  // Win rate (max 40 pts)
  const winPts = Math.min(wallet.winRate * 40, 40);
  score += winPts;
  reasons.push(`Win rate ${(wallet.winRate * 100).toFixed(0)}% → ${winPts.toFixed(0)}pts`);

  // Avg profit multiple (max 30 pts)
  const profitPts = Math.min((wallet.avgProfitX - 1) * 6, 30);
  score += Math.max(profitPts, 0);
  if (profitPts > 0) reasons.push(`Avg ${wallet.avgProfitX.toFixed(1)}x → ${profitPts.toFixed(0)}pts`);

  // Pattern bonus (max 20 pts)
  const patternPts = wallet.pattern === 'insider'       ? 20
                   : wallet.pattern === 'institutional' ? 15
                   : wallet.pattern === 'lucky_retail'  ? 5
                   : 0;
  score += patternPts;
  reasons.push(`Pattern: ${wallet.pattern} → ${patternPts}pts`);

  // Trade volume (max 10 pts) — more trades = more reliable data
  const tradePts = Math.min(wallet.totalTrades / 10, 10);
  score += tradePts;
  reasons.push(`${wallet.totalTrades} trades → ${tradePts.toFixed(0)}pts`);

  // Copy weight: high-score wallets get bigger position allocation
  const copyWeight = score >= 80 ? 2.0
                   : score >= 65 ? 1.5
                   : score >= 50 ? 1.2
                   : 0.5;

  return { address: wallet.walletAddress, score, copyWeight, reasons };
}
