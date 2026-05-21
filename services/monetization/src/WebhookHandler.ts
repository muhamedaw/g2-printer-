import Stripe from 'stripe';
import { createLogger } from '@mpg2/shared';
import type { PlanTier } from '@mpg2/shared';
import type { PlanEnforcer } from './PlanEnforcer.js';
import { PRICE_TO_PLAN } from './StripeClient.js';

const log = createLogger('webhook-handler');

// userId is stored in Stripe customer metadata when checkout is created
async function getUserId(stripe: Stripe, customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer as Stripe.Customer).metadata['userId'] ?? null;
  } catch {
    return null;
  }
}

function priceIdToPlan(priceId: string): PlanTier {
  return PRICE_TO_PLAN[priceId] ?? 'free';
}

export async function handleStripeEvent(
  stripe: Stripe,
  enforcer: PlanEnforcer,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.customer) break;

      const userId = await getUserId(stripe, String(session.customer));
      if (!userId) { log.warn({ sessionId: session.id }, 'No userId in customer metadata'); break; }

      const subId = String(session.subscription);
      const sub   = await stripe.subscriptions.retrieve(subId);
      const priceId = sub.items.data[0]?.price.id ?? '';
      const plan    = priceIdToPlan(priceId);

      await enforcer.setUserPlan(userId, plan);
      log.info({ userId, plan, subId }, 'Checkout completed — plan activated');
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      if (!sub.customer) break;

      const userId = await getUserId(stripe, String(sub.customer));
      if (!userId) break;

      const priceId = sub.items.data[0]?.price.id ?? '';
      const plan: PlanTier = sub.status === 'active' || sub.status === 'trialing'
        ? priceIdToPlan(priceId)
        : 'free';

      await enforcer.setUserPlan(userId, plan);
      log.info({ userId, plan, status: sub.status }, 'Subscription updated');
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      if (!sub.customer) break;

      const userId = await getUserId(stripe, String(sub.customer));
      if (!userId) break;

      await enforcer.setUserPlan(userId, 'free');
      log.info({ userId }, 'Subscription cancelled — downgraded to free');
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.customer) break;

      const userId = await getUserId(stripe, String(invoice.customer));
      if (!userId) break;

      // Don't downgrade immediately on first failure — Stripe retries
      log.warn({ userId, invoiceId: invoice.id }, 'Payment failed');
      break;
    }

    default:
      log.debug({ type: event.type }, 'Unhandled Stripe event');
  }
}
