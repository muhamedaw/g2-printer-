import { pgTable, text, numeric, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const sandboxSessions = pgTable('sandbox_sessions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('RUNNING'),
  startingCapital: numeric('starting_capital', { precision: 18, scale: 6 }).notNull(),
  currentCapital: numeric('current_capital', { precision: 18, scale: 6 }).notNull(),
  peakCapital: numeric('peak_capital', { precision: 18, scale: 6 }).notNull(),
  totalPnlUsd: numeric('total_pnl_usd', { precision: 18, scale: 6 }).default('0'),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  config: jsonb('config').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('sandbox_sessions_user_idx').on(t.userId),
  statusIdx: index('sandbox_sessions_status_idx').on(t.status),
}));

export const sandboxTrades = pgTable('sandbox_trades', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull(),
  userId: text('user_id').notNull(),
  tokenMint: text('token_mint').notNull(),
  tokenSymbol: text('token_symbol').notNull(),
  tokenName: text('token_name').notNull(),
  action: text('action').notNull(),
  fakeUsdAmount: numeric('fake_usd_amount', { precision: 18, scale: 6 }).notNull(),
  price: numeric('price', { precision: 18, scale: 10 }).notNull(),
  score: integer('score').notNull(),
  exitReason: text('exit_reason'),
  pnlUsd: numeric('pnl_usd', { precision: 18, scale: 6 }),
  pnlPercent: numeric('pnl_percent', { precision: 10, scale: 4 }),
  holdTimeMs: integer('hold_time_ms'),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  sessionIdx: index('sandbox_trades_session_idx').on(t.sessionId),
  userIdx: index('sandbox_trades_user_idx').on(t.userId),
}));

export const sandboxPositions = pgTable('sandbox_positions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull(),
  userId: text('user_id').notNull(),
  tokenMint: text('token_mint').notNull(),
  tokenSymbol: text('token_symbol').notNull(),
  tokenName: text('token_name').notNull(),
  entryPrice: numeric('entry_price', { precision: 18, scale: 10 }).notNull(),
  fakeUsdSpent: numeric('fake_usd_spent', { precision: 18, scale: 6 }).notNull(),
  fakeTokensHeld: numeric('fake_tokens_held', { precision: 28, scale: 10 }).notNull(),
  score: integer('score').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  isClosed: boolean('is_closed').default(false).notNull(),
}, (t) => ({
  sessionIdx: index('sandbox_positions_session_idx').on(t.sessionId),
  openIdx: index('sandbox_positions_open_idx').on(t.sessionId, t.isClosed),
}));
