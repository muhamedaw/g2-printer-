import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { apiKeys, users } from '@mpg2/db';
import type { PlanTier } from '@mpg2/shared';
import type { Db } from '../plugins/db.js';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// Tries X-API-Key header, falls back to Bearer JWT
export async function apiKeyOrJwt(req: FastifyRequest, reply: FastifyReply) {
  const rawKey = req.headers['x-api-key'];

  if (!rawKey || typeof rawKey !== 'string') {
    // Fall back to standard JWT auth
    try {
      await req.jwtVerify();
    } catch {
      reply.status(401).send({ data: null, error: 'Unauthorized' });
    }
    return;
  }

  const db: Db = req.server.db;

  const hash = hashKey(rawKey);
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  if (!key) { reply.status(401).send({ data: null, error: 'Invalid API key' }); return; }

  // Check daily request quota
  if (key.requestsToday >= key.requestLimit) {
    reply.status(429).send({ data: null, error: 'API key daily limit reached' });
    return;
  }

  // Load user plan
  const [user] = await db.select({ id: users.id, email: users.email, planTier: users.planTier, isActive: users.isActive })
    .from(users).where(and(eq(users.id, key.userId))).limit(1);

  if (!user || !user.isActive) { reply.status(403).send({ data: null, error: 'Account disabled' }); return; }
  if (!['pro', 'whale'].includes(user.planTier)) {
    reply.status(403).send({ data: null, error: 'API key access requires Pro or Whale plan' });
    return;
  }

  // Increment usage counter atomically (fire-and-forget)
  void db.update(apiKeys)
    .set({ requestsToday: sql`${apiKeys.requestsToday} + 1`, lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => null);

  // Inject user into request (same shape as JWT payload)
  req.user = { id: user.id, email: user.email, planTier: user.planTier as PlanTier };
}
