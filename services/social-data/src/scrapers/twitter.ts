import { TwitterApi } from 'twitter-api-v2';
import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { toRawSignal } from '../normalizers/engagement.js';

const log = createLogger('twitter-scraper');

const QUERIES = [
  'solana memecoin pump -is:retweet lang:en',
  'solana new token launch -is:retweet lang:en',
  '$SOL gem -is:retweet lang:en',
];

export class TwitterScraper {
  private client: TwitterApi | null = null;
  private sinceId: string | undefined;
  private disabledUntil = 0; // Unix ms — backoff when credits depleted

  constructor() {
    const bearer = process.env['TWITTER_BEARER_TOKEN'];
    if (bearer) {
      this.client = new TwitterApi(bearer);
    } else {
      log.warn('TWITTER_BEARER_TOKEN not set — Twitter scraper disabled');
    }
  }

  async fetchLatest(): Promise<RawSignal[]> {
    if (!this.client) return [];
    if (Date.now() < this.disabledUntil) return []; // silently back off

    const query = QUERIES[Math.floor(Math.random() * QUERIES.length)]!;
    const signals: RawSignal[] = [];

    try {
      const res = await this.client.v2.search(query, {
        max_results: 20,
        ...(this.sinceId ? { since_id: this.sinceId } : {}),
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'text'],
        expansions: ['author_id'],
        'user.fields': ['public_metrics'],
      });

      const tweets = res.data.data ?? [];
      const users  = new Map((res.data.includes?.users ?? []).map(u => [u.id, u]));
      if (tweets.length > 0) this.sinceId = tweets[0]!.id;

      for (const tweet of tweets) {
        const m         = tweet.public_metrics;
        const author    = users.get(tweet.author_id ?? '');
        const followers = author?.public_metrics?.followers_count ?? 0;

        signals.push(toRawSignal({
          platform: 'twitter',
          text: tweet.text,
          authorUsername: author?.username,
          followers,
          likes:    m?.like_count ?? 0,
          reposts:  m?.retweet_count ?? 0,
          replies:  m?.reply_count ?? 0,
          views:    m?.impression_count ?? 0,
          createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
        }));
      }
    } catch (err) {
      const msg = String((err as { data?: { title?: string } })?.data?.title ?? err);
      if (msg.includes('CreditsDepleted') || msg.includes('403')) {
        // Pause for 6 hours, log once
        this.disabledUntil = Date.now() + 6 * 60 * 60 * 1_000;
        log.warn('Twitter API credits depleted — pausing for 6h');
      } else {
        log.debug({ query, msg }, 'Twitter search failed');
      }
    }

    return signals;
  }
}
