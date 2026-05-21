import { eq, and } from 'drizzle-orm';
import { positions } from './schema/trades.js';
import { userSettings } from './schema/users.js';
import { getDb } from './connection.js';
import type { Position } from '@mpg2/shared';

export async function upsertPositionInDb(position: Position): Promise<void> {
  const db = getDb();
  const currentPrice = position.currentPrice ?? position.entryPrice;
  const unrealizedPnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const currentUsdValue = position.usdInvested * (currentPrice / position.entryPrice);

  // Delete existing row first (handles restart without unique constraint migration)
  await db.delete(positions).where(and(
    eq(positions.userId, position.userId),
    eq(positions.contractAddress, position.contractAddress),
  ));

  await db.insert(positions).values({
    userId:             position.userId,
    contractAddress:    position.contractAddress,
    tokenSymbol:        position.tokenSymbol ?? null,
    entryPrice:         position.entryPrice.toString(),
    currentPrice:       currentPrice.toString(),
    highestPriceSeen:   position.highestPriceSeen.toString(),
    quantityRemaining:  position.quantityRemaining.toString(),
    usdInvested:        position.usdInvested.toString(),
    currentUsdValue:    currentUsdValue.toString(),
    unrealizedPnlPct:   unrealizedPnlPct.toString(),
    tp1Executed:        position.tp1Executed,
    tp2Executed:        position.tp2Executed,
    tp3Executed:        position.tp3Executed,
    trailingStopActive: position.trailingStopActive,
    source:             position.source ?? null,
    finalScore:         position.finalScore.toString(),
    isPaperTrade:       position.isPaperTrade,
  });
}

export async function getUserCapitalUsd(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ capitalUsd: userSettings.capitalUsd })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return rows[0]?.capitalUsd ?? 1000;
}

export async function deletePositionFromDb(userId: string, contractAddress: string): Promise<void> {
  const db = getDb();
  await db.delete(positions).where(and(
    eq(positions.userId, userId),
    eq(positions.contractAddress, contractAddress),
  ));
}
