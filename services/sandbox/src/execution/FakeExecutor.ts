import { createId } from '@paralleldrive/cuid2';
import type { SandboxPosition, SandboxTrade, SandboxConfig, TokenSnapshot, QuickScore, ExitReason } from '@mpg2/shared';

const SLIPPAGE = 0.003; // 0.3% fake slippage

export class FakeExecutor {
  buy(
    config: SandboxConfig,
    token: TokenSnapshot,
    score: QuickScore,
    availableCapital: number,
  ): { position: SandboxPosition; trade: SandboxTrade } | null {
    const usdAmount = availableCapital * (config.positionSizePercent / 100);
    if (usdAmount < 1) return null;

    const effectivePrice = token.priceUsd * (1 + SLIPPAGE);
    const tokensReceived = usdAmount / effectivePrice;

    const position: SandboxPosition = {
      positionId: createId(),
      tokenMint: token.mint,
      tokenSymbol: token.symbol,
      tokenName: token.name,
      entryPrice: effectivePrice,
      currentPrice: effectivePrice,
      fakeSolSpent: usdAmount,
      fakeTokensHeld: tokensReceived,
      score: score.total,
      openedAt: new Date(),
      pnlUsd: 0,
      pnlPercent: 0,
    };

    const trade: SandboxTrade = {
      tradeId: createId(),
      sessionId: config.sessionId,
      tokenMint: token.mint,
      tokenSymbol: token.symbol,
      action: 'BUY',
      fakeUsdAmount: usdAmount,
      price: effectivePrice,
      score: score.total,
      executedAt: new Date(),
    };

    return { position, trade };
  }

  sell(
    config: SandboxConfig,
    position: SandboxPosition,
    currentPrice: number,
    exitReason: ExitReason,
  ): SandboxTrade {
    const effectivePrice = currentPrice * (1 - SLIPPAGE);
    const proceeds = position.fakeTokensHeld * effectivePrice;
    const pnlUsd = proceeds - position.fakeSolSpent;
    const pnlPercent = (pnlUsd / position.fakeSolSpent) * 100;

    return {
      tradeId: createId(),
      sessionId: config.sessionId,
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      action: 'SELL',
      fakeUsdAmount: proceeds,
      price: effectivePrice,
      score: position.score,
      exitReason,
      pnlUsd,
      pnlPercent,
      executedAt: new Date(),
    };
  }
}
