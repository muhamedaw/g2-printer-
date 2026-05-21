import Parser from 'rss-parser';
import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { toRawSignal } from '../normalizers/engagement.js';

const log = createLogger('cryptopanic-scraper');
const parser = new Parser();
const FEEDS = [
  'https://cryptopanic.com/news/rss/',
  'https://cryptopanic.com/news/solana/rss/',
];

export class CryptoPanicScraper {
  private seen = new Set<string>();

  async fetchLatest(): Promise<RawSignal[]> {
    const feed = FEEDS[Math.floor(Math.random() * FEEDS.length)]!;
    const signals: RawSignal[] = [];

    try {
      const result = await Promise.race([
        parser.parseURL(feed),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000)),
      ]);

      for (const item of result.items.slice(0, 20)) {
        const id = item.guid ?? item.link ?? item.title ?? '';
        if (!id || this.seen.has(id)) continue;
        this.seen.add(id);
        if (this.seen.size > 1000) {
          const first = this.seen.values().next().value;
          if (first) this.seen.delete(first);
        }

        signals.push(toRawSignal({
          platform: 'news',
          text: `${item.title ?? ''} ${item.contentSnippet ?? ''}`.trim(),
          authorUsername: item.creator ?? 'cryptopanic',
          followers: 0,
          likes: 0,
          reposts: 0,
          replies: 0,
          views: 0,
          createdAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        }));
      }
    } catch (err) {
      log.warn({ err, feed }, 'CryptoPanic RSS fetch failed');
    }

    return signals;
  }
}
