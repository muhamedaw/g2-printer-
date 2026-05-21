import { createLogger, DEFAULT_RISK } from '@mpg2/shared';
import type { BuySignal, Trade, Position } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('paper-executor');
const SLIPPAGE = 0.003; // 0.3% paper slippage

export class PaperExecutor {
  constructor(private readonly redis: Redis) {}

  async buy(signal: BuySignal, currentPrice: number): Promise<{ trade: Trade; position: Position }> {
    const slippagePrice = currentPrice * (1 + SLIPPAGE);
    const quantityTokens = signal.positionSizeUsd / slippagePrice;

    const trade: Trade = {
      userId:          signal.userId,
      contractAddress: signal.contractAddress,
      tokenSymbol:     signal.tokenSymbol,
      tradeType:       'BUY',
      isPaperTrade:    true,
      source:          signal.source,
      entryPrice:      slippagePrice,
      quantityTokens,
      solAmount:       0,
      usdAmount:       signal.positionSizeUsd,
      finalScore:      signal.finalScore,
      createdAt:       new Date(),
    };

    const position: Position = {
      userId:              signal.userId,
      contractAddress:     signal.contractAddress,
      tokenSymbol:         signal.tokenSymbol,
      source:              signal.source,
      entryPrice:          slippagePrice,
      highestPriceSeen:    slippagePrice,
      quantityRemaining:   quantityTokens,
      usdInvested:         signal.positionSizeUsd,
      tp1Executed:         false,
      tp2Executed:         false,
      tp3Executed:         false,
      trailingStopActive:  false,
      finalScore:          signal.finalScore,
      isPaperTrade:        true,
      openedAt:            new Date(),
      updatedAt:           new Date(),
    };

    // Persist to Redis for position manager
    await this.redis.hset(`position:${signal.userId}:${signal.contractAddress}`, {
      data: JSON.stringify(position),
    });
    await this.redis.sadd(`positions:${signal.userId}`, signal.contractAddress);

    log.info({
      userId:   signal.userId,
      contract: signal.contractAddress,
      usd:      signal.positionSizeUsd.toFixed(2),
      price:    slippagePrice.toFixed(8),
    }, 'Paper BUY executed');

    return { trade, position };
  }

  async sell(
    position: Position,
    currentPrice: number,
    sellPct: number,
    tradeType: Trade['tradeType'],
  ): Promise<Trade> {
    const slippagePrice = currentPrice * (1 - SLIPPAGE);
    const qty = position.quantityRemaining * sellPct;
    const proceeds = qty * slippagePrice;
    const invested = position.usdInvested * sellPct;
    const pnlUsd = proceeds - invested;
    const pnlPct = (proceeds - invested) / invested;

    const trade: Trade = {
      userId:          position.userId,
      contractAddress: position.contractAddress,
      tokenSymbol:     position.tokenSymbol,
      source:          position.source,
      tradeType,
      isPaperTrade:    true,
      entryPrice:      position.entryPrice,
      exitPrice:       slippagePrice,
      quantityTokens:  qty,
      solAmount:       0,
      usdAmount:       proceeds,
      pnlUsd,
      pnlPct,
      finalScore:      position.finalScore,
      createdAt:       new Date(),
    };

    log.info({
      userId:    position.userId,
      contract:  position.contractAddress,
      type:      tradeType,
      pnlPct:    (pnlPct * 100).toFixed(1),
      proceeds:  proceeds.toFixed(2),
    }, 'Paper SELL executed');

    return trade;
  }
}
