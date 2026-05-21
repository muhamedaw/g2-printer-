import { FastifyRequest, FastifyReply } from 'fastify';
import type { PlanTier, PlanFeatures } from '@mpg2/shared';
import { PLAN_LIMITS } from '@mpg2/shared';

export interface UserContext {
  id:        string;
  email:     string;
  planTier:  PlanTier;
}

export function getUser(req: FastifyRequest): UserContext {
  const u = req.user as UserContext | undefined;
  if (!u?.id) throw new Error('No authenticated user on request');
  return u;
}

export function requirePlan(minPlan: PlanTier) {
  const order: PlanTier[] = ['free', 'starter', 'pro', 'whale'];
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as UserContext | undefined;
    if (!user) { reply.status(401).send({ data: null, error: 'Unauthorized' }); return; }
    if (order.indexOf(user.planTier) < order.indexOf(minPlan)) {
      reply.status(403).send({ data: null, error: `Requires ${minPlan} plan or higher` });
    }
  };
}

export function requireFeatureFlag(feature: keyof PlanFeatures) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as UserContext | undefined;
    if (!user) { reply.status(401).send({ data: null, error: 'Unauthorized' }); return; }
    const limits: PlanFeatures = PLAN_LIMITS[user.planTier];
    const value = limits[feature];
    if (!value) {
      reply.status(403).send({
        data:  null,
        error: `Feature "${String(feature)}" not available on ${user.planTier} plan`,
      });
    }
  };
}
