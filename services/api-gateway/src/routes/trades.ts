import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { trades } from '@mpg2/db';
import { requireAuth } from '../middleware/auth.js';

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.enum(['paper', 'live', 'all']).default('all'),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export default async function tradesRoutes(app: FastifyInstance) {
  app.get('/api/trades', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ data: null, error: 'Invalid query' });

    const { from, to, type, limit } = q.data;
    const conditions = [eq(trades.userId, user.id)];
    if (type === 'paper') conditions.push(eq(trades.isPaperTrade, true));
    if (type === 'live') conditions.push(eq(trades.isPaperTrade, false));
    if (from) conditions.push(gte(trades.createdAt, new Date(from)));
    if (to) conditions.push(lte(trades.createdAt, new Date(to)));

    const rows = await app.db.select().from(trades)
      .where(and(...conditions))
      .orderBy(sql`${trades.createdAt} desc`)
      .limit(limit);

    reply.send({ data: rows, error: null });
  });

  app.get('/api/trades/stats', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };

    const sells = await app.db.select().from(trades)
      .where(and(
        eq(trades.userId, user.id),
        sql`${trades.tradeType} LIKE 'SELL_%'`,
      ));

    const totalPnl = sells.reduce((s, t) => s + parseFloat(t.pnlUsd ?? '0'), 0);
    const wins = sells.filter(t => parseFloat(t.pnlUsd ?? '0') > 0);

    reply.send({
      data: {
        totalTrades: sells.length,
        winningTrades: wins.length,
        winRate: sells.length > 0 ? wins.length / sells.length : 0,
        totalPnlUsd: totalPnl,
        avgPnlUsd: sells.length > 0 ? totalPnl / sells.length : 0,
      },
      error: null,
    });
  });

  // Equity curve — cumulative PnL by day (for AreaChart in analytics dashboard)
  app.get('/api/trades/equity-curve', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };

    const rows = await app.db.select().from(trades)
      .where(and(
        eq(trades.userId, user.id),
        sql`${trades.tradeType} LIKE 'SELL_%'`,
      ))
      .orderBy(sql`${trades.createdAt} asc`);

    const daily: Record<string, number> = {};
    for (const t of rows) {
      const day = t.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      daily[day] = (daily[day] ?? 0) + parseFloat(t.pnlUsd ?? '0');
    }

    let cumulative = 0;
    const result = Object.entries(daily).map(([date, pnl]) => {
      cumulative += pnl;
      return { date, dailyPnl: parseFloat(pnl.toFixed(2)), cumulativePnl: parseFloat(cumulative.toFixed(2)) };
    });

    reply.send({ data: result, error: null });
  });

  // Best & worst trades — top 3 wins + top 3 losses
  app.get('/api/trades/best-worst', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };

    const rows = await app.db.select().from(trades)
      .where(and(
        eq(trades.userId, user.id),
        sql`${trades.tradeType} LIKE 'SELL_%'`,
        sql`${trades.pnlUsd} IS NOT NULL`,
      ))
      .orderBy(sql`${trades.createdAt} desc`)
      .limit(500);

    const sorted = rows.slice().sort((a, b) => parseFloat(b.pnlUsd ?? '0') - parseFloat(a.pnlUsd ?? '0'));
    const best  = sorted.slice(0, 3);
    const worst = sorted.slice(-3).reverse();

    reply.send({ data: { best, worst }, error: null });
  });

  // Strategy breakdown — PnL by source (sniper / copy_trade / pump_graduation / social)
  app.get('/api/trades/by-source', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };

    const rows = await app.db.select().from(trades)
      .where(and(
        eq(trades.userId, user.id),
        sql`${trades.tradeType} LIKE 'SELL_%'`,
      ));

    const grouped: Record<string, { trades: number; wins: number; pnl: number }> = {};

    for (const t of rows) {
      const src = t.source ?? 'social';
      if (!grouped[src]) grouped[src] = { trades: 0, wins: 0, pnl: 0 };
      const pnl = parseFloat(t.pnlUsd ?? '0');
      grouped[src].trades++;
      if (pnl > 0) grouped[src].wins++;
      grouped[src].pnl += pnl;
    }

    const result = Object.entries(grouped).map(([source, data]) => ({
      source,
      trades:   data.trades,
      wins:     data.wins,
      winRate:  data.trades > 0 ? data.wins / data.trades : 0,
      totalPnl: data.pnl,
    }));

    reply.send({ data: result, error: null });
  });
}
