import type Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';
import { REGIME_MIN_SCORE } from '@mpg2/shared';

const log = createLogger('regime-detector');

export type MarketRegime = 'EXTREME_BULL' | 'BULL' | 'SIDEWAYS' | 'BEAR' | 'EXTREME_BEAR';

const REDIS_KEY = 'market:regime';

interface RegimeData {
  regime: MarketRegime;
  minScore: number;
  updatedAt: string;
}

export class RegimeDetector {
  constructor(private readonly redis: Redis) {}

  async detect(): Promise<MarketRegime> {
    // Read BTC/SOL 24h price change from market data
    const tokenData = await this.redis.get('market:sol_price_change_24h');
    const change = tokenData ? parseFloat(tokenData) : 0;

    const regime = this.classifyRegime(change);
    const data: RegimeData = {
      regime,
      minScore: REGIME_MIN_SCORE[regime],
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(REDIS_KEY, JSON.stringify(data), 'EX', 3600);
    log.info({ regime, change24h: change }, 'Market regime updated');
    return regime;
  }

  async getCurrent(): Promise<RegimeData> {
    const raw = await this.redis.get(REDIS_KEY);
    if (!raw) {
      return { regime: 'SIDEWAYS', minScore: REGIME_MIN_SCORE['SIDEWAYS'], updatedAt: new Date().toISOString() };
    }
    return JSON.parse(raw) as RegimeData;
  }

  private classifyRegime(change24h: number): MarketRegime {
    if (change24h > 10)   return 'EXTREME_BULL';
    if (change24h > 3)    return 'BULL';
    if (change24h > -3)   return 'SIDEWAYS';
    if (change24h > -10)  return 'BEAR';
    return 'EXTREME_BEAR';
  }
}
