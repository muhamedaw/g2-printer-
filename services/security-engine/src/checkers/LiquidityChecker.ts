import { DEFAULT_RISK } from '@mpg2/shared';

export interface LiquidityResult {
  liquidityUsd:   number;
  passed:         boolean;
  rejectionReason?: string;
}

export function checkLiquidity(liquidityUsd: number, relaxMin = false): LiquidityResult {
  // 0 means market data not yet cached — pass with benefit of doubt
  if (liquidityUsd === 0) {
    return { liquidityUsd, passed: true };
  }
  // Graduation/bonding curve signals may have lower liquidity right after listing
  const minLiq = relaxMin ? 3_000 : DEFAULT_RISK.MIN_LIQUIDITY_USD;
  if (liquidityUsd < minLiq) {
    return {
      liquidityUsd,
      passed: false,
      rejectionReason: `Liquidity too low: $${liquidityUsd.toFixed(0)} < $${minLiq.toLocaleString()}`,
    };
  }
  if (liquidityUsd > DEFAULT_RISK.MAX_LIQUIDITY_USD) {
    return {
      liquidityUsd,
      passed: false,
      rejectionReason: `Liquidity too high (already pumped): $${liquidityUsd.toFixed(0)} > $${DEFAULT_RISK.MAX_LIQUIDITY_USD.toLocaleString()}`,
    };
  }
  return { liquidityUsd, passed: true };
}
