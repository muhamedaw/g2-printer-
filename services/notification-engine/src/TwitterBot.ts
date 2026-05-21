import { TwitterApi, type TwitterApiReadWrite } from 'twitter-api-v2';
import { createLogger } from '@mpg2/shared';
import type { Trade } from '@mpg2/shared';

const log = createLogger('twitter-bot');

// Key accounts to monitor (Twitter user IDs)
const INFLUENCERS = [
  { username: 'elonmusk',     id: '44196397' },
  { username: 'CryptoRover',  id: '1016645102' },
  { username: 'solana',       id: '1006285458097278976' },
  { username: 'pumpdotfun',   id: '1737542816892899328' },
];

// Keywords that suggest crypto/memecoin relevance
const CRYPTO_KEYWORDS = ['crypto', 'bitcoin', 'solana', 'memecoin', 'doge', 'token', 'coin', 'defi', 'web3', 'nft', 'pump', 'gem'];

// Buy tweet templates (random pick each time)
const BUY_TEMPLATES = [
  (s: string, score: number, usd: number) =>
    `🚀 AI picked up a signal on $${s}\n📊 Confidence score: ${score}/100\n💰 Position: $${usd.toFixed(0)} (paper)\n\n#Solana #Memecoin #CryptoAI`,
  (s: string, score: number, usd: number) =>
    `👀 New position opened: $${s}\n🤖 AI score: ${score}/100\n📈 Size: $${usd.toFixed(0)} paper\n\n#Solana #Degen #NewToken`,
  (s: string, score: number, usd: number) =>
    `⚡ Signal detected: $${s}\n🧠 Model confidence: ${score}%\n💸 Entry: $${usd.toFixed(0)} paper\n\n#Solana #Memecoin`,
];

// Sell/profit tweet templates
const WIN_TEMPLATES = [
  (s: string, pct: number, pnl: number) =>
    `✅ Closed $${s} position\n📈 +${pct.toFixed(1)}% gain\n💰 +$${pnl.toFixed(0)} (paper)\n\n#Solana #CryptoGains #Memecoin`,
  (s: string, pct: number, pnl: number) =>
    `🎯 $${s} take-profit hit!\n📊 Return: +${pct.toFixed(1)}%\n💵 P&L: +$${pnl.toFixed(0)} paper\n\n#Solana #Trading`,
  (s: string, pct: number, pnl: number) =>
    `🏆 Another win on $${s}\n+${pct.toFixed(1)}% | +$${pnl.toFixed(0)} paper\n🤖 AI keeps delivering\n\n#Solana #Memecoin #CryptoAI`,
];

// Influencer engagement templates
const ENGAGE_TEMPLATES = [
  (user: string) => `👀 @${user} is talking crypto — market could get interesting\n\n#Solana #Memecoin`,
  (user: string) => `🔥 Eyes on the market after @${user}'s post\n\n#Crypto #Solana`,
  (user: string) => `📡 Signal alert — @${user} just moved the needle\n\n#Solana #Degen`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function isCryptoRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return CRYPTO_KEYWORDS.some(kw => lower.includes(kw));
}

export class TwitterBot {
  private client: TwitterApi | null = null;
  private rwClient: TwitterApiReadWrite | null = null;
  private myUserId: string | null = null;
  private redis: import('ioredis').Redis | null = null;

  setRedis(redis: import('ioredis').Redis): void { this.redis = redis; }

  private lastPostedAt = 0;
  private dailyTweetCount = 0;
  private lastDayReset = new Date().toDateString();
  private readonly MAX_DAILY_TWEETS = 15;
  private readonly MIN_TWEET_INTERVAL = 5 * 60 * 1000; // 5 min between posts

  private seenTweetIds = new Set<string>(); // avoid re-engaging
  private lastInfluencerCheck = 0;
  private readonly INFLUENCER_CHECK_INTERVAL = 10 * 60 * 1000; // 10 min

  constructor() {
    const key    = process.env['TWITTER_API_KEY'];
    const secret = process.env['TWITTER_API_SECRET'];
    const token  = process.env['TWITTER_ACCESS_TOKEN'];
    const tsecret = process.env['TWITTER_ACCESS_SECRET'];

    if (!key || !secret || !token || !tsecret) {
      log.warn('Twitter credentials incomplete — bot disabled');
      return;
    }

    this.client = new TwitterApi({
      appKey:      key,
      appSecret:   secret,
      accessToken: token,
      accessSecret: tsecret,
    });
    this.rwClient = this.client.readWrite;
    log.info('Twitter bot initialized');
  }

  // ─── Rate limiting helpers ─────────────────────────────────────────────────

  private canTweet(): boolean {
    const today = new Date().toDateString();
    if (today !== this.lastDayReset) {
      this.dailyTweetCount = 0;
      this.lastDayReset = today;
    }
    if (this.dailyTweetCount >= this.MAX_DAILY_TWEETS) return false;
    if (Date.now() - this.lastPostedAt < this.MIN_TWEET_INTERVAL) return false;
    return true;
  }

