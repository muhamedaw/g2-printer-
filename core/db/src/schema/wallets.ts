import { pgTable, bigserial, varchar, numeric, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const smartWallets = pgTable('smart_wallets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull().unique(),
  nickname: varchar('nickname', { length: 100 }),
  pattern: varchar('pattern', { length: 30 }).notNull().default('unknown'),
  winRate: numeric('win_rate', { precision: 4, scale: 3 }).default('0.5'),
  avgProfitX: numeric('avg_profit_x', { precision: 6, scale: 2 }).default('1.0'),
  avgLossPct: numeric('avg_loss_pct', { precision: 4, scale: 3 }).default('0.3'),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  isActive: boolean('is_active').default(true),
  lastTradeAt: timestamp('last_trade_at', { withTimezone: true }),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  activeIdx: index('smart_wallets_active_idx').on(t.isActive),
  winRateIdx: index('smart_wallets_win_rate_idx').on(t.winRate),
}));
