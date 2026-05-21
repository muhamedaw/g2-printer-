import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance { redis: Redis }
}

export default fp(async (app: FastifyInstance) => {
  const redis = new Redis({
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6380'),
    password: process.env['REDIS_PASSWORD'],
    lazyConnect: true,
  });
  await redis.connect();
  app.decorate('redis', redis);
  app.addHook('onClose', async () => redis.quit());
});
