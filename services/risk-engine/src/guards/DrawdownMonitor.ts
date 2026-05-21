import type Redis from 'ioredis';
import { DEFAULT_RISK, createLogger } from '@mpg2/shared';

const log = createLogger('drawdown-monitor');
const KEY_PREFIX = 'risk:drawdown:';

export class DrawdownMonitor {
  constructor(private readonly redis: Redis) {}

  async updatePeak(userId: string, portfolioUsd: number): Promise<void> {
    const key = `${KEY_PREFIX}${userId}:peak`;
    const current = await this.redis.get(key);
    const peak = current ? parseFloat(current) : 0;
    if (portfolioUsd > peak) {
      await this.redis.set(key, portfolioUsd.toString());
    }
  }

  async getDrawdown(userId: string, portfolioUsd: number): Promise<number> {
    const key = `${KEY_PREFIX}${userId}:peak`;
    const raw = await this.redis.get(key);
    const peak = raw ? parseFloat(raw) : portfolioUsd;
    if (peak === 0) return 0;
    return (peak - portfolioUsd) / peak;
  }

  async isBreached(userId: string, portfolioUsd: number): Promise<boolean> {
    const drawdown = await this.getDrawdown(userId, portfolioUsd);
    if (drawdown > DEFAULT_RISK.WEEKLY_LOSS_LIMIT_PCT) {
      log.warn({ userId, drawdown: (drawdown * 100).toFixed(1) }, 'Weekly drawdown limit breached');
      return true;
    }
    return false;
  }
}
