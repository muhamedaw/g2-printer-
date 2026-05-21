import type Redis from 'ioredis';
import type { TokenSafety } from '@mpg2/shared';
import { DEFAULT_RISK } from '@mpg2/shared';

const PREFIX = 'safety:';
const TTL = DEFAULT_RISK.SAFETY_CACHE_MINUTES * 60;

export class SafetyCache {
  constructor(private readonly redis: Redis) {}

  async get(mint: string): Promise<TokenSafety | null> {
    const raw = await this.redis.get(`${PREFIX}${mint}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as TokenSafety;
    if (new Date(data.expiresAt) < new Date()) {
      await this.redis.del(`${PREFIX}${mint}`);
      return null;
    }
    return data;
  }

  async set(safety: TokenSafety): Promise<void> {
    await this.redis.set(`${PREFIX}${safety.tokenAddress}`, JSON.stringify(safety), 'EX', TTL);
  }
}
