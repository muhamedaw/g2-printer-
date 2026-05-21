import type Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';

const log = createLogger('dna-checker');
const DNA_KEY_PREFIX = 'dna:creator:';

export interface DnaResult {
  matched:  boolean;
  reason?:  string;
}

export class DnaChecker {
  constructor(private readonly redis: Redis) {}

  async check(tokenMint: string, creatorWallet: string): Promise<DnaResult> {
    // Check if this creator has previously rugged
    const key = `${DNA_KEY_PREFIX}${creatorWallet}`;
    const record = await this.redis.get(key);
    if (!record) return { matched: false };

    let data: { ruggedTokens?: string[]; confidence?: number };
    try { data = JSON.parse(record); } catch { return { matched: false }; }

    const rugged = data.ruggedTokens ?? [];
    if (rugged.length > 0) {
      log.warn({ creatorWallet, ruggedCount: rugged.length, tokenMint }, 'DNA match — serial rugger detected');
      return {
        matched: true,
        reason:  `Creator has ${rugged.length} prior rug(s): ${rugged.slice(0, 3).join(', ')}`,
      };
    }
    return { matched: false };
  }

  async recordRug(creatorWallet: string, tokenMint: string): Promise<void> {
    const key = `${DNA_KEY_PREFIX}${creatorWallet}`;
    const existing = await this.redis.get(key);
    let data: { ruggedTokens: string[]; confidence: number } = { ruggedTokens: [], confidence: 0 };
    if (existing) {
      try { data = JSON.parse(existing); } catch { /* reset */ }
    }
    data.ruggedTokens.push(tokenMint);
    data.confidence = Math.min(data.ruggedTokens.length / 3, 1.0);
    await this.redis.set(key, JSON.stringify(data), 'EX', 86400 * 90); // 90-day TTL
    log.info({ creatorWallet, tokenMint }, 'Rug recorded in DNA store');
  }
}
