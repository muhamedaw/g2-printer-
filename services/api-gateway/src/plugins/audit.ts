import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface AuditEvent {
  userId:    string;
  action:    string;
  meta?:     Record<string, unknown>;
  ip:        string;
  createdAt: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    audit(req: FastifyRequest, action: string, meta?: Record<string, unknown>): void;
  }
}

export default fp(async function auditPlugin(app: FastifyInstance) {
  app.decorate('audit', function (
    req: FastifyRequest,
    action: string,
    meta?: Record<string, unknown>,
  ) {
    const user = req.user as { id?: string } | undefined;
    const event: AuditEvent = {
      userId:    user?.id ?? 'anonymous',
      action,
      ip:        req.ip,
      createdAt: new Date().toISOString(),
      ...(meta ? { meta } : {}),
    };

    // Publish to Redis for async storage / alerting
    void app.redis.lpush('audit:log', JSON.stringify(event))
      .then(() => app.redis.ltrim('audit:log', 0, 9999))
      .catch(() => null);

    app.log.info(event, 'AUDIT');
  });
});
