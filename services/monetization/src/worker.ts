import 'dotenv/config';
import http from 'node:http';
import Redis from 'ioredis';
import Stripe from 'stripe';
import { createLogger } from '@mpg2/shared';
import { getStripe }        from './StripeClient.js';
import { PlanEnforcer }     from './PlanEnforcer.js';
import { handleStripeEvent } from './WebhookHandler.js';

const log = createLogger('monetization-worker');

const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const enforcer       = new PlanEnforcer(redis);
const webhookSecret  = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
const port           = Number(process.env['MONETIZATION_PORT'] ?? 3002);

// ─── Redis subscriber — plan-check requests from other services ───────────────

const redisSub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

redisSub.subscribe('plan:check_request', err => {
  if (err) log.error({ err }, 'Subscribe failed');
});

redisSub.on('message', (_channel, message) => {
  const { userId, replyChannel } = JSON.parse(message) as { userId: string; replyChannel: string };
  void enforcer.canOpenPosition(userId).then(result =>
    redis.publish(replyChannel, JSON.stringify(result)),
  ).catch(err => log.warn({ err, userId }, 'plan check failed'));
});

// ─── Webhook HTTP server ───────────────────────────────────────────────────────

function startWebhookServer(): void {
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    log.warn('Stripe not configured — webhook server disabled');
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const sig  = req.headers['stripe-signature'] ?? '';

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch (err) {
        log.warn({ err }, 'Webhook signature verification failed');
        res.writeHead(400).end('Bad signature');
        return;
      }

      void handleStripeEvent(stripe, enforcer, event)
        .then(() => res.writeHead(200).end('ok'))
        .catch(err => {
          log.error({ err, type: event.type }, 'Webhook handler error');
          res.writeHead(500).end('error');
        });
    });
  });

  server.listen(port, () => log.info({ port }, 'Webhook server listening'));
}

// ─── Cleanup job — expire old free-tier plans ─────────────────────────────────

async function syncFreeUsers(): Promise<void> {
  // Any user without a plan key defaults to free — nothing to sync
  // This runs hourly to catch edge cases (e.g. subscription not found in Redis)
  const members = await redis.smembers('users:live_trading');
  for (const uid of members) {
    const plan = await enforcer.getUserPlan(uid);
    if (plan !== 'free') continue;
    // Free plan can't live trade — remove from live_trading set
    await redis.srem('users:live_trading', uid);
    log.debug({ uid }, 'Free user removed from live_trading set');
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Monetization worker starting…');

  startWebhookServer();

  // Sync free users every hour
  setInterval(() => { void syncFreeUsers().catch(err => log.warn({ err }, 'syncFreeUsers failed')); }, 3_600_000);
  await syncFreeUsers();

  const hb = setInterval(() => {
    void redis.set('heartbeat:monetization', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redis.set('heartbeat:monetization', String(Date.now()), 'EX', 300).catch(() => null);

  log.info('Monetization worker ready');

  process.on('SIGTERM', () => {
    clearInterval(hb);
    redisSub.disconnect();
    redis.disconnect();
    log.info('Graceful shutdown complete');
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});
