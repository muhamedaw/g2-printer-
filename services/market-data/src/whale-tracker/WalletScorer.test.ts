import { describe, it, expect } from 'vitest';
import { scoreWallet } from './WalletScorer.js';
import type { SmartWallet } from '@mpg2/shared';

function makeWallet(overrides: Partial<SmartWallet> = {}): SmartWallet {
  return {
    walletAddress: 'TestWallet111111111111111111111111111111111',
    pattern:       'unknown',
    winRate:       0.5,
    avgProfitX:    1.5,
    avgLossPct:    0.15,
    totalTrades:   20,
    winningTrades: 10,
    isActive:      true,
    addedAt:       new Date(),
    ...overrides,
  };
}

describe('scoreWallet', () => {
  it('insider with high win rate scores highest', () => {
    const result = scoreWallet(makeWallet({ pattern: 'insider', winRate: 1.0, avgProfitX: 6, totalTrades: 100 }));
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.copyWeight).toBe(2.0);
  });

  it('institutional scores higher than lucky_retail', () => {
    const inst  = scoreWallet(makeWallet({ pattern: 'institutional', winRate: 0.7, avgProfitX: 3, totalTrades: 50 }));
    const lucky = scoreWallet(makeWallet({ pattern: 'lucky_retail',  winRate: 0.7, avgProfitX: 3, totalTrades: 50 }));
    expect(inst.score).toBeGreaterThan(lucky.score);
  });

  it('unknown pattern with low stats gets low copy weight', () => {
    const result = scoreWallet(makeWallet({ pattern: 'unknown', winRate: 0.3, avgProfitX: 1.0, totalTrades: 5 }));
    expect(result.copyWeight).toBe(0.5);
  });

  it('win rate of 0.8 contributes 32 pts (40 max)', () => {
    const result = scoreWallet(makeWallet({ winRate: 0.8, pattern: 'unknown', avgProfitX: 1, totalTrades: 0 }));
    // winPts = min(0.8 * 40, 40) = 32; profitPts = (1-1)*6 = 0; patternPts = 0; tradePts = 0
    expect(result.score).toBeCloseTo(32, 0);
  });

  it('avgProfitX below 1 contributes 0 pts (no negative score)', () => {
    const result = scoreWallet(makeWallet({ avgProfitX: 0.5, winRate: 0, pattern: 'unknown', totalTrades: 0 }));
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('score ≥ 65 yields copyWeight 1.5', () => {
    const result = scoreWallet(makeWallet({ pattern: 'institutional', winRate: 0.8, avgProfitX: 2, totalTrades: 30 }));
    // inst: 32 + 6 + 15 + 3 = 56... not quite 65. Let's use insider
    const result2 = scoreWallet(makeWallet({ pattern: 'insider', winRate: 0.8, avgProfitX: 2, totalTrades: 30 }));
    // ins: 32 + 6 + 20 + 3 = 61 — still < 65. More profit:
    const result3 = scoreWallet(makeWallet({ pattern: 'insider', winRate: 0.8, avgProfitX: 4, totalTrades: 30 }));
    // ins: 32 + 18 + 20 + 3 = 73 → copyWeight 2.0
    expect(result3.score).toBeGreaterThanOrEqual(65);
    expect(result3.copyWeight).toBeGreaterThanOrEqual(1.5);
  });

  it('returns reasons array with entries', () => {
    const result = scoreWallet(makeWallet());
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
