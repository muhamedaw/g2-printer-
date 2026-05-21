import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePlan } from '../lib/user-context.js';

interface WalletEntry {
  walletAddress: string;
  nickname:      string | null;
  pattern:       string;
  winRate:       number;
  avgProfitX:    number;
  totalTrades:   number;
  isActive:      boolean;
  score:         number;
  copyWeight:    number;
}

const addSchema = z.object({
  address:  z.string().min(32).max(44),
  nickname: z.string().max(40).optional(),
});

export default async function whalesRoutes(app: FastifyInstance) {
  // GET /api/whales — list all tracked wallets (pro+)
  app.get('/api/whales', {
    preHandler: [requireAuth, requirePlan('pro')],
  }, async (_req, reply) => {
    const raw = await app.redis.hgetall('whale:registry');
    const scores = await app.redis.hgetall('whale:scores');

    const wallets: WalletEntry[] = Object.values(raw).map(v => {
      const w = JSON.parse(v) as WalletEntry & { walletAddress: string };
      const scoreRaw = scores[w.walletAddress];
      const scoreData = scoreRaw ? JSON.parse(scoreRaw) as { score: number; copyWeight: number } : null;
      return {
        walletAddress: w.walletAddress,
        nickname:      w.nickname ?? null,
        pattern:       w.pattern,
        winRate:       w.winRate,
        avgProfitX:    w.avgProfitX,
        totalTrades:   w.totalTrades,
        isActive:      w.isActive,
        score:         scoreData?.score ?? 0,
        copyWeight:    scoreData?.copyWeight ?? 0.5,
      };
    });

    // Sort by score desc
    wallets.sort((a, b) => b.score - a.score);
    reply.send({ data: wallets, error: null });
  });

  // POST /api/whales — add wallet to track (pro+)
  app.post('/api/whales', {
    preHandler: [requireAuth, requirePlan('pro')],
  }, async (req, reply) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ data: null, error: 'Invalid body' });

    const { address, nickname } = parsed.data;
    // Publish request to market-data worker via Redis
    await app.redis.publish('whale:add_request', JSON.stringify({ address, nickname: nickname ?? null }));
    reply.status(202).send({ data: { queued: true, address }, error: null });
  });

  // GET /api/whales/stats — summary stats (pro+)
  app.get('/api/whales/stats', {
    preHandler: [requireAuth, requirePlan('pro')],
  }, async (_req, reply) => {
    const [total, scores] = await Promise.all([
      app.redis.hlen('whale:registry'),
      app.redis.hgetall('whale:scores'),
    ]);

    const scoreValues = Object.values(scores).map(v => {
      const d = JSON.parse(v) as { score: number };
      return d.score;
    });

    const avgScore = scoreValues.length > 0
      ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      : 0;

    const highQuality = scoreValues.filter(s => s >= 65).length;

    const copySignals24h = Number(await app.redis.get('metrics:market-data:copy_signals') ?? 0);

    reply.send({
      data: { total, avgScore: Math.round(avgScore), highQuality, copySignals24h },
      error: null,
    });
  });
}
