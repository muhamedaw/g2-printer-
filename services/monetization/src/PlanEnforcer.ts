import type Redis from 'ioredis';
import { PLAN_LIMITS, createLogger } from '@mpg2/shared';
import type { PlanTier } from '@mpg2/shared';

const log = createLogger('plan-enforcer');

const PLAN_KEY  = (userId: string) => `user:${userId}:plan`;
const PAUSE_KEY = (userId: string) => `trading:${userId}:paused`;

export class PlanEnforcer {
  constructor(private readonly redis: Redis) {}

  async getUserPlan(userId: string): Promise<PlanTier> {
    const raw = await this.redis.get(PLAN_KEY(userId));
    if (!raw) return 'free';
    return raw as PlanTier;
  }

  async setUserPlan(userId: string, plan: PlanTier): Promise<void> {
    await this.redis.set(PLAN_KEY(userId), plan);
    await this.redis.set(
      `user:${userId}:max_positions`,
      String(PLAN_LIMITS[plan].maxPositions),
    );
    if (PLAN_LIMITS[plan].liveTrading) {
      await this.redis.sadd('users:live_trading', userId);
    } else {
      await this.redis.srem('users:live_trading', userId);
    }
    log.info({ userId, plan }, 'Plan updated in Redis');
  }

  async canOpenPosition(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const plan = await this.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan];

    if (!limits.liveTrading) {
      return { allowed: false, reason: `Plan "${plan}" does not include live trading` };
    }

    const paused = await this.redis.get(PAUSE_KEY(userId));
    if (paused) {
      return { allowed: false, reason: 'Trading paused by user' };
    }

    const openCount = await this.redis.scard(`positions:${userId}`);
    if (openCount >= limits.maxPositions) {
      return {
        allowed: false,
        reason: `Max positions reached (${openCount}/${limits.maxPositions}) for plan "${plan}"`,
      };
    }

    return { allowed: true };
  }

  async getSignalDelay(userId: string): Promise<number> {
    const plan = await this.getUserPlan(userId);
    return PLAN_LIMITS[plan].signalDelay;
  }

  async hasApiAccess(userId: string): Promise<boolean> {
    const plan = await this.getUserPlan(userId);
    return PLAN_LIMITS[plan].apiAccess;
  }

  async hasCopyTrading(userId: string): Promise<boolean> {
    const plan = await this.getUserPlan(userId);
    return PLAN_LIMITS[plan].copyTrading;
  }
}
