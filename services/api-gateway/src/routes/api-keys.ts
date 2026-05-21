import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { eq, and } from 'drizzle-orm';
import { apiKeys } from '@mpg2/db';
import { z } from 'zod';
import { getUser, requirePlan } from '../lib/user-context.js';
import { requireAuth } from '../middleware/auth.js';

const createSchema = z.object({
  name:  z.string().min(1).max(64),
  limit: z.number().int().min(100).max(100_000).default(10_000),
});

export default async function apiKeyRoutes(app: FastifyInstance) {

  // List API keys
  app.get('/api/keys', { preHandler: [requireAuth, requirePlan('pro')] }, async (req, reply) => {
    const { id } = getUser(req);
    const rows = await app.db.select({
      id: apiKeys.id, name: apiKeys.name,
      requestsToday: apiKeys.requestsToday, requestLimit: apiKeys.requestLimit,
      lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.userId, id));
    reply.send({ data: rows, error: null });
  });

  // Create API key — returns raw key once only
  app.post('/api/keys', { preHandler: [requireAuth, requirePlan('pro')] }, async (req, reply) => {
    const { id: userId } = getUser(req);
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ data: null, error: 'Invalid input' });

    const existing = await app.db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    if (existing.length >= 5) return reply.status(400).send({ data: null, error: 'Max 5 API keys per user' });

    const rawKey  = `mpg2_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await app.db.insert(apiKeys).values({
      id: createId(),
      userId,
      name:         body.data.name,
      keyHash,
      requestLimit: body.data.limit,
      requestsToday: 0,
    });

    app.audit(req, 'api_key.created', { name: body.data.name });
    // Return raw key — shown once
    reply.status(201).send({ data: { key: rawKey, name: body.data.name }, error: null });
  });

  // Delete API key
  app.delete('/api/keys/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: userId } = getUser(req);
    const { id } = req.params as { id: string };
    const [key] = await app.db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).limit(1);
    if (!key) return reply.status(404).send({ data: null, error: 'Key not found' });

    await app.db.delete(apiKeys).where(eq(apiKeys.id, id));
    app.audit(req, 'api_key.deleted', { keyId: id });
    reply.send({ data: { message: 'Deleted' }, error: null });
  });
}
