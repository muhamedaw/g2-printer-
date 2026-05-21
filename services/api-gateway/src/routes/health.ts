import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

interface ServiceStatus {
  name:    string;
  ok:      boolean;
  latency: number;
  detail?: string;
}

interface HealthResponse {
  status:   'ok' | 'degraded' | 'down';
  services: ServiceStatus[];
  ts:       string;
}

async function checkRedis(redis: FastifyInstance['redis']): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await redis.ping();
    return { name: 'redis', ok: true, latency: Date.now() - start };
  } catch (err) {
    return { name: 'redis', ok: false, latency: Date.now() - start, detail: String(err) };
  }
}

async function checkDb(db: FastifyInstance['db']): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { name: 'db', ok: true, latency: Date.now() - start };
  } catch (err) {
    return { name: 'db', ok: false, latency: Date.now() - start, detail: String(err) };
  }
}

async function checkWorkerHeartbeat(redis: FastifyInstance['redis'], name: string): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const raw = await redis.get(`heartbeat:${name}`);
    if (!raw) return { name, ok: false, latency: Date.now() - start, detail: 'no heartbeat' };
    const lastBeat = Number(raw);
    const age      = Date.now() - lastBeat;
    // stale if older than 3 minutes
    const ok = age < 180_000;
    return { name, ok, latency: Date.now() - start, ...(!ok ? { detail: `stale ${Math.round(age / 1000)}s` } : {}) };
  } catch (err) {
    return { name, ok: false, latency: Date.now() - start, detail: String(err) };
  }
}

export default async function healthRoutes(app: FastifyInstance) {
  // Public — no auth needed
  app.get('/health', async (_req, reply) => {
    const [redis, db] = await Promise.all([
      checkRedis(app.redis),
      checkDb(app.db),
    ]);

    const services: ServiceStatus[] = [redis, db];

    const status: HealthResponse['status'] = services.every(s => s.ok)
      ? 'ok'
      : services.some(s => s.ok)
      ? 'degraded'
      : 'down';

    const code = status === 'down' ? 503 : status === 'degraded' ? 207 : 200;
    reply.status(code).send({ status, services, ts: new Date().toISOString() } satisfies HealthResponse);
  });

  // Detailed — includes worker heartbeats (internal use or admin)
  app.get('/health/detailed', async (_req, reply) => {
    const workers = ['market-data', 'social-data', 'ai-brain', 'security-engine', 'risk-engine', 'trade-engine', 'notification-engine'];

    const [redis, db, ...heartbeats] = await Promise.all([
      checkRedis(app.redis),
      checkDb(app.db),
      ...workers.map(w => checkWorkerHeartbeat(app.redis, w)),
    ]);

    const services: ServiceStatus[] = [redis, db, ...heartbeats];

    const criticalDown = !redis.ok || !db.ok;
    const status: HealthResponse['status'] = criticalDown
      ? 'down'
      : services.every(s => s.ok)
      ? 'ok'
      : 'degraded';

    const code = status === 'down' ? 503 : status === 'degraded' ? 207 : 200;
    reply.status(code).send({ status, services, ts: new Date().toISOString() } satisfies HealthResponse);
  });
}
