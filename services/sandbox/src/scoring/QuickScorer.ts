import type { TokenSnapshot, QuickScore } from '@mpg2/shared';

export class QuickScorer {
  score(token: TokenSnapshot): QuickScore {
    const liquidityScore = this.calcLiquidity(token.liquidityUsd);
    const volumeScore = this.calcVolume(token.volumeH1, token.liquidityUsd);
    const priceVelocityScore = this.calcPriceVelocity(token.priceChangeH1);
    const safetyScore = this.calcSafety(token.rugScore, token.topHolderPct);
    const holderScore = this.calcHolders(token.txBuysH1, token.txSellsH1);
    const ageBonus = this.calcAge(token.pairCreatedAt);

    const total = Math.min(100, Math.round(
      liquidityScore + volumeScore + priceVelocityScore + safetyScore + holderScore + ageBonus
    ));

    return {
      total,
      liquidityScore,
      volumeScore,
      priceVelocityScore,
      safetyScore,
      holderScore,
      ageBonus,
      reasoning: this.buildReasoning({ liquidityScore, volumeScore, priceVelocityScore, safetyScore, holderScore, ageBonus, total }),
    };
  }

  private calcLiquidity(liquidityUsd: number): number {
    // max 25 pts — $50k = 25, $10k = 15, $5k = 8, below = 0
    if (liquidityUsd >= 50_000) return 25;
    if (liquidityUsd >= 20_000) return 20;
    if (liquidityUsd >= 10_000) return 15;
    if (liquidityUsd >= 5_000) return 8;
    if (liquidityUsd >= 1_000) return 3;
    return 0;
  }

  private calcVolume(volumeH1: number, liquidityUsd: number): number {
    // max 20 pts — volume/liquidity ratio + absolute volume
    const ratio = liquidityUsd > 0 ? volumeH1 / liquidityUsd : 0;
    let pts = 0;
    if (volumeH1 >= 50_000) pts += 10;
    else if (volumeH1 >= 10_000) pts += 7;
    else if (volumeH1 >= 2_000) pts += 4;
    else if (volumeH1 >= 500) pts += 1;

    if (ratio >= 0.5) pts += 10;
    else if (ratio >= 0.2) pts += 7;
    else if (ratio >= 0.05) pts += 4;
    else if (ratio >= 0.01) pts += 1;

    return Math.min(20, pts);
  }

  private calcPriceVelocity(priceChangeH1: number): number {
    // max 20 pts — strong upward momentum, penalize dumps
    if (priceChangeH1 >= 100) return 20;   // 2x in 1h
    if (priceChangeH1 >= 50) return 18;
    if (priceChangeH1 >= 20) return 15;
    if (priceChangeH1 >= 10) return 12;
    if (priceChangeH1 >= 5) return 8;
    if (priceChangeH1 >= 0) return 4;
    if (priceChangeH1 >= -10) return 2;
    return 0;  // heavy dump = worthless
  }

  private calcSafety(rugScore: number, topHolderPct: number): number {
    // max 20 pts — lower rug score = safer, lower concentration = safer
    let pts = 20;
    // rugScore: 0 = clean, 100 = definite rug
    pts -= Math.floor(rugScore / 5);           // deduct up to 20
    // topHolder concentration penalty
    if (topHolderPct > 50) pts -= 10;
    else if (topHolderPct > 30) pts -= 5;
    else if (topHolderPct > 20) pts -= 2;
    return Math.max(0, Math.min(20, pts));
  }

  private calcHolders(buysH1: number, sellsH1: number): number {
    // max 10 pts — more buys than sells
    const total = buysH1 + sellsH1;
    if (total === 0) return 0;
    const buyRatio = buysH1 / total;
    if (buyRatio >= 0.75 && buysH1 >= 50) return 10;
    if (buyRatio >= 0.65 && buysH1 >= 20) return 8;
    if (buyRatio >= 0.55 && buysH1 >= 10) return 5;
    if (buyRatio >= 0.5) return 3;
    return 1;
  }

  private calcAge(pairCreatedAt: number): number {
    // max 5 pts — fresh token bonus (< 6h = freshest opportunity)
    const ageMs = Date.now() - pairCreatedAt;
    const ageH = ageMs / 3_600_000;
    if (ageH <= 1) return 5;
    if (ageH <= 3) return 4;
    if (ageH <= 6) return 3;
    if (ageH <= 12) return 2;
    if (ageH <= 24) return 1;
    return 0;
  }

  private buildReasoning(s: Omit<QuickScore, 'reasoning'>): string {
    const parts: string[] = [];
    if (s.liquidityScore >= 20) parts.push('liquidity:strong');
    else if (s.liquidityScore <= 3) parts.push('liquidity:weak');
    if (s.volumeScore >= 15) parts.push('volume:hot');
    if (s.priceVelocityScore >= 15) parts.push('momentum:bullish');
    else if (s.priceVelocityScore <= 2) parts.push('momentum:bearish');
    if (s.safetyScore <= 5) parts.push('safety:risky');
    else if (s.safetyScore >= 18) parts.push('safety:clean');
    if (s.ageBonus >= 4) parts.push('age:fresh');
    return parts.join(' | ') || `score:${s.total}`;
  }
}
