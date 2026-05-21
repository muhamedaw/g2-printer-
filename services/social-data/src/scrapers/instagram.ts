import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { toRawSignal } from '../normalizers/engagement.js';
import { IgApiClient } from 'instagram-private-api';

const log = createLogger('instagram-scraper');

const HASHTAGS = ['memecoin', 'solana', 'solanamemecoin', 'cryptogems', 'pumpfun', 'newtoken'];

interface IgMediaItem {
  caption?: { text?: string } | null;
  like_count?: number;
  comment_count?: number;
  taken_at?: number;
  user?: {
    username?: string;
    follower_count?: number;
  };
}

export class InstagramScraper {
  private ig: IgApiClient;
  private loggedIn = false;
  private lastFetch = 0;
  private readonly minInterval = 10 * 60 * 1000; // 10 min — Instagram bans aggressive scrapers

  constructor() {
    this.ig = new IgApiClient();
    this.ig.state.generateDevice(process.env['INSTAGRAM_USERNAME'] ?? 'mpg2_scraper');
  }

  private async ensureLogin(): Promise<boolean> {
    if (this.loggedIn) return true;

    const user = process.env['INSTAGRAM_USERNAME'];
    const pass = process.env['INSTAGRAM_PASSWORD'];
    if (!user || !pass) {
      log.warn('INSTAGRAM_USERNAME/PASSWORD not set — Instagram scraper disabled');
      return false;
    }

    try {
      await this.ig.simulate.preLoginFlow();
      await this.ig.account.login(user, pass);
      await this.ig.simulate.postLoginFlow();
      this.loggedIn = true;
      log.info('Instagram login successful');
      return true;
    } catch (err) {
      log.warn({ err }, 'Instagram login failed');
      return false;
    }
  }

  async fetchLatest(): Promise<RawSignal[]> {
    const now = Date.now();
    if (now - this.lastFetch < this.minInterval) return [];
    this.lastFetch = now;

    const ok = await this.ensureLogin();
    if (!ok) return [];

    const results: RawSignal[] = [];

    for (const tag of HASHTAGS) {
      try {
        const signals = await this.scrapeHashtag(tag);
        results.push(...signals);
      } catch (err) {
        log.warn({ err, tag }, 'Instagram hashtag scrape failed');
        // If login expired, force re-login next cycle
        if (String(err).includes('login_required')) this.loggedIn = false;
      }
      // Polite delay — Instagram is aggressive with rate limiting
      await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000));
    }

    log.info({ count: results.length }, 'Instagram scraped');
    return results;
  }

  private async scrapeHashtag(hashtag: string): Promise<RawSignal[]> {
    const feed = this.ig.feed.tag(hashtag);
    const page  = await feed.items() as IgMediaItem[];

    return page.slice(0, 15).map(item => {
      const text      = item.caption?.text ?? '';
      const likes     = item.like_count ?? 0;
      const comments  = item.comment_count ?? 0;
      const followers = item.user?.follower_count ?? 0;

      return toRawSignal({
        platform:      'instagram',
        text,
        authorUsername: item.user?.username,
        followers,
        likes,
        reposts:  0,
        replies:  comments,
        views:    0,
        createdAt: item.taken_at ? new Date(item.taken_at * 1000) : new Date(),
      });
    });
  }
}
