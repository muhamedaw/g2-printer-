import { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { positions, trades, userSettings } from '@mpg2/db';
import { requireAuth } from '../middleware/auth.js';

export default async function portfolioRoutes(app: FastifyInstance) {
  app.get('/api/portfolio/positions', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };
    const rows = await app.db.select().from(positions)
      .where(eq(positions.userId, user.id))
      .orderBy(sql`${positions.openedAt} desc`);

    // Enrich with live prices from Redis
    const enriched = await Promise.all(rows.map(async pos => {
      const priceRaw = await app.redis.get(`token:${pos.contractAddress}:price`).catch(() => null);
      const currentPrice  = priceRaw ? parseFloat(priceRaw) : null;
      const entryPrice    = parseFloat(pos.entryPrice);
      const usdInvested   = parseFloat(pos.usdInvested);
      const currentUsdValue = currentPrice && entryPrice > 0
        ? usdInvested * (currentPrice / entryPrice)
        : usdInvested;
      const unrealizedPnlPct = entryPrice > 0 && currentPrice
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : 0;
      return {
        ...pos,
        currentPrice,
        currentUsdValue,
        unrealizedPnlPct,
        unrealizedPnlUsd: currentUsdValue - usdInvested,
      };
    }));

    reply.send({ data: enriched, error: null });
  });

  app.get('/api/portfolio/summary', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };

    const [settings, openPositions, sellTrades] = await Promise.all([
      app.db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1),
      app.db.select().from(positions).where(eq(positions.userId, user.id)),
      app.db.select().from(trades).where(
        and(eq(trades.userId, user.id), sql`${trades.tradeType} LIKE 'SELL_%'`),
      ),
    ]);

    const totalInvested = openPositions.reduce((s, p) => s + parseFloat(p.usdInvested), 0);

    // Use Redis current prices for real-time unrealized PnL
    let totalCurrentValue = 0;
    for (const pos of openPositions) {
      const priceRaw = await app.redis.get(`token:${pos.contractAddress}:price`).catch(() => null);
      if (priceRaw) {
        const currentPrice = parseFloat(priceRaw);
        const entryPrice   = parseFloat(pos.entryPrice);
        const currentValue = entryPrice > 0
          ? parseFloat(pos.usdInvested) * (currentPrice / entryPrice)
          : parseFloat(pos.usdInvested);
        totalCurrentValue += currentValue;
      } else {
        totalCurrentValue += parseFloat(pos.usdInvested); // fallback: no change
      }
    }
    const unrealizedPnl = totalCurrentValue - totalInvested;

    const realizedPnl  = sellTrades.reduce((s, t) => s + parseFloat(t.pnlUsd ?? '0'), 0);
    const wins         = sellTrades.filter(t => parseFloat(t.pnlUsd ?? '0') > 0);
    const winRate      = sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0;

    reply.send({
      data: {
        openPositions:  openPositions.length,
        totalInvested,
        unrealizedPnl,
        realizedPnl,
        winRate,
        totalTrades:    sellTrades.length,
        capitalUsd:     settings[0]?.capitalUsd ?? 1000,
        paperTrading:   settings[0]?.paperTrading ?? true,
      },
      error: null,
    });
  });

  app.post('/api/portfolio/positions/:id/close', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };
    const { id } = req.params as { id: string };

    const [pos] = await app.db.select().from(positions)
      .where(and(eq(positions.id, parseInt(id)), eq(positions.userId, user.id))).limit(1);
    if (!pos) return reply.status(404).send({ data: null, error: 'Position not found' });

    // Trade engine expects { userId, contractAddress }
    await app.redis.publish('trade:manual_close', JSON.stringify({
      userId:          user.id,
      contractAddress: pos.contractAddress,
    }));

    reply.send({ data: { message: 'Close signal sent' }, error: null });
  });
}
