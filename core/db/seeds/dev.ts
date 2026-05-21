#!/usr/bin/env tsx
/**
 * Development seed — creates test accounts and sample data.
 * Run: pnpm db:seed
 *
 * Test accounts (password: "password123" for all):
 *   free@mpg2.dev    — free plan
 *   starter@mpg2.dev — starter plan
 *   pro@mpg2.dev     — pro plan
 *   whale@mpg2.dev   — whale plan
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { createId } from '@paralleldrive/cuid2';
import * as schema from '../src/schema/index.js';

const pool = new Pool({
  host:     process.env['POSTGRES_HOST']     ?? 'localhost',
  port:     parseInt(process.env['POSTGRES_PORT'] ?? '5432'),
  database: process.env['POSTGRES_DB']       ?? 'mpg2',
  user:     process.env['POSTGRES_USER']     ?? 'mpg2_user',
  password: process.env['POSTGRES_PASSWORD'] ?? 'changeme',
});

const db = drizzle(pool, { schema });

const PASSWORD_HASH = await bcrypt.hash('password123', 10);

// ─── Users ────────────────────────────────────────────────────────────────────

const testUsers: Array<typeof schema.users.$inferInsert> = [
  { id: createId(), email: 'free@mpg2.dev',    passwordHash: PASSWORD_HASH, planTier: 'free' },
  { id: createId(), email: 'starter@mpg2.dev', passwordHash: PASSWORD_HASH, planTier: 'starter' },
  { id: createId(), email: 'pro@mpg2.dev',     passwordHash: PASSWORD_HASH, planTier: 'pro' },
  { id: createId(), email: 'whale@mpg2.dev',   passwordHash: PASSWORD_HASH, planTier: 'whale' },
];

console.log('Seeding users…');
await db.insert(schema.users).values(testUsers).onConflictDoNothing();

// ─── User settings ────────────────────────────────────────────────────────────

const settings: Array<typeof schema.userSettings.$inferInsert> = testUsers.map(u => ({
  userId:         u.id!,
  capitalUsd:     u.planTier === 'whale' ? 10_000 : u.planTier === 'pro' ? 5_000 : u.planTier === 'starter' ? 2_000 : 500 as number,
  maxPositionPct: 5,
  minScoreToBuy:  80,
  stopLossPct:    30,
  paperTrading:   true,
}));

console.log('Seeding user settings…');
await db.insert(schema.userSettings).values(settings).onConflictDoNothing();

// ─── Fake trades ──────────────────────────────────────────────────────────────

const proUser = testUsers.find(u => u.planTier === 'pro')!;

const fakeTrades: Array<typeof schema.trades.$inferInsert> = [
  {
    userId: proUser.id!, contractAddress: 'So11111111111111111111111111111111111111112',
    tokenSymbol: 'SOL', tradeType: 'BUY', isPaperTrade: true,
    entryPrice: '150.00', quantityTokens: '6.67', usdAmount: '1000',
    finalScore: '87.5', createdAt: new Date(Date.now() - 86_400_000 * 5),
  },
  {
    userId: proUser.id!, contractAddress: 'So11111111111111111111111111111111111111112',
    tokenSymbol: 'SOL', tradeType: 'SELL_TP1', isPaperTrade: true,
    entryPrice: '150.00', exitPrice: '300.00', quantityTokens: '2.22',
    usdAmount: '666', pnlUsd: '333', pnlPct: '1.0',
    finalScore: '87.5', sellReason: 'TP1',
    createdAt: new Date(Date.now() - 86_400_000 * 3),
  },
  {
    userId: proUser.id!, contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenSymbol: 'USDC', tradeType: 'BUY', isPaperTrade: true,
    entryPrice: '1.00', quantityTokens: '500', usdAmount: '500',
    finalScore: '82.0', createdAt: new Date(Date.now() - 86_400_000 * 2),
  },
  {
    userId: proUser.id!, contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenSymbol: 'USDC', tradeType: 'SELL_STOP_LOSS', isPaperTrade: true,
    entryPrice: '1.00', exitPrice: '0.70', quantityTokens: '500',
    usdAmount: '350', pnlUsd: '-150', pnlPct: '-0.3',
    finalScore: '82.0', sellReason: 'SL',
    createdAt: new Date(Date.now() - 86_400_000 * 1),
  },
  {
    userId: proUser.id!, contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    tokenSymbol: 'BONK', tradeType: 'BUY', isPaperTrade: true,
    entryPrice: '0.00002', quantityTokens: '50000000', usdAmount: '1000',
    finalScore: '91.3', createdAt: new Date(Date.now() - 3_600_000 * 6),
  },
];

console.log('Seeding trades…');
await db.insert(schema.trades).values(fakeTrades).onConflictDoNothing();

// ─── Open position ────────────────────────────────────────────────────────────

const fakePositions: Array<typeof schema.positions.$inferInsert> = [
  {
    userId: proUser.id!,
    contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    tokenSymbol: 'BONK',
    entryPrice: '0.00002',
    currentPrice: '0.000035',
    highestPriceSeen: '0.000038',
    quantityRemaining: '50000000',
    usdInvested: '1000',
    currentUsdValue: '1750',
    unrealizedPnlPct: '0.75',
    tp1Executed: false,
    tp2Executed: false,
    tp3Executed: false,
    trailingStopActive: false,
    finalScore: '91.3',
    isPaperTrade: true,
  },
];

console.log('Seeding positions…');
await db.insert(schema.positions).values(fakePositions).onConflictDoNothing();

// ─── Sample raw signals ───────────────────────────────────────────────────────

const fakeSignals: Array<typeof schema.rawSignals.$inferInsert> = [
  {
    platform: 'twitter', content: '$BONK is going crazy! Multiple whales accumulating. Watch DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    authorUsername: 'cryptowhale', authorFollowers: 45_000,
    engagementScore: '72.5', platformWeight: '1.5', influencerWeight: '1.8',
    processed: true, createdAt: new Date(Date.now() - 3_600_000 * 7),
  },
  {
    platform: 'reddit', content: 'BONK showing strong on-chain metrics. Insider wallet accumulation detected on Solana.',
    contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    authorUsername: 'sol_degen', authorFollowers: 1_200,
    engagementScore: '38.0', platformWeight: '1.2', influencerWeight: '1.0',
    processed: true, createdAt: new Date(Date.now() - 3_600_000 * 6),
  },
  {
    platform: 'telegram', content: 'New pair on Raydium — early entry window. Contract: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    authorUsername: 'alpha_calls', authorFollowers: 8_000,
    engagementScore: '55.0', platformWeight: '1.0', influencerWeight: '1.4',
    processed: true, createdAt: new Date(Date.now() - 3_600_000 * 5),
  },
  {
    platform: 'news', content: 'Solana memecoin BONK surges 150% as institutional interest grows in Q2 2026.',
    authorUsername: 'cryptopanic', authorFollowers: 0,
    engagementScore: '15.0', platformWeight: '0.8', influencerWeight: '1.0',
    processed: false, createdAt: new Date(Date.now() - 1_800_000),
  },
];

console.log('Seeding raw signals…');
await db.insert(schema.rawSignals).values(fakeSignals).onConflictDoNothing();

await pool.end();
console.log('\n✅ Dev seed complete!\n');
console.log('Test accounts (password: password123):');
testUsers.forEach(u => console.log(`  ${(u.planTier ?? 'free').padEnd(8)} → ${u.email}`));
console.log('');
