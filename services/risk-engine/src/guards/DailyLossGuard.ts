import type Redis from 'ioredis';
import { DEFAULT_RISK } from '@mpg2/shared';

const KEY_PREFIX = 'risk:daily_loss:';

export class DailyLossGuard {
  constructor(private readonly redis: Redis) {}

  async canTrade(userId: string, portfolioUsd: number): Promise<{ allowed: boolean; reason?: string }> {
    const key = `${KEY_PREFIX}${userId}:${this.today()}`;
    const raw = await this.redis.get(key);
    const lossUsd = raw ? parseFloat(raw) : 0;
    const lossLimit = portfolioUsd * DEFAULT_RISK.DAILY_LOSS_LIMIT_PCT;

    if (lossUsd >= lossLimit) {
      return {
        allowed: false,
        reason: `Daily loss limit reached: $${lossUsd.toFixed(2)} / $${lossLimit.toFixed(2)}`,
      };
    }
    return { allowed: true };
  }

  async recordLoss(userId: string, lossUsd: number): Promise<void> {
    const key = `${KEY_PREFIX}${userId}:${this.today()}`;
    await this.redis.incrbyfloat(key, lossUsd);
    await this.redis.expire(key, 86400 * 2); // 2-day TTL
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
