import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@mpg2/db';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

declare module 'fastify' {
  interface FastifyInstance { db: Db }
}

export default fp(async (app: FastifyInstance) => {
  const pool = new Pool({
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] ?? '5432'),
    database: process.env['POSTGRES_DB'] ?? 'mpg2',
    user: process.env['POSTGRES_USER'] ?? 'mpg2_user',
    password: process.env['POSTGRES_PASSWORD'],
    ssl: false,
    max: 20,
  });
  const db = drizzle(pool, { schema });
  app.decorate('db', db);
  app.addHook('onClose', async () => pool.end());
});
