export interface HolderResult {
  holderCount:      number;
  topHolderPct:     number;
  top10HoldersPct:  number;
  giniCoefficient:  number;
  passed:           boolean;
  rejectionReason?: string;
}

// Gini coefficient: 0 = perfect equality, 1 = one holder owns everything
function gini(pcts: number[]): number {
  if (pcts.length === 0) return 0;
  const sorted = [...pcts].sort((a, b) => a - b);
  const n = sorted.length;
  let sumNumerator = 0;
  for (let i = 0; i < n; i++) sumNumerator += (2 * (i + 1) - n - 1) * sorted[i]!;
  const sumTotal = sorted.reduce((s, v) => s + v, 0);
  return sumTotal === 0 ? 0 : sumNumerator / (n * sumTotal);
}

export function checkHolders(
  holderCount: number,
  topHolders: Array<{ pct: number }>,
): HolderResult {
  const topHolderPct    = topHolders[0]?.pct ?? 0;
  const top10HoldersPct = topHolders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const giniCoefficient = gini(topHolders.map(h => h.pct));

  // holderCount 0 = unknown (Helius not available) — don't reject
  if (holderCount > 0 && holderCount < 25) {
    return {
      holderCount, topHolderPct, top10HoldersPct, giniCoefficient, passed: false,
      rejectionReason: `Too few holders: ${holderCount}`,
    };
  }
  if (topHolderPct > 25) {
    return {
      holderCount, topHolderPct, top10HoldersPct, giniCoefficient, passed: false,
      rejectionReason: `Top holder owns ${topHolderPct.toFixed(1)}% — rug risk`,
    };
  }
  if (top10HoldersPct > 70) {
    return {
      holderCount, topHolderPct, top10HoldersPct, giniCoefficient, passed: false,
      rejectionReason: `Top 10 holders own ${top10HoldersPct.toFixed(1)}% — concentrated supply`,
    };
  }
  // Gini > 0.85 on known holders = extreme concentration
  if (giniCoefficient > 0.85 && topHolders.length >= 5) {
    return {
      holderCount, topHolderPct, top10HoldersPct, giniCoefficient, passed: false,
      rejectionReason: `Extreme holder concentration (Gini=${giniCoefficient.toFixed(2)})`,
    };
  }
  return { holderCount, topHolderPct, top10HoldersPct, giniCoefficient, passed: true };
}