  private async post(text: string, meta?: Record<string, unknown>): Promise<string | null> {
    if (!this.rwClient || !this.canTweet()) return null;
    try {
      const tweet = await this.rwClient.v2.tweet(text);
      this.lastPostedAt = Date.now();
      this.dailyTweetCount++;
      log.info({ tweetId: tweet.data.id }, 'Tweet posted');
      await this.logActivity('post', text, meta);
      return tweet.data.id;
    } catch (err) {
      log.warn({ err }, 'Tweet failed');
      return null;
    }
  }

  private async logActivity(action: string, content: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.redis) return;
    const entry = JSON.stringify({ platform: 'twitter', action, content, ...meta, createdAt: new Date().toISOString() });
    await this.redis.lpush('social:activity', entry).catch(() => null);
    await this.redis.ltrim('social:activity', 0, 499).catch(() => null);
  }

  private async getMyUserId(): Promise<string | null> {
    if (this.myUserId) return this.myUserId;
    if (!this.rwClient) return null;
    try {
      const me = await this.rwClient.v2.me();
      this.myUserId = me.data.id;
      return this.myUserId;
    } catch { return null; }
  }

  // ─── Trade announcements ───────────────────────────────────────────────────

  async announceBuy(trade: Trade): Promise<void> {
    if (!trade.tokenSymbol) return;
    const score = Math.round(trade.finalScore * 100);
    const text  = pick(BUY_TEMPLATES)(trade.tokenSymbol, score, trade.usdAmount);
    await this.post(text);
  }

  async announceSell(trade: Trade): Promise<void> {
    if (!trade.tokenSymbol || !trade.pnlUsd || !trade.pnlPct) return;
    if (trade.pnlPct < 5) return; // only announce meaningful wins

    const text = pick(WIN_TEMPLATES)(trade.tokenSymbol, trade.pnlPct, trade.pnlUsd);
    await this.post(text);
  }

  // ─── Influencer monitoring ─────────────────────────────────────────────────

  async monitorInfluencers(): Promise<void> {
    if (!this.rwClient) return;
    const now = Date.now();
    if (now - this.lastInfluencerCheck < this.INFLUENCER_CHECK_INTERVAL) return;
    this.lastInfluencerCheck = now;

    for (const influencer of INFLUENCERS) {
      try {
        await this.checkInfluencer(influencer.id, influencer.username);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        log.debug({ err, username: influencer.username }, 'Influencer check failed');
      }
    }
  }

  private async checkInfluencer(userId: string, username: string): Promise<void> {
    if (!this.rwClient) return;

    const timeline = await this.rwClient.v2.userTimeline(userId, {
      max_results: 5,
      'tweet.fields': ['created_at', 'public_metrics'],
    });

    const tweets = timeline.data.data ?? [];
    const myId   = await this.getMyUserId();

    for (const tweet of tweets) {
      if (this.seenTweetIds.has(tweet.id)) continue;
      this.seenTweetIds.add(tweet.id);

      if (!isCryptoRelated(tweet.text)) continue;

      // Like the tweet
      if (myId) {
        await this.rwClient.v2.like(myId, tweet.id).catch(() => null);
        log.debug({ tweetId: tweet.id, username }, 'Liked influencer tweet');
        await this.logActivity('like', tweet.text.slice(0, 120), { target: `@${username}`, tweetId: tweet.id });
      }

      // Post a related tweet (with additional rate limiting)
      if (this.canTweet()) {
        await new Promise(r => setTimeout(r, 3000));
        const text = pick(ENGAGE_TEMPLATES)(username);
        await this.post(text, { trigger: `influencer:${username}` });
      }
    }

    // Keep seen set bounded
    if (this.seenTweetIds.size > 1000) {
      const arr = [...this.seenTweetIds].slice(-500);
      this.seenTweetIds = new Set(arr);
    }
  }

  // ─── Coin-specific engagement ──────────────────────────────────────────────

  async likeCoinMentions(tokenSymbol: string): Promise<void> {
    if (!this.rwClient) return;
    const myId = await this.getMyUserId();
    if (!myId) return;

    try {
      const results = await this.rwClient.v2.search(`$${tokenSymbol} solana -is:retweet`, {
        max_results: 10,
        'tweet.fields': ['public_metrics'],
      });

      const tweets = results.data.data ?? [];
      for (const tweet of tweets.slice(0, 5)) {
        if (this.seenTweetIds.has(tweet.id)) continue;
        this.seenTweetIds.add(tweet.id);
        await this.rwClient.v2.like(myId, tweet.id).catch(() => null);
        await this.logActivity('like', tweet.text.slice(0, 120), { target: `$${tokenSymbol}`, tweetId: tweet.id });
        await new Promise(r => setTimeout(r, 1500));
      }

      if (tweets.length > 0) {
        log.debug({ count: tweets.length, tokenSymbol }, 'Liked coin mentions');
      }
    } catch (err) {
      log.debug({ err, tokenSymbol }, 'Coin mentions search failed');
    }
  }
}
