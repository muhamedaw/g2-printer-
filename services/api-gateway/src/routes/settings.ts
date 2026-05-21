import { FastifyInstance } from 'fastify';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { userSettings } from '@mpg2/db';
import { type PlanTier } from '@mpg2/shared';
import { requireAuth } from '../middleware/auth.js';

const settingsSchema = z.object({
  capitalUsd: z.number().min(10).max(1_000_000).optional(),
  maxPositionPct: z.number().min(1).max(100).optional(),
  minScoreToBuy: z.number().min(50).max(100).optional(),
  stopLossPct: z.number().min(5).max(90).optional(),
  telegramChatId: z.string().optional(),
});

export default async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };
    const [settings] = await app.db.select().from(userSettings)
      .where(eq(userSettings.userId, user.id)).limit(1);
    reply.send({ data: settings ?? null, error: null });
  });

  app.put('/api/settings', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };
    const body = settingsSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ data: null, error: 'Invalid settings' });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.capitalUsd !== undefined) patch['capitalUsd'] = body.data.capitalUsd;
    if (body.data.maxPositionPct !== undefined) patch['maxPositionPct'] = body.data.maxPositionPct;
    if (body.data.minScoreToBuy !== undefined) patch['minScoreToBuy'] = body.data.minScoreToBuy;
    if (body.data.stopLossPct !== undefined) patch['stopLossPct'] = body.data.stopLossPct;
    if (body.data.telegramChatId !== undefined) patch['telegramChatId'] = body.data.telegramChatId;
    await app.db.update(userSettings).set(patch as any).where(eq(userSettings.userId, user.id));

    // Immediately sync capitalUsd to Redis so risk engine picks it up without waiting for cache expiry
    if (body.data.capitalUsd !== undefined) {
      await app.redis.set(`portfolio:${user.id}:usd`, String(body.data.capitalUsd));
    }

    reply.send({ data: { updated: true }, error: null });
  });

  app.post('/api/settings/paper-mode', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string };
    const body = req.body as { confirm: string };
    if (body.confirm !== 'CONFIRM') {
      return reply.status(400).send({ data: null, error: 'Send { "confirm": "CONFIRM" } to toggle paper mode' });
    }
    const [current] = await app.db.select({ paperTrading: userSettings.paperTrading })
      .from(userSettings).where(eq(userSettings.userId, user.id)).limit(1);
    const newMode = !current?.paperTrading;
    await app.db.update(userSettings)
      .set({ paperTrading: newMode, updatedAt: new Date() })
      .where(eq(userSettings.userId, user.id));
    // Sync to Redis so trade-engine can read without a DB round-trip
    await app.redis.set(`user:${user.id}:paper_mode`, newMode ? '1' : '0');
    reply.send({ data: { paperTrading: newMode }, error: null });
  });

  app.post('/api/settings/wallet', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user as { id: string; planTier: PlanTier };
    void user; // plan check disabled during testing — re-enable before launch

    const body = req.body as { privateKey?: unknown };
    if (typeof body.privateKey !== 'string' || !body.privateKey) {
      return reply.status(400).send({ data: null, error: 'privateKey is required' });
    }

    // Solana base58-encoded 64-byte secretKey: 87-88 chars
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,120}$/.test(body.privateKey)) {
      return reply.status(400).send({ data: null, error: 'Invalid Solana private key format' });
    }

    const master = process.env['WALLET_MASTER_SECRET'];
    if (!master) {
      return reply.status(503).send({ data: null, error: 'Wallet service not configured' });
    }

    // Same format as WalletManager.encryptPrivateKey(): iv:tag:ciphertext (hex, SHA-256 key)
    const key       = createHash('sha256').update(master).digest();
    const iv        = randomBytes(12);
    const cipher    = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(body.privateKey, 'utf8'), cipher.final()]);
    const tag       = cipher.getAuthTag();
    const ciphertext = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;

    await app.redis.set(`user:${user.id}:encrypted_wallet`, ciphertext);
    await app.redis.sadd('users:live_trading', user.id);

    reply.send({ data: { registered: true }, error: null });
  });
}
