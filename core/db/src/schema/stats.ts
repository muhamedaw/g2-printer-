import { pgTable, bigserial, date, integer, numeric, boolean, timestamp, text, jsonb, index } from 'drizzle-orm/pg-core';

export const dailyStats = pgTable('daily_stats', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  date: date('date').notNull().unique(),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  losingTrades: integer('losing_trades').default(0),
  winRate: numeric('win_rate', { precision: 4, scale: 3 }).default('0'),
  totalPnlUsd: numeric('total_pnl_usd', { precision: 18, scale: 2 }).default('0'),
  capitalEod: numeric('capital_eod', { precision: 18, scale: 2 }),
  marketRegime: text('market_regime'),
  dailyLimitHit: boolean('daily_limit_hit').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const learningLog = pgTable('learning_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  parameter: text('parameter').notNull(),
  oldValue: text('old_value').notNull(),
  newValue: text('new_value').notNull(),
  reason: text('reason').notNull(),
  performanceData: jsonb('performance_data'),
  weekDate: date('week_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  weekIdx: index('learning_log_week_idx').on(t.weekDate),
}));
