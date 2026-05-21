import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { users, userSettings } from '@mpg2/db';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ data: null, error: 'Invalid input' });

    const { email, password } = body.data;
    const existing = await app.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) return reply.status(409).send({ data: null, error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = createId();
    await app.db.insert(users).values({ id, email, passwordHash });
    await app.db.insert(userSettings).values({ userId: id });

    const token = app.jwt.sign({ id, email, planTier: 'free' }, { expiresIn: process.env['JWT_EXPIRY'] ?? '7d' });
    reply.send({ data: { token, user: { id, email, planTier: 'free' } }, error: null });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ data: null, error: 'Invalid input' });

    const { email, password } = body.data;
    const [user] = await app.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return reply.status(401).send({ data: null, error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return reply.status(401).send({ data: null, error: 'Invalid credentials' });
    if (!user.isActive) return reply.status(403).send({ data: null, error: 'Account disabled' });

    const token = app.jwt.sign(
      { id: user.id, email: user.email, planTier: user.planTier },
      { expiresIn: process.env['JWT_EXPIRY'] ?? '7d' },
    );
    reply.send({ data: { token, user: { id: user.id, email: user.email, planTier: user.planTier } }, error: null });
  });

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const payload = req.user as { id: string; email: string; planTier: string };
    const [user] = await app.db.select({
      id: users.id, email: users.email, planTier: users.planTier, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, payload.id)).limit(1);
    if (!user) return reply.status(404).send({ data: null, error: 'User not found' });
    reply.send({ data: user, error: null });
  });
}
