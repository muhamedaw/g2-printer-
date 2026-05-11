export type PlanTier = 'free' | 'starter' | 'pro' | 'whale';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  planTier: PlanTier;
  isActive: boolean;
  publicSlug?: string | undefined;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planTier: PlanTier;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodEnd: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  name: string;
  requestsToday: number;
  requestLimit: number;
  lastUsedAt?: Date | undefined;
  createdAt: Date;
}

export interface PlanFeatures {
  maxPositions: number;
  liveTrading: boolean;
  apiAccess: boolean;
  signalDelay: number;
  copyTrading: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanFeatures> = {
  free:    { maxPositions: 3,   liveTrading: false, apiAccess: false, signalDelay: 600, copyTrading: false },
  starter: { maxPositions: 5,   liveTrading: true,  apiAccess: false, signalDelay: 0,   copyTrading: true  },
  pro:     { maxPositions: 10,  liveTrading: true,  apiAccess: true,  signalDelay: 0,   copyTrading: true  },
  whale:   { maxPositions: 999, liveTrading: true,  apiAccess: true,  signalDelay: 0,   copyTrading: true  },
};
