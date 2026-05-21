import { chromium, type Page } from 'playwright';
import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { toRawSignal } from '../normalizers/engagement.js';

const log = createLogger('tiktok-scraper');

const HASHTAGS = ['memecoin', 'solana', 'pumpfun', 'cryptogems', 'newtoken', 'solanamemecoin', 'degen'];

// Use system Chromium in Docker (set via ENV), otherwise Playwright's own
const CHROMIUM_PATH = process.env['CHROMIUM_PATH'];

interface TikTokVideoRaw {
  desc?: string;
  stats?: {
    diggCount?: number;
    commentCount?: number;
    shareCount?: number;
    playCount?: number;
  };
  author?: {
    uniqueId?: string;
    stats?: { followerCount?: number };
  };
  authorStats?: { followerCount?: number };
  createTime?: number;
}

export class TikTokScraper {
  private lastFetch = 0;
  private readonly minInterval = 5 * 60 * 1000;

  async fetchLatest(): Promise<RawSignal[]> {
    const now = Date.now();
    if (now - this.lastFetch < this.minInterval) return [];
    this.lastFetch = now;

    const browser = await chromium.launch({
      ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const results: RawSignal[] = [];
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });
      const page = await context.newPage();

      for (const tag of HASHTAGS) {
        try {
          const signals = await this.scrapeHashtag(page, tag);
          results.push(...signals);
        } catch (err) {
          log.warn({ err, tag }, 'TikTok hashtag scrape failed');
        }
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      }

      await context.close();
    } finally {
      await browser.close();
    }

    log.info({ count: results.length }, 'TikTok scraped');
    return results;
  }

  private async scrapeHashtag(page: Page, hashtag: string): Promise<RawSignal[]> {
    const intercepted: TikTokVideoRaw[] = [];

    // Intercept XHR responses from TikTok's internal API
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/challenge/item_list') || url.includes('/api/recommend/item_list')) {
        try {
          const json = await response.json() as Record<string, unknown>;
          const items = (json['itemList'] ?? json['items'] ?? []) as TikTokVideoRaw[];
          intercepted.push(...items.slice(0, 20));
        } catch { /* ignore */ }
      }
    });

    await page.goto(`https://www.tiktok.com/tag/${hashtag}`, {
      waitUntil: 'networkidle',
      timeout: 25_000,
    });

    // Fallback: parse embedded JSON if XHR wasn't intercepted
    if (intercepted.length === 0) {
      const embedded = await page.evaluate(() => {
        const el = document.querySelector('#SIGI_STATE') ??
                   document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (!el?.textContent) return null;
        try { return JSON.parse(el.textContent) as unknown; } catch { return null; }
      });

      if (embedded && typeof embedded === 'object') {
        const d = embedded as Record<string, unknown>;
        const itemModule = d['ItemModule'];
        if (itemModule && typeof itemModule === 'object') {
          intercepted.push(...Object.values(itemModule as Record<string, unknown>).slice(0, 20) as TikTokVideoRaw[]);
        }
      }
    }

    return intercepted.map(item => toRawSignal({
      platform:      'tiktok',
      text:          item.desc ?? '',
      authorUsername: item.author?.uniqueId,
      followers:     item.authorStats?.followerCount ?? item.author?.stats?.followerCount ?? 0,
      likes:         item.stats?.diggCount ?? 0,
      reposts:       item.stats?.shareCount ?? 0,
      replies:       item.stats?.commentCount ?? 0,
      views:         item.stats?.playCount ?? 0,
      createdAt:     item.createTime ? new Date(item.createTime * 1000) : new Date(),
    }));
  }
}
