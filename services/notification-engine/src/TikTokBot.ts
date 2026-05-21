import { createLogger } from '@mpg2/shared';
import type { Trade } from '@mpg2/shared';

const log = createLogger('tiktok-bot');

// TikTok doesn't have a public posting API — this bot uses the internal
// Creator Marketplace / research API for monitoring trends only.
// Engagement (likes) is done via the social-data scraper which runs Playwright.
// This class handles: (1) trade caption drafting, (2) delegating engagement
// requests to social-data via Redis pub/sub, (3) pacing / daily limits.

const CRYPTO_TAGS = ['memecoin', 'solana', 'pumpfun', 'cryptogems', 'solanamemecoin', 'degen', 'newtoken'];

const BUY_CAPTIONS = [
  (s: string, score: number, usd: number) =>
    `🚀 New $${s} position\n📊 AI Score: ${score}/100\n💰 $${usd.toFixed(0)} paper trade\n\n#memecoin #solana #crypto`,
  (s: string, score: number, usd: number) =>
    `⚡ Signal on $${s} | ${score}% confidence\n💸 $${usd.toFixed(0)} entry (paper)\n\n#solana #memecoin #newtoken`,
  (s: string, score: number, usd: number) =>
    `👀 AI picked $${s} | score ${score}/100\n📈 $${usd.toFixed(0)} paper\n\n#crypto #solana #degen`,
];

const SELL_CAPTIONS = [
  (s: string, pct: number, pnl: number) =>
    `✅ Closed $${s} +${pct.toFixed(1)}%\n💰 +$${pnl.toFixed(0)} paper\n\n#solana #cryptogains #memecoin`,
  (s: string, pct: number, pnl: number) =>
    `🎯 $${s} take-profit hit!\n+${pct.toFixed(1)}% | +$${pnl.toFixed(0)} paper\n\n#solana #trading #crypto`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export class TikTokBot {
  private redis: import('ioredis').Redis | null = null;

  // Daily caption limit — captions are logged and can be posted manually or
  // via a separate TikTok Creator account with video upload rights.
  private dailyCaptionCount = 0;
  private lastDayReset = new Date().toDateString();
  private readonly MAX_DAILY_CAPTIONS = 10;

  private lastEngageAt = 0;
  private readonly MIN_ENGAGE_INTERVAL = 8 * 60 * 1000; // 8 min

  setRedis(redis: import('ioredis').Redis): void {
    this.redis = redis;
  }

  private resetDailyIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== this.lastDayReset) {
      this.dailyCaptionCount = 0;
      this.lastDayReset = today;
    }
  }

  // ─── Draft caption for a trade (store in Redis for manual / scheduled post) ─

  async draftCaption(trade: Trade): Promise<void> {
    this.resetDailyIfNeeded();
    if (this.dailyCaptionCount >= this.MAX_DAILY_CAPTIONS) return;
    if (!trade.tokenSymbol) return;

    const symbol = trade.tokenSymbol;
    let caption: string;

    if (trade.tradeType === 'BUY') {
      const score = Math.round(trade.finalScore * 100);
      caption = pick(BUY_CAPTIONS)(symbol, score, trade.usdAmount);
    } else {
      if (!trade.pnlPct || trade.pnlPct < 5) return; // only meaningful wins
      caption = pick(SELL_CAPTIONS)(symbol, trade.pnlPct, trade.pnlUsd ?? 0);
    }

    if (this.redis) {
      // Store caption in a Redis list — dashboard / manual operator can pick it up
      await this.redis.lpush('tiktok:pending-captions', JSON.stringify({
        caption,
        trade: { symbol, tradeType: trade.tradeType, pnlPct: trade.pnlPct },
        createdAt: new Date().toISOString(),
      })).catch(() => null);
      await this.redis.ltrim('tiktok:pending-captions', 0, 49).catch(() => null);
    }

    this.dailyCaptionCount++;
    log.info({ symbol, tradeType: trade.tradeType }, 'TikTok caption drafted');
  }

  // ─── Trigger hashtag engagement via social-data Playwright scraper ──────────

  async requestHashtagEngagement(): Promise<void> {
    if (Date.now() - this.lastEngageAt < this.MIN_ENGAGE_INTERVAL) return;
    this.lastEngageAt = Date.now();

    if (this.redis) {
      // Publish engage request — social-data worker subscribes and runs Playwright
      await this.redis.publish('tiktok:engage-request', JSON.stringify({
        tags: CRYPTO_TAGS,
        requestedAt: new Date().toISOString(),
      })).catch(() => null);
    }

    log.debug({ tags: CRYPTO_TAGS }, 'TikTok engagement request published');
  }

  // ─── Pending captions count (for dashboard visibility) ────────────────────

  async pendingCaptionCount(): Promise<number> {
    if (!this.redis) return 0;
    return this.redis.llen('tiktok:pending-captions').catch(() => 0);
  }
}
