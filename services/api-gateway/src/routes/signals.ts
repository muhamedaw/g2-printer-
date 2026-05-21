import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql, gte } from 'drizzle-orm';
import { rawSignals, aiSignals } from '@mpg2/db';
import { requireAuth } from '../middleware/auth.js';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  platform: z.enum(['twitter', 'reddit', 'telegram', 'news', 'all']).default('all'),
});

export default async function signalsRoutes(app: FastifyInstance) {
  app.get('/api/signals', { preHandler: [requireAuth] }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ data: null, error: 'Invalid query' });
    const { limit, platform } = q.data;

    const conditions = platform === 'all' ? [] : [eq(rawSignals.platform, platform)];
    const rows = await app.db.select().from(rawSignals)
      .where(conditions.length > 0 ? conditions[0] : undefined)
      .orderBy(sql`${rawSignals.createdAt} desc`)
      .limit(limit);

    reply.send({ data: rows, error: null });
  });

  app.get('/api/signals/stats', { preHandler: [requireAuth] }, async (req, reply) => {
    const since = new Date(Date.now() - 86_400_000); // last 24h
    const rows = await app.db.select({
      platform: rawSignals.platform,
      count: sql<number>`count(*)::int`,
    }).from(rawSignals)
      .where(gte(rawSignals.createdAt, since))
      .groupBy(rawSignals.platform);

    reply.send({ data: rows, error: null });
  });
}
