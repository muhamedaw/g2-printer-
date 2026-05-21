import { FastifyRequest, FastifyReply } from 'fastify';
import { PLAN_LIMITS, type PlanTier } from '@mpg2/shared';

type Feature = keyof typeof PLAN_LIMITS[PlanTier];

export function requireFeature(feature: Feature) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { planTier: PlanTier } | undefined;
    if (!user) return reply.status(401).send({ data: null, error: 'Unauthorized' });
    const limits = PLAN_LIMITS[user.planTier];
    if (!limits[feature]) {
      reply.status(403).send({ data: null, error: `Feature '${feature}' requires a higher plan` });
    }
  };
}
