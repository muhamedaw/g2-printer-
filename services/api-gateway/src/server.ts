import 'dotenv/config';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import fp from 'fastify-plugin';

import redisPlugin        from './plugins/redis.js';
import dbPlugin           from './plugins/db.js';
import auditPlugin        from './plugins/audit.js';
import authRoutes         from './routes/auth.js';
import tradesRoutes       from './routes/trades.js';
import portfolioRoutes    from './routes/portfolio.js';
import signalsRoutes      from './routes/signals.js';
import settingsRoutes     from './routes/settings.js';
import subscriptionRoutes from './routes/subscription.js';
import realtimeRoutes     from './routes/realtime.js';
import apiKeyRoutes       from './routes/api-keys.js';
import healthRoutes       from './routes/health.js';
import whalesRoutes       from './routes/whales.js';
import socialRoutes       from './routes/social.js';
import { rateLimitUser }  from './middleware/rate-limit-user.js';

const PORT = parseInt(process.env['API_PORT'] ?? '3001');

async function build() {
  const app = Fastify({ logger: true, trustProxy: true });

  // Capture raw body on request for Stripe webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    try {
      (req as FastifyRequest & { rawBody: string }).rawBody = body as string;
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(cors, {
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: true,
  });

  // IP-level rate limit — broad protection
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production-min-32-chars',
  });

  await app.register(websocket);
  await app.register(redisPlugin);
  await app.register(dbPlugin);
  await app.register(auditPlugin);

  // JWT authenticate decorator
  app.decorate('authenticate', async function (req: Parameters<typeof rateLimitUser>[0], reply: Parameters<typeof rateLimitUser>[1]) {
    try { await req.jwtVerify(); }
    catch { reply.status(401).send({ data: null, error: 'Unauthorized' }); }
  });

  // Per-user rate limit — runs after JWT is verified
  app.addHook('preHandler', rateLimitUser);

  await app.register(fp(authRoutes));
  await app.register(fp(tradesRoutes));
  await app.register(fp(portfolioRoutes));
  await app.register(fp(signalsRoutes));
  await app.register(fp(settingsRoutes));
  await app.register(fp(subscriptionRoutes));
  await app.register(fp(apiKeyRoutes));
  await app.register(fp(healthRoutes));
  await app.register(fp(whalesRoutes));
  await app.register(fp(socialRoutes));
  await app.register(realtimeRoutes);

  return app;
}

async function main() {
  const app = await build();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API Gateway running on port ${PORT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
