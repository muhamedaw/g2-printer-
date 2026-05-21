import { DEFAULT_RISK } from '@mpg2/shared';

export interface SizeResult {
  positionUsd:   number;
  positionPct:   number;
  allowed:       boolean;
  reason?:       string;
}

export function calculatePositionSize(
  portfolioUsd:   number,
  aiScore:        number,
  openPositions:  number,
  maxPositions:   number,
  source?:        string,
  kellyMultiplier = 1.0,
): SizeResult {
  if (openPositions >= maxPositions) {
    return { positionUsd: 0, positionPct: 0, allowed: false, reason: `Max positions reached (${maxPositions})` };
  }

  const reserve = portfolioUsd * DEFAULT_RISK.RESERVE_CAPITAL_PCT;
  const available = portfolioUsd - reserve;

  // Scale size by AI score: score=80 → 50% of max, score=100 → 100%
  const scoreFactor = Math.max(0, (aiScore - 70) / 30);
  // Sniper signals are high-risk (new pump.fun tokens, ~10% win rate) — cap at 20% of normal size
  const sourceFactor = source === 'sniper' ? 0.2 : 1.0;
  const basePct = DEFAULT_RISK.MAX_POSITION_PCT * sourceFactor;
  // Quarter-Kelly multiplier: grows position on proven profitable sources, shrinks on negative EV
  const positionPct = basePct * scoreFactor * kellyMultiplier;
  const positionUsd = Math.min(available * positionPct, available);

  if (positionUsd < 1) {
    return { positionUsd: 0, positionPct: 0, allowed: false, reason: 'Position size too small' };
  }

  return { positionUsd, positionPct, allowed: true };
}
