import { FastifyInstance, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { eq, desc } from 'drizzle-orm';
import { users, subscriptions } from '@mpg2/db';
import { PLAN_LIMITS, type PlanTier } from '@mpg2/shared';
import { requireAuth } from '../middleware/auth.js';

function getStripe(): Stripe | null {
  const key = process.env['STRIPE_SECRET_KEY'];
  return key ? new Stripe(key) : null;
}

const PRICE_MAP: Record<string, string> = {
  starter: process.env['STRIPE_STARTER_PRICE_ID'] ?? '',
  pro:     process.env['STRIPE_PRO_PRICE_ID'] ?? '',
  whale:   process.env['STRIPE_WHALE_PRICE_ID'] ?? '',
};

export default async function subscriptionRoutes(app: FastifyInstance) {
  app.get('/api/subscription', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string; planTier: PlanTier };
    const limits = PLAN_LIMITS[user.planTier];
    const [sub] = await app.db.select().from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    reply.send({ data: { planTier: user.planTier, limits, subscription: sub ?? null }, error: null });
  });

  app.post('/api/subscription/checkout', { preHandler: [requireAuth] }, async (req, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.status(503).send({ data: null, error: 'Stripe not configured' });

    const user = req.user as { id: string; email: string };
    const { plan } = req.body as { plan: string };
    const priceId = PRICE_MAP[plan];
    if (!priceId) return reply.status(400).send({ data: null, error: 'Invalid plan' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      metadata: { userId: user.id, plan },
      success_url: `${process.env['FRONTEND_URL']}/?upgraded=true`,
      cancel_url: `${process.env['FRONTEND_URL']}/subscription`,
    });

    reply.send({ data: { url: session.url }, error: null });
  });

  app.post('/api/subscription/webhook', async (req, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.status(503).send({ data: null, error: 'Stripe not configured' });

    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
    let event: Stripe.Event;
    const body = (req as FastifyRequest & { rawBody?: string }).rawBody;
    if (!body) return reply.status(400).send({ data: null, error: 'Missing raw body' });
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch {
      return reply.status(400).send({ data: null, error: 'Invalid webhook signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId   = session.metadata?.['userId'];
      const planTier = session.metadata?.['plan'] as PlanTier | undefined;
      if (userId && planTier) {
        await app.db.update(users).set({ planTier }).where(eq(users.id, userId));
      }
    }

    reply.send({ data: { received: true }, error: null });
  });
}
