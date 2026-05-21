import { FastifyRequest, FastifyReply } from 'fastify';
import type { PlanTier } from '@mpg2/shared';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    audit(req: FastifyRequest, action: string, meta?: Record<string, unknown>): void;
  }
}

// Extend JWT payload shape so req.user is typed throughout
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; planTier: PlanTier };
    user:    { id: string; email: string; planTier: PlanTier };
  }
}
