import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

interface ActivityEntry {
  platform: 'twitter' | 'instagram' | 'tiktok';
  action: 'post' | 'like' | 'follow' | 'caption';
  content: string;
  target?: string;
  symbol?: string;
  tradeType?: string;
  tweetId?: string;
  mediaId?: string;
  trigger?: string;
  createdAt: string;
}

interface TikTokCaption {
  caption: string;
  trade: { symbol: string; tradeType: string; pnlPct?: number };
  createdAt: string;
}

export default async function socialRoutes(app: FastifyInstance) {
  // GET /api/social/activity — last 200 bot actions across all platforms
  app.get('/api/social/activity', { preHandler: [requireAuth] }, async (_req, reply) => {
    const raw = await app.redis.lrange('social:activity', 0, 199);
    const items: ActivityEntry[] = raw.map(r => {
      try { return JSON.parse(r) as ActivityEntry; }
      catch { return null; }
    }).filter(Boolean) as ActivityEntry[];

    reply.send({ data: items, error: null });
  });

  // GET /api/social/tiktok-captions — pending TikTok captions
  app.get('/api/social/tiktok-captions', { preHandler: [requireAuth] }, async (_req, reply) => {
    const raw = await app.redis.lrange('tiktok:pending-captions', 0, 49);
    const items: TikTokCaption[] = raw.map(r => {
      try { return JSON.parse(r) as TikTokCaption; }
      catch { return null; }
    }).filter(Boolean) as TikTokCaption[];

    reply.send({ data: items, error: null });
  });

  // GET /api/social/stats — summary counts per platform
  app.get('/api/social/stats', { preHandler: [requireAuth] }, async (_req, reply) => {
    const raw = await app.redis.lrange('social:activity', 0, 499);
    const items: ActivityEntry[] = raw.map(r => {
      try { return JSON.parse(r) as ActivityEntry; }
      catch { return null; }
    }).filter(Boolean) as ActivityEntry[];

    const stats = {
      twitter:   { posts: 0, likes: 0 },
      instagram: { posts: 0, likes: 0, follows: 0 },
      tiktok:    { captions: 0 },
    };

    for (const item of items) {
      if (item.platform === 'twitter') {
        if (item.action === 'post') stats.twitter.posts++;
        else if (item.action === 'like') stats.twitter.likes++;
      } else if (item.platform === 'instagram') {
        if (item.action === 'post') stats.instagram.posts++;
        else if (item.action === 'like') stats.instagram.likes++;
        else if (item.action === 'follow') stats.instagram.follows++;
      } else if (item.platform === 'tiktok') {
        if (item.action === 'caption') stats.tiktok.captions++;
      }
    }

    const tikCount = await app.redis.llen('tiktok:pending-captions').catch(() => 0);
    stats.tiktok.captions = tikCount;

    reply.send({ data: stats, error: null });
  });
}
