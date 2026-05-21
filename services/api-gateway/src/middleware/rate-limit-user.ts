import { FastifyRequest, FastifyReply } from 'fastify';
import type { PlanTier } from '@mpg2/shared';

// Requests per minute by plan
const PLAN_RPM: Record<PlanTier, number> = {
  free:    30,
  starter: 100,
  pro:     300,
  whale:   1000,
};

export async function rateLimitUser(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as { id?: string; planTier?: PlanTier } | undefined;
  if (!user?.id) return; // unauthenticated — handled by IP rate limit

  const plan  = user.planTier ?? 'free';
  const limit = PLAN_RPM[plan];
  const minute = Math.floor(Date.now() / 60_000);
  const key    = `rl:${user.id}:${minute}`;

  const redis = (req.server as { redis?: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<number> } }).redis;
  if (!redis) return;

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120); // 2-min TTL for cleanup

  reply.header('X-RateLimit-Limit',     String(limit));
  reply.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

  if (count > limit) {
    reply.status(429).send({
      data:  null,
      error: `Rate limit exceeded. ${plan} plan allows ${limit} req/min`,
    });
  }
}
