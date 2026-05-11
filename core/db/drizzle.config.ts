import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/schema/*',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? 5432),
    database: process.env['POSTGRES_DB'] ?? 'mpg2',
    user: process.env['POSTGRES_USER'] ?? 'mpg2_user',
    password: process.env['POSTGRES_PASSWORD'] ?? '',
  },
});
