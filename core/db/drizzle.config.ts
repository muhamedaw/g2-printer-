import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: [
    './src/schema/sandbox.ts',
    './src/schema/users.ts',
    './src/schema/signals.ts',
    './src/schema/safety.ts',
    './src/schema/trades.ts',
    './src/schema/wallets.ts',
    './src/schema/stats.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? 5432),
    database: process.env['POSTGRES_DB'] ?? 'mpg2',
    user: process.env['POSTGRES_USER'] ?? 'mpg2_user',
    password: process.env['POSTGRES_PASSWORD'] ?? '',
    ssl: false,
  },
});
