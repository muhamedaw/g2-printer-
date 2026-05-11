import { pgTable, bigserial, varchar, text, numeric, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const safetyChecks = pgTable('safety_checks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contractAddress: varchar('contract_address', { length: 44 }).notNull().unique(),
  overallScore: numeric('overall_score', { precision: 5, scale: 2 }),
  mintAuthorityRevoked: boolean('mint_authority_revoked'),
  freezeAuthorityRevoked: boolean('freeze_authority_revoked'),
  topHolderPct: numeric('top_holder_pct', { precision: 6, scale: 4 }),
  top10HoldersPct: numeric('top10_holders_pct', { precision: 6, scale: 4 }),
  holderCount: integer('holder_count'),
  isHoneypot: boolean('is_honeypot').default(false),
  liquidityUsd: numeric('liquidity_usd', { precision: 18, scale: 2 }),
  tokenAgeMinutes: integer('token_age_minutes'),
  buySellRatio: numeric('buy_sell_ratio', { precision: 4, scale: 3 }),
  rugcheckScore: integer('rugcheck_score'),
  dnaMatchFound: boolean('dna_match_found').default(false),
  rejectionReason: text('rejection_reason'),
  passed: boolean('passed').default(false),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({
  expiresIdx: index('safety_checks_expires_idx').on(t.expiresAt),
}));

export const tokenBlacklist = pgTable('token_blacklist', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  address: varchar('address', { length: 44 }).notNull().unique(),
  reason: text('reason'),
  addedBy: varchar('added_by', { length: 50 }).default('system'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tokenDna = pgTable('token_dna', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  creatorWallet: varchar('creator_wallet', { length: 44 }).notNull(),
  ruggedToken: varchar('rugged_token', { length: 44 }).notNull(),
  patterns: text('patterns').array(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).default('1.0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  creatorIdx: index('token_dna_creator_idx').on(t.creatorWallet),
}));
