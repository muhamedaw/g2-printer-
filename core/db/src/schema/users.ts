import { pgTable, text, boolean, timestamp, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const planTierEnum = pgEnum('plan_tier', ['free', 'starter', 'pro', 'whale']);

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  planTier: planTierEnum('plan_tier').notNull().default('free'),
  publicSlug: text('public_slug').unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  planTier: planTierEnum('plan_tier').notNull(),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('subscriptions_user_idx').on(t.userId),
}));

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  name: text('name').notNull(),
  requestsToday: integer('requests_today').notNull().default(0),
  requestLimit: integer('request_limit').notNull().default(1000),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('api_keys_user_idx').on(t.userId),
}));

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  capitalUsd: integer('capital_usd').notNull().default(1000),
  maxPositionPct: integer('max_position_pct').notNull().default(5),
  minScoreToBuy: integer('min_score_to_buy').notNull().default(80),
  stopLossPct: integer('stop_loss_pct').notNull().default(30),
  paperTrading: boolean('paper_trading').notNull().default(true),
  telegramChatId: text('telegram_chat_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
