import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  _pool = new Pool({
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] ?? '5432'),
    database: process.env['POSTGRES_DB'] ?? 'mpg2',
    user: process.env['POSTGRES_USER'] ?? 'mpg2_user',
    password: process.env['POSTGRES_PASSWORD'],
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: false,
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDb() {
  await _pool?.end();
  _pool = null;
  _db = null;
}
