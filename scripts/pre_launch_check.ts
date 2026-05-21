#!/usr/bin/env tsx
/**
 * Pre-launch environment validator.
 * Run: pnpm prelaunch
 *
 * Checks all required env vars and optional Redis connectivity.
 * Exits 1 if any critical requirement is missing.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env if present
config({ path: resolve(process.cwd(), '.env') });

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnvVar {
  key:      string;
  required: boolean;
  service:  string;
  hint?:    string;
}

interface CheckResult {
  key:     string;
  service: string;
  present: boolean;
  required: boolean;
}

// ─── Env var registry ─────────────────────────────────────────────────────────

const ENV_VARS: EnvVar[] = [
  // Infrastructure
  { key: 'REDIS_HOST',         required: false, service: 'all',              hint: 'defaults to localhost' },
  { key: 'REDIS_PORT',         required: false, service: 'all',              hint: 'defaults to 6379' },
  { key: 'REDIS_PASSWORD',     required: false, service: 'all',              hint: 'Redis auth password' },
  { key: 'POSTGRES_HOST',      required: true,  service: 'db',               hint: 'e.g. localhost or postgres (Docker)' },
  { key: 'POSTGRES_DB',        required: true,  service: 'db',               hint: 'database name, e.g. mpg2' },
  { key: 'POSTGRES_USER',      required: true,  service: 'db',               hint: 'postgres user' },
  { key: 'POSTGRES_PASSWORD',  required: true,  service: 'db',               hint: 'postgres password' },

  // API Gateway
  { key: 'JWT_SECRET',         required: true,  service: 'api-gateway',      hint: 'min 32 chars, keep secret' },
  { key: 'API_PORT',           required: false, service: 'api-gateway',      hint: 'defaults to 3001' },
  { key: 'FRONTEND_URL',       required: false, service: 'api-gateway',      hint: 'defaults to http://localhost:5173' },

  // Trade Engine
  { key: 'WALLET_MASTER_SECRET', required: true, service: 'trade-engine',    hint: 'min 32 chars for AES-256 key derivation' },
  { key: 'SOLANA_RPC_URL',     required: true,  service: 'trade-engine',     hint: 'https://mainnet.helius-rpc.com/?api-key=...' },

  // Market Data
  { key: 'HELIUS_API_KEY',     required: true,  service: 'market-data',      hint: 'from helius.dev dashboard' },
  { key: 'WEBHOOK_PORT',       required: false, service: 'market-data',      hint: 'defaults to 3003' },
  { key: 'SEED_WALLETS',       required: false, service: 'market-data',      hint: 'comma-separated wallet addresses' },

  // Social Data
  { key: 'TWITTER_BEARER_TOKEN',     required: false, service: 'social-data', hint: 'Twitter API v2 bearer token' },
  { key: 'REDDIT_CLIENT_ID',         required: false, service: 'social-data', hint: 'Reddit app client id' },
  { key: 'REDDIT_CLIENT_SECRET',     required: false, service: 'social-data', hint: 'Reddit app client secret' },
  { key: 'TELEGRAM_API_ID',          required: false, service: 'social-data', hint: 'from my.telegram.org' },
  { key: 'TELEGRAM_API_HASH',        required: false, service: 'social-data', hint: 'from my.telegram.org' },

  // AI Brain
  { key: 'OLLAMA_HOST',        required: false, service: 'ai-brain',         hint: 'defaults to http://localhost:11434' },
  { key: 'OLLAMA_MODEL',       required: false, service: 'ai-brain',         hint: 'defaults to llama3.2:3b' },

  // Notification Engine
  { key: 'TELEGRAM_BOT_TOKEN',       required: true,  service: 'notification', hint: 'from @BotFather' },
  { key: 'ADMIN_TELEGRAM_CHAT_ID',   required: false, service: 'notification', hint: 'your personal chat id for system alerts' },

  // Monetization
  { key: 'STRIPE_SECRET_KEY',        required: true,  service: 'monetization', hint: 'sk_live_... or sk_test_...' },
  { key: 'STRIPE_WEBHOOK_SECRET',    required: true,  service: 'monetization', hint: 'whsec_...' },
  { key: 'STRIPE_STARTER_PRICE_ID',  required: true,  service: 'monetization', hint: 'price_... for starter plan' },
  { key: 'STRIPE_PRO_PRICE_ID',      required: true,  service: 'monetization', hint: 'price_... for pro plan' },
  { key: 'STRIPE_WHALE_PRICE_ID',    required: true,  service: 'monetization', hint: 'price_... for whale plan' },
];

// ─── Validation ───────────────────────────────────────────────────────────────

function checkEnvVars(): CheckResult[] {
  return ENV_VARS.map(v => ({
    key:      v.key,
    service:  v.service,
    present:  Boolean(process.env[v.key]),
    required: v.required,
  }));
}

function printResults(results: CheckResult[]): void {
  const byService: Record<string, CheckResult[]> = {};
  for (const r of results) {
    if (!byService[r.service]) byService[r.service] = [];
    byService[r.service]!.push(r);
  }

  console.log('\n══════════════════════════════════════════');
  console.log('  Money Printer G2 — Pre-launch Check');
  console.log('══════════════════════════════════════════\n');

  for (const [service, vars] of Object.entries(byService)) {
    console.log(`  📦 ${service}`);
    for (const v of vars) {
      const icon   = v.present ? '✅' : v.required ? '❌' : '⚠️ ';
      const label  = v.present ? 'SET' : v.required ? 'MISSING (required)' : 'not set (optional)';
      console.log(`     ${icon} ${v.key.padEnd(32)} ${label}`);
    }
    console.log('');
  }
}

async function checkRedis(): Promise<void> {
  const host = process.env['REDIS_HOST'] ?? 'localhost';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);

  console.log(`  🔌 Redis connectivity (${host}:${port})…`);
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis({ host, port, password: process.env['REDIS_PASSWORD'], lazyConnect: true, connectTimeout: 3000 });
    await client.connect();
    await client.ping();
    client.disconnect();
    console.log('     ✅ Redis reachable\n');
  } catch (err) {
    console.log(`     ⚠️  Redis not reachable: ${err}\n`);
  }
}

async function checkOllama(): Promise<void> {
  const base = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
  console.log(`  🤖 Ollama connectivity (${base})…`);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map(m => m.name);
      const hasLlama = models.some(m => m.includes('llama3.2'));
      console.log(`     ✅ Ollama running — models: ${models.slice(0, 5).join(', ') || 'none'}`);
      if (!hasLlama) console.log('     ⚠️  llama3.2:3b not found — run: ollama pull llama3.2:3b');
    } else {
      console.log(`     ⚠️  Ollama responded ${res.status}`);
    }
  } catch {
    console.log('     ⚠️  Ollama not running — start with: ollama serve');
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const results = checkEnvVars();
  printResults(results);

  await checkRedis();
  await checkOllama();

  const criticalMissing = results.filter(r => r.required && !r.present);
  if (criticalMissing.length > 0) {
    console.log(`❌ ${criticalMissing.length} required env var(s) missing. Set them in .env before launch.\n`);

    // Print hints for missing vars
    for (const r of criticalMissing) {
      const hint = ENV_VARS.find(v => v.key === r.key)?.hint;
      console.log(`   ${r.key}: ${hint ?? 'no hint available'}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('✅ All required env vars present. System ready to launch.\n');
}

main().catch(err => {
  console.error('Pre-launch check failed:', err);
  process.exit(1);
});
