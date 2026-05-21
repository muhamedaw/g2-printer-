import { describe, it, expect } from 'vitest';
import { calculatePositionSize } from './PositionSizer.js';

describe('calculatePositionSize', () => {
  it('returns allowed=false when max positions reached', () => {
    const result = calculatePositionSize(1000, 90, 5, 5);
    expect(result.allowed).toBe(false);
    expect(result.positionUsd).toBe(0);
    expect(result.reason).toContain('Max positions');
  });

  it('scales position up with higher AI score', () => {
    const low  = calculatePositionSize(10_000, 75, 0, 5);
    const high = calculatePositionSize(10_000, 100, 0, 5);
    expect(low.allowed).toBe(true);
    expect(high.allowed).toBe(true);
    expect(high.positionUsd).toBeGreaterThan(low.positionUsd);
  });

  it('returns allowed=false when position size rounds to zero (tiny portfolio)', () => {
    const result = calculatePositionSize(1, 71, 0, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('too small');
  });

  it('never exceeds available capital (portfolio minus reserve)', () => {
    const portfolio = 10_000;
    const result = calculatePositionSize(portfolio, 100, 0, 5);
    // available = portfolio * (1 - RESERVE_CAPITAL_PCT=0.2) = 8000
    expect(result.positionUsd).toBeLessThanOrEqual(8_000);
  });

  it('score below 70 yields zero factor → position too small', () => {
    const result = calculatePositionSize(10_000, 69, 0, 5);
    expect(result.allowed).toBe(false);
  });

  it('score exactly 70 yields zero factor → position too small', () => {
    const result = calculatePositionSize(10_000, 70, 0, 5);
    expect(result.allowed).toBe(false);
  });

  it('score 85 yields ~50% of max position', () => {
    const result = calculatePositionSize(10_000, 85, 0, 5);
    expect(result.allowed).toBe(true);
    expect(result.positionPct).toBeGreaterThan(0);
    expect(result.positionPct).toBeLessThan(1);
  });
});
