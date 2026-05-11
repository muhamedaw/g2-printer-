import { pgTable, bigserial, varchar, text, numeric, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const rawSignals = pgTable('raw_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  platform: varchar('platform', { length: 20 }).notNull(),
  content: text('content'),
  contractAddress: varchar('contract_address', { length: 44 }),
  authorUsername: varchar('author_username', { length: 100 }),
  authorFollowers: integer('author_followers').default(0),
  engagementScore: numeric('engagement_score', { precision: 8, scale: 2 }).default('0'),
  platformWeight: numeric('platform_weight', { precision: 4, scale: 2 }).default('1.0'),
  influencerWeight: numeric('influencer_weight', { precision: 4, scale: 2 }).default('1.0'),
  rawData: jsonb('raw_data'),
  processed: boolean('processed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  contractIdx: index('raw_signals_contract_idx').on(t.contractAddress),
  processedIdx: index('raw_signals_processed_idx').on(t.processed),
  createdIdx: index('raw_signals_created_idx').on(t.createdAt),
}));

export const aiSignals = pgTable('ai_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contractAddress: varchar('contract_address', { length: 44 }).notNull(),
  tokenSymbol: varchar('token_symbol', { length: 20 }),
  sentimentScore: numeric('sentiment_score', { precision: 5, scale: 2 }),
  authenticityScore: numeric('authenticity_score', { precision: 4, scale: 3 }),
  trendScore: numeric('trend_score', { precision: 5, scale: 2 }),
  narrativeFreshness: numeric('narrative_freshness', { precision: 4, scale: 3 }),
  finalAiScore: numeric('final_ai_score', { precision: 5, scale: 2 }),
  platformsDetected: text('platforms_detected').array(),
  platformCount: integer('platform_count').default(1),
  influencerCount: integer('influencer_count').default(0),
  reasoning: text('reasoning'),
  passedToSafety: boolean('passed_to_safety').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  contractIdx: index('ai_signals_contract_idx').on(t.contractAddress),
  scoreIdx: index('ai_signals_score_idx').on(t.finalAiScore),
}));
