import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env['STRIPE_SECRET_KEY'] ?? '';
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Stripe price IDs → plan tiers (set in .env)
export const PRICE_TO_PLAN: Record<string, 'starter' | 'pro' | 'whale'> = {
  [process.env['STRIPE_STARTER_PRICE_ID'] ?? 'price_starter']: 'starter',
  [process.env['STRIPE_PRO_PRICE_ID']     ?? 'price_pro']:     'pro',
  [process.env['STRIPE_WHALE_PRICE_ID']   ?? 'price_whale']:   'whale',
};
