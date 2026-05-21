import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { toRawSignal } from '../normalizers/engagement.js';

const log = createLogger('reddit-scraper');

// Subreddits to monitor — using free public JSON API (no auth needed)
const SUBREDDITS = [
  'SolanaMemeCoins',
  'CryptoMoonShots',
  'pumpfun',
  'solana',
  'memecoinseason',
];

interface RedditPost {
  data: {
    title:         string;
    selftext:      string;
    score:         number;
    num_comments:  number;
    num_crossposts?: number;
    author:        string;
    created_utc:   number;
  };
}

interface RedditResponse {
  data: { children: RedditPost[] };
}

export class RedditScraper {
  private lastFetch  = 0;
  private subIndex   = 0;

  async fetchLatest(): Promise<RawSignal[]> {
    // Rotate through subreddits each call (one per invocation)
    const sub = SUBREDDITS[this.subIndex % SUBREDDITS.length]!;
    this.subIndex++;

    const wait = 5_000 - (Date.now() - this.lastFetch);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastFetch = Date.now();

    const signals: RawSignal[] = [];
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/new.json?limit=25`,
        {
          headers: { 'User-Agent': 'MoneyPrinterG2/1.0 (memecoin trading bot)' },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) return signals;
      const json = await res.json() as RedditResponse;
      const posts = json.data?.children ?? [];

      for (const { data: p } of posts) {
        signals.push(toRawSignal({
          platform:      'reddit',
          text:          `${p.title}\n${p.selftext ?? ''}`.trim(),
          authorUsername: p.author,
          followers:     0,
          likes:         p.score ?? 0,
          reposts:       p.num_crossposts ?? 0,
          replies:       p.num_comments ?? 0,
          views:         0,
          createdAt:     new Date(p.created_utc * 1000),
        }));
      }
    } catch (err) {
      log.debug({ sub, err: String(err) }, 'Reddit fetch failed');
    }

    return signals;
  }
}
