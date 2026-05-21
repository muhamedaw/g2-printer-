,,MHLBH G3J; .MPHB ,MB LML ,  # MONEY PRINTER G2 — MASTER PROMPT FOR CLAUDE CODE
# AI-Powered Solana Intelligence + Trading + Growth Platform
# Version 3.0 — Production Ready — Open Source Only
# ═══════════════════════════════════════════════════════════════

## IDENTITY
You are the founding engineer of Money Printer G2.
You act as: CTO + Senior Backend Engineer + AI Architect +
SolanaW

## WHAT MONEY PRINTER G2 IS
An AI-powered Solana intelligence platform that detects opportunities,
analyzes trends, avoids scams, executes trades, learns from results,
and generates revenue via SaaS subscriptions.
NOT just a trading bot. An intelligence OS for Solana — sold as a service.

## HARD RULES — NEVER BREAK
1. Open-source only. Zero paid AI. Zero paid APIs (except security if needed).
2. AI layer = Ollama local models ONLY. Never OpenAI, Anthropi 
3. No vendor lock-in. Every service must be swappable.
4. Production-ready code only. No demo stubs, no fake data, no TODO comments.
5. Clean architecture. Every module isolated and reusable.
6. Security first. Keys encrypted, wallets safe, auth enforced.
7. Paper trading before real trading. ALWAYS. PAPER_TRADING=true by default.
8. Multi-tenant from day one. Every table has user_id. Every query filters by user.
9. Every technical decision must have an inline comment explaining WHY.
10. Never promise profits or guarantee trading performance.

## PACKAGE NAMING CONVENTION
- All packages: @mpg2/package-name
- All Docker containers: mpg2-service-name
- Database name: mpg2
- Database user: mpg2_user
- Environment prefix: MPG2_

---

# ═══════════════════════════════════════════════════════════════
# ARCHITECTURE DECISIONS — READ BEFORE CODING
# ═══════════════════════════════════════════════════════════════

## WHY OLLAMA (not OpenAI, not HuggingFace paid)
Ollama runs LLMs locally on your VPS. Zero API costs. Zero rate limits.
Models: llama3.2 (sentiment/reasoning), nomic-embed-text (embeddings).
WHY NOT HUGGINGFACE FREE: Rate limits hit in production within hours.
WHY NOT OPENAI: $0.002/1k tokens × millions of tokens = real money every month.
Ollama on a $20/month VPS = infinite AI calls forever.

## WHY DRIZZLE ORM (not raw SQL, not Prisma)
Raw SQL = no type safety, manual migrations, easy to break.
Prisma = heavyweight, slow, generates a client that's hard to debug.
Drizzle = TypeScript-first, zero-overhead ORM, migrations are just TypeScript files.
Your DB schema IS your TypeScript types. No drift ever.

## WHY FASTIFY (not Express, not Hono)
Express is unmaintained. No TypeScript first-class support.
Hono is for edge/serverless. We run on VPS/Docker.
Fastify: 2x faster than Express, built-in JSON Schema validation via Ajv,
first-class TypeScript, plugin system prevents shared global state.

## WHY POSTGRESQL + REDIS
PostgreSQL: ACID compliant, row-level locking, JSONB columns, free.
Solana data is relational — tokens have holders, holders have wallets, wallets have trades.
Redis: cache + queue (BullMQ) + pub-sub + rate limiting in ONE service.

## WHY MONOREPO WITH PNPM
All services share types. Breaking type change = TypeScript error everywhere instantly.
pnpm: hoists dependencies once, 40% less disk, faster installs than npm/yarn.

## WHY DOCKER COMPOSE (not Kubernetes)
K8s is for 50+ services and 10+ engineers. We have 9 services and 1-3 engineers.
Docker Compose: entire infrastructure in one file, starts in 30 seconds.

## WHY TELEGRAM BOT AS PRIMARY INTERFACE FOR MVP
Building a full React dashboard takes 2-3 weeks.
Building a Telegram bot takes 2 days.
Users want alerts on their phones, not a browser tab.
Telegram bot = MVP. Dashboard = Phase 2.

## WHY STRIPE FOR MONETIZATION
Industry standard. Best developer experience. Webhook-based.
Free to integrate. Only pay when you earn (2.9% + $0.30 per transaction).
Zero upfront cost. Perfect for zero-to-production.

---

# ═══════════════════════════════════════════════════════════════
# COMPLETE FOLDER STRUCTURE
# ═══════════════════════════════════════════════════════════════

```
money-printer-g2/
├── apps/
│   └── dashboard/                    # React 18 + Vite + TypeScript (Phase 2)
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/               # Button, Card, Badge, Input
│       │   │   ├── charts/           # PriceChart, EquityCurve, VolumeBar
│       │   │   └── layout/           # Shell, Sidebar, Topbar
│       │   ├── pages/
│       │   │   ├── Overview.tsx      # Capital + P&L + live signals
│       │   │   ├── Signals.tsx       # Real-time signal feed
│       │   │   ├── Tokens.tsx        # Token explorer + safety scores
│       │   │   ├── Portfolio.tsx     # Open positions + trade history
│       │   │   ├── Wallets.tsx       # Smart wallet tracker
│       │   │   ├── Backtest.tsx      # Backtest runner + results
│       │   │   ├── Leaderboard.tsx   # Public performance page (viral)
│       │   │   ├── Subscription.tsx  # Stripe plans + upgrade
│       │   │   └── Settings.tsx      # Bot config + preferences
│       │   ├── hooks/
│       │   ├── stores/               # Zustand state
│       │   ├── api/                  # Typed API client
│       │   └── lib/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── services/
│   ├── api-gateway/                  # Fastify — single HTTP entry point
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts           # register, login, refresh, me
│   │   │   │   ├── tokens.ts         # search, detail, safety, trending
│   │   │   │   ├── signals.ts        # feed, stats
│   │   │   │   ├── trades.ts         # history, stats
│   │   │   │   ├── portfolio.ts      # positions, summary, close
│   │   │   │   ├── wallets.ts        # smart wallets list
│   │   │   │   ├── settings.ts       # get/update bot config
│   │   │   │   ├── subscription.ts   # Stripe plans, upgrade, portal
│   │   │   │   └── realtime.ts       # WebSocket — signals, positions, alerts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # JWT verification + user context
│   │   │   │   ├── rateLimit.ts      # Redis sliding window rate limiter
│   │   │   │   ├── subscription.ts   # Feature gate by plan tier
│   │   │   │   └── logger.ts         # Request logging with timing
│   │   │   ├── plugins/
│   │   │   │   ├── redis.ts
│   │   │   │   ├── postgres.ts
│   │   │   │   └── websocket.ts
│   │   │   └── server.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── market-data/                  # Prices, liquidity, on-chain data
│   │   ├── src/
│   │   │   ├── collectors/
│   │   │   │   ├── dexscreener.ts    # Token prices + liquidity (FREE, no key)
│   │   │   │   ├── helius.ts         # Solana RPC + Geyser WebSocket (FREE tier)
│   │   │   │   ├── jupiter.ts        # Swap routes + price quotes (FREE, no key)
│   │   │   │   ├── rugcheck.ts       # Token safety scores (FREE, no key)
│   │   │   │   └── pump.ts           # Pump.fun WebSocket — new launches (FREE)
│   │   │   ├── processors/
│   │   │   │   ├── normalizer.ts     # Normalize data from different APIs
│   │   │   │   ├── enricher.ts       # Add age, ratios, computed fields
│   │   │   │   └── deduplicator.ts   # Prevent processing same token twice
│   │   │   ├── whale-tracker/
│   │   │   │   ├── WalletMonitor.ts  # Helius Geyser WebSocket per wallet
│   │   │   │   ├── PatternClassifier.ts # Institutional vs Lucky vs Insider
│   │   │   │   └── CopySignal.ts     # Emit copy trade signals
│   │   │   ├── publishers/
│   │   │   │   └── redis-publisher.ts
│   │   │   └── worker.ts             # BullMQ worker
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── social-data/                  # Social media signal collection
│   │   ├── src/
│   │   │   ├── scrapers/
│   │   │   │   ├── twitter.ts        # twitter-api-v2 (FREE basic tier)
│   │   │   │   ├── reddit.ts         # snoowrap (FREE)
│   │   │   │   ├── telegram.ts       # gramjs public channel scraping (FREE)
│   │   │   │   └── news.ts           # rss-parser + CryptoPanic free tier
│   │   │   ├── extractors/
│   │   │   │   ├── contract.ts       # Extract Solana addresses from text
│   │   │   │   ├── sentiment.ts      # Pre-filter before Ollama (fast keyword)
│   │   │   │   └── engagement.ts     # Normalize metrics cross-platform
│   │   │   └── worker.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── ai-brain/                     # Multi-agent decision engine — Ollama powered
│   │   ├── src/
│   │   │   ├── agents/
│   │   │   │   ├── MarketAgent.ts    # Price/volume/liquidity analysis
│   │   │   │   ├── SocialAgent.ts    # Social momentum + authenticity
│   │   │   │   ├── ScamAgent.ts      # Rug patterns + TokenDNA check
│   │   │   │   ├── WhaleAgent.ts     # Smart money pattern classification
│   │   │   │   └── DecisionAgent.ts  # Combines all → BUY/WAIT/SELL/BLOCK
│   │   │   ├── ollama/
│   │   │   │   ├── OllamaClient.ts   # HTTP client for local Ollama API
│   │   │   │   ├── SentimentModel.ts # llama3.2 — sentiment analysis
│   │   │   │   ├── NarrativeModel.ts # llama3.2 — narrative freshness scoring
│   │   │   │   └── EmbedModel.ts     # nomic-embed-text — similarity search
│   │   │   ├── scoring/
│   │   │   │   ├── ScoreCalculator.ts # Weighted formula — all agent outputs
│   │   │   │   └── ScoreWeights.ts    # Configurable per market regime
│   │   │   ├── learning/
│   │   │   │   ├── SelfLearner.ts    # Weekly weight adjustment from results
│   │   │   │   ├── Backtester.ts     # Historical simulation engine
│   │   │   │   └── RegimeDetector.ts # BULL/BEAR/SIDEWAYS/EXTREME detection
│   │   │   └── worker.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── security-engine/              # Token security verification
│   │   ├── src/
│   │   │   ├── checkers/
│   │   │   │   ├── RugChecker.ts     # api.rugcheck.xyz (FREE, no key)
│   │   │   │   ├── HoneypotChecker.ts # Jupiter sell simulation (FREE)
│   │   │   │   ├── LiquidityChecker.ts # DexScreener lock check (FREE)
│   │   │   │   ├── HolderChecker.ts   # Helius holder concentration
│   │   │   │   ├── MintChecker.ts     # Mint/freeze authority via Solana RPC
│   │   │   │   └── DnaChecker.ts      # Match against known rug patterns
│   │   │   ├── dna/
│   │   │   │   ├── DnaExtractor.ts    # Extract fingerprint from rug tokens
│   │   │   │   └── DnaDatabase.ts     # Compare against known patterns
│   │   │   ├── cache/
│   │   │   │   └── SafetyCache.ts     # Redis — 15 min TTL per token
│   │   │   └── SecurityScorer.ts      # Aggregates all checks → 0-100 score
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── risk-engine/                  # Risk controls and position limits
│   │   ├── src/
│   │   │   ├── guards/
│   │   │   │   ├── DailyLossGuard.ts    # Stop if daily loss > 10%
│   │   │   │   ├── PositionSizeGuard.ts # Max 5% capital per trade
│   │   │   │   ├── ExposureGuard.ts     # Max 5 concurrent positions
│   │   │   │   ├── SlippageGuard.ts     # Reject if price impact > 5%
│   │   │   │   └── CooldownGuard.ts     # Pause after 3 consecutive losses
│   │   │   ├── monitors/
│   │   │   │   ├── PositionMonitor.ts   # Real-time position tracking
│   │   │   │   └── DrawdownMonitor.ts   # Portfolio drawdown tracking
│   │   │   ├── calculators/
│   │   │   │   ├── PositionSizer.ts     # Score 80-84→1%, 85-89→2%, 90-94→3.5%, 95+→5%
│   │   │   │   └── PnLCalculator.ts     # Real-time P&L for all positions
│   │   │   └── RiskController.ts        # Orchestrates all guards
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── trade-engine/                 # Paper + live trade execution
│   │   ├── src/
│   │   │   ├── executors/
│   │   │   │   ├── PaperExecutor.ts  # Simulates trades, records to DB
│   │   │   │   └── LiveExecutor.ts   # Jupiter swap + Jito MEV bundle
│   │   │   ├── managers/
│   │   │   │   ├── PositionManager.ts # TP1/TP2/TP3/SL/Trailing — runs every 30s
│   │   │   │   └── WalletTracker.ts   # Copy trade from smart wallets
│   │   │   ├── optimizers/
│   │   │   │   └── JitoOptimizer.ts   # Priority transaction bundling
│   │   │   └── TradeEngine.ts         # Main orchestrator
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── notification-engine/          # All outbound notifications
│   │   ├── src/
│   │   │   ├── telegram/
│   │   │   │   ├── TelegramBot.ts    # Grammy.js bot — PRIMARY interface for MVP
│   │   │   │   ├── commands/
│   │   │   │   │   ├── status.ts     # /status — bot health + positions
│   │   │   │   │   ├── positions.ts  # /positions — open trades
│   │   │   │   │   ├── pnl.ts        # /pnl — today's performance
│   │   │   │   │   ├── stop.ts       # /stop — EMERGENCY STOP
│   │   │   │   │   └── settings.ts   # /settings — view/change config
│   │   │   │   └── alerts/
│   │   │   │       ├── TradeAlert.ts  # New trade executed
│   │   │   │       ├── TpSlAlert.ts   # TP hit / Stop loss
│   │   │   │       └── RiskAlert.ts   # Daily limit / drawdown warning
│   │   │   ├── reports/
│   │   │   │   ├── DailyReport.ts    # Daily P&L at 8am → Telegram
│   │   │   │   └── WeeklyReport.ts   # Weekly performance summary
│   │   │   └── worker.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── monetization/                 # Stripe subscriptions + API keys
│       ├── src/
│       │   ├── stripe/
│       │   │   ├── StripeClient.ts   # Stripe SDK wrapper
│       │   │   ├── webhooks.ts       # Handle subscription events
│       │   │   └── plans.ts          # Plan definitions + feature flags
│       │   ├── api-keys/
│       │   │   ├── ApiKeyManager.ts  # Generate, validate, revoke API keys
│       │   │   └── UsageTracker.ts   # Track API usage per key
│       │   └── FeatureGate.ts        # Check if user can access a feature
│       ├── tsconfig.json
│       └── package.json
│
├── core/
│   ├── shared/                       # Types + utils + constants — used everywhere
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── token.ts          # Token, TokenSafety, TokenDNA
│   │   │   │   ├── trade.ts          # Trade, Position, PnL
│   │   │   │   ├── signal.ts         # RawSignal, AiSignal, BuySignal
│   │   │   │   ├── agent.ts          # AgentScore, Decision, AgentOutput
│   │   │   │   ├── wallet.ts         # SmartWallet, WalletPattern, WalletPerformance
│   │   │   │   ├── user.ts           # User, Subscription, PlanTier, ApiKey
│   │   │   │   └── api.ts            # API request/response shapes
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts         # Pino structured logger
│   │   │   │   ├── redis.ts          # ioredis connection factory
│   │   │   │   ├── retry.ts          # Exponential backoff
│   │   │   │   ├── validation.ts     # Zod schemas for common shapes
│   │   │   │   ├── crypto.ts         # AES encryption for secrets
│   │   │   │   └── circuit-breaker.ts # Circuit breaker pattern
│   │   │   ├── constants/
│   │   │   │   ├── chains.ts         # Solana program IDs, mint addresses
│   │   │   │   ├── platforms.ts      # Platform weights + scoring constants
│   │   │   │   ├── risk.ts           # Default risk parameters per plan tier
│   │   │   │   └── plans.ts          # Plan features + limits
│   │   │   └── config/
│   │   │       └── env.ts            # Zod-validated env parser
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── db/                           # Drizzle ORM — schemas + migrations
│       ├── schema/
│       │   ├── users.ts              # users, subscriptions, api_keys
│       │   ├── signals.ts            # raw_signals, ai_signals
│       │   ├── safety.ts             # safety_checks, token_blacklist, token_dna
│       │   ├── trades.ts             # trades, positions
│       │   ├── wallets.ts            # smart_wallets
│       │   ├── stats.ts              # daily_stats, learning_log
│       │   └── index.ts              # Re-exports all schemas
│       ├── migrations/               # Auto-generated by drizzle-kit
│       ├── seeds/
│       │   └── dev.ts                # TypeScript seed file
│       ├── drizzle.config.ts         # Drizzle Kit config
│       └── package.json
│
├── data/
│   ├── smart_wallets.json            # Profitable wallets to copy-trade
│   ├── blacklist.json                # Known scam tokens/wallets
│   └── token_dna_patterns.json       # Rug fingerprints (creator patterns)
│
├── scripts/
│   ├── setup.ps1                     # Windows setup script
│   ├── setup.sh                      # Linux/Mac setup script
│   ├── pre_launch_check.ts           # Verify all systems before going live
│   └── find_smart_wallets.ts         # Discover profitable wallets
│
├── docker/
│   └── ollama/
│       └── pull-models.sh            # Pull required Ollama models on startup
│
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions CI
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── .prettierrc
└── .eslintrc.json
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 01 — MONOREPO FOUNDATION
# What: Complete scaffold — all config files + core packages
# Depends on: Nothing (start here)
# ═══════════════════════════════════════════════════════════════

```
You are the founding engineer of Money Printer G2.
PROMPT 01 of 16. Build the complete monorepo foundation.
Follow exactly. Every decision has a WHY comment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1A: ROOT CONFIG FILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create pnpm-workspace.yaml:
packages:
  - 'apps/*'
  - 'services/*'
  - 'core/*'

Create package.json (root):
{
  "name": "money-printer-g2",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "db:generate": "pnpm --filter @mpg2/db drizzle-kit generate",
    "db:migrate": "pnpm --filter @mpg2/db drizzle-kit migrate",
    "db:studio": "pnpm --filter @mpg2/db drizzle-kit studio",
    "db:seed": "pnpm --filter @mpg2/db tsx seeds/dev.ts",
    "docker:up": "docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "prelaunch": "tsx scripts/pre_launch_check.ts"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "prettier": "^3.3.0",
    "prettier-plugin-tailwindcss": "^0.6.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" }
}

Create tsconfig.base.json:
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}

Create .env.example:
# ════════════════════════════════════════════════
# MONEY PRINTER G2 — ENVIRONMENT VARIABLES
# Copy to .env and fill values. NEVER commit .env
# ════════════════════════════════════════════════

# ── Database ──────────────────────────────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mpg2
POSTGRES_USER=mpg2_user
POSTGRES_PASSWORD=change_this_32_char_minimum_password_here

# ── Redis ─────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=change_this_redis_password

# ── Auth ──────────────────────────────────────
JWT_SECRET=generate_with_openssl_rand_base64_64_minimum_32_chars
JWT_EXPIRY=7d

# ── Ollama (LOCAL AI — FREE FOREVER) ──────────
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL_SENTIMENT=llama3.2
OLLAMA_MODEL_NARRATIVE=llama3.2
OLLAMA_MODEL_EMBED=nomic-embed-text
# WHY OLLAMA: Zero cost, zero rate limits, runs on your VPS.
# Install: https://ollama.ai — pull models after install.
# Commands: ollama pull llama3.2 && ollama pull nomic-embed-text

# ── Solana ────────────────────────────────────
HELIUS_API_KEY=get_free_at_helius_dev
# HOW: helius.dev → Sign up → Dashboard → Create API Key
# Free tier: 100k credits/day — enough for continuous operation

SOLANA_WALLET_PRIVATE_KEY=your_bot_wallet_private_key_base58
# CRITICAL: Use a DEDICATED wallet. NEVER your main wallet.
# HOW: Phantom → Create new wallet → Export private key

JITO_BLOCK_ENGINE_URL=https://ny.mainnet.block-engine.jito.wtf
# WHY JITO: Priority transaction inclusion — not a subscription, just tip SOL per tx

# ── Social Media (ALL FREE TIERS) ─────────────
TWITTER_BEARER_TOKEN=get_at_developer_twitter_com
TWITTER_API_KEY=get_at_developer_twitter_com
TWITTER_API_SECRET=get_at_developer_twitter_com
TWITTER_ACCESS_TOKEN=get_at_developer_twitter_com
TWITTER_ACCESS_SECRET=get_at_developer_twitter_com

REDDIT_CLIENT_ID=get_at_reddit_com_prefs_apps
REDDIT_CLIENT_SECRET=get_at_reddit_com_prefs_apps
REDDIT_USER_AGENT=MoneyPrinterG2/1.0

TELEGRAM_API_ID=get_at_my_telegram_org
TELEGRAM_API_HASH=get_at_my_telegram_org
# WHY: gramjs scrapes public Telegram channels without bot token

CRYPTOPANIC_API_KEY=get_free_at_cryptopanic_com_api

# ── Notifications ─────────────────────────────
TELEGRAM_BOT_TOKEN=get_from_botfather_on_telegram
# HOW: Telegram → @BotFather → /newbot → copy token
TELEGRAM_CHAT_ID=your_personal_telegram_id
# HOW: Telegram → @userinfobot → start → copy your ID

# ── Monetization ──────────────────────────────
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_STARTER=price_starter_id_from_stripe_dashboard
STRIPE_PRICE_PRO=price_pro_id_from_stripe_dashboard
STRIPE_PRICE_WHALE=price_whale_id_from_stripe_dashboard
# WHY STRIPE: No upfront cost. 2.9%+$0.30 per transaction only.

# ── App Config ────────────────────────────────
NODE_ENV=development
API_PORT=3001
DASHBOARD_PORT=3000
PAPER_TRADING=true
LOG_LEVEL=info
FRONTEND_URL=http://localhost:3000

# ── FREE APIs — NO KEY NEEDED ─────────────────
# DexScreener: api.dexscreener.com — no key required
# Jupiter:     quote-api.jup.ag — no key required
# RugCheck:    api.rugcheck.xyz — no key required
# Pump.fun:    WebSocket — no key required

Create .gitignore:
.env
.env.local
.env.*.local
node_modules/
.pnpm-store/
dist/
build/
.turbo/
*.db
*.sqlite
logs/
*.log
.DS_Store
Thumbs.db
.vscode/settings.json
.idea/
coverage/
*.key
*.pem
private_key*
drizzle/meta/

Create .prettierrc:
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1B: CORE/SHARED PACKAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create core/shared/package.json:
{
  "name": "@mpg2/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "zod": "^3.23.4",
    "pino": "^9.3.0",
    "pino-pretty": "^11.0.0",
    "ioredis": "^5.4.0"
  }
}

Create core/shared/src/types/token.ts:
export interface Token {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  detectedAt: Date;
  source: TokenSource;
}

export type TokenSource =
  | 'pump_fun_launch'
  | 'pump_fun_graduation'
  | 'social_signal'
  | 'wallet_copy'
  | 'manual';

export interface TokenSafety {
  tokenAddress: string;
  overallScore: number;        // 0-100
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  topHolderPct: number;
  top10HoldersPct: number;
  holderCount: number;
  isHoneypot: boolean;
  liquidityUsd: number;
  tokenAgeMinutes: number;
  buySellRatio: number;
  rugcheckScore: number;       // 0-1000 from rugcheck.xyz
  dnaMatchFound: boolean;      // true if matches known rug pattern
  rejectionReason?: string;
  passed: boolean;
  checkedAt: Date;
  expiresAt: Date;
}

export interface TokenDNA {
  patternId: string;
  creatorWallet: string;
  contractPatterns: string[];  // Bytecode patterns that match
  lpPatterns: string[];        // LP lock/unlock patterns
  holderPatterns: string[];    // Sniper wallet patterns
  ruggedTokens: string[];      // Known rugged tokens by this creator
  confidence: number;          // 0-1
}

Create core/shared/src/types/signal.ts:
export type Platform = 'twitter' | 'reddit' | 'telegram' | 'news';
// NOTE: TikTok/Instagram removed — unofficial APIs are unreliable

export interface RawSignal {
  id?: number;
  platform: Platform;
  content: string;
  contractAddress?: string;
  authorUsername?: string;
  authorFollowers: number;
  engagementScore: number;     // Normalized 0-100
  platformWeight: number;
  influencerWeight: number;
  rawData?: Record<string, unknown>;
  processed: boolean;
  createdAt: Date;
}

export interface AiSignal {
  contractAddress: string;
  tokenSymbol?: string;
  sentimentScore: number;      // 0-100 via Ollama llama3.2
  authenticityScore: number;   // 0-1.0
  trendScore: number;          // 0-100
  narrativeFreshness: number;  // 0-1.0 (1=brand new narrative)
  finalAiScore: number;
  platformsDetected: Platform[];
  platformCount: number;
  influencerCount: number;
  reasoning: string;           // Ollama explanation
  passedToSafety: boolean;
  createdAt: Date;
}

export interface BuySignal {
  contractAddress: string;
  tokenSymbol?: string;
  finalScore: number;
  positionSizeUsd: number;
  aiScore: number;
  safetyScore: number;
  platformsDetected: Platform[];
  reasoning: string;
  source: 'social' | 'copy_trade' | 'pump_graduation' | 'manual';
  userId: string;              // Multi-tenant
  createdAt: Date;
}

Create core/shared/src/types/trade.ts:
export interface Trade {
  id?: number;
  userId: string;              // Multi-tenant — always filter by this
  contractAddress: string;
  tokenSymbol?: string;
  tradeType: TradeType;
  isPaperTrade: boolean;
  entryPrice?: number;
  exitPrice?: number;
  quantityTokens: number;
  solAmount: number;
  usdAmount: number;
  pnlUsd?: number;
  pnlPct?: number;
  finalScore: number;
  txSignature?: string;
  gasFeeSOL?: number;
  jitoTipSOL?: number;
  sellReason?: TradeCloseReason;
  copyTradeWallet?: string;
  createdAt: Date;
}

export type TradeType =
  | 'BUY'
  | 'SELL_TP1' | 'SELL_TP2' | 'SELL_TP3'
  | 'SELL_STOP_LOSS'
  | 'SELL_TRAILING'
  | 'SELL_MANUAL';

export type TradeCloseReason =
  | 'take_profit_1' | 'take_profit_2' | 'take_profit_3'
  | 'stop_loss' | 'trailing_stop' | 'manual' | 'daily_limit';

export interface Position {
  id?: number;
  userId: string;
  contractAddress: string;
  tokenSymbol?: string;
  entryPrice: number;
  currentPrice?: number;
  highestPriceSeen: number;
  quantityRemaining: number;
  usdInvested: number;
  currentUsdValue?: number;
  unrealizedPnlPct?: number;
  tp1Executed: boolean;
  tp2Executed: boolean;
  tp3Executed: boolean;
  trailingStopActive: boolean;
  finalScore: number;
  isPaperTrade: boolean;
  openedAt: Date;
  updatedAt: Date;
}

Create core/shared/src/types/user.ts:
export type PlanTier = 'free' | 'starter' | 'pro' | 'whale';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  planTier: PlanTier;
  isActive: boolean;
  publicSlug?: string;         // For performance public page
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planTier: PlanTier;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodEnd: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;             // Store hash, never plaintext
  name: string;
  requestsToday: number;
  requestLimit: number;        // Per plan tier
  lastUsedAt?: Date;
  createdAt: Date;
}

export const PLAN_LIMITS: Record<PlanTier, PlanFeatures> = {
  free:    { maxPositions: 3, liveTrading: false, apiAccess: false, signalDelay: 600, copyTrading: false },
  starter: { maxPositions: 5, liveTrading: true,  apiAccess: false, signalDelay: 0,   copyTrading: true  },
  pro:     { maxPositions: 10, liveTrading: true,  apiAccess: true,  signalDelay: 0,   copyTrading: true  },
  whale:   { maxPositions: 999, liveTrading: true,  apiAccess: true,  signalDelay: 0,   copyTrading: true  },
};

export interface PlanFeatures {
  maxPositions: number;
  liveTrading: boolean;
  apiAccess: boolean;
  signalDelay: number;         // Seconds delay for free tier
  copyTrading: boolean;
}

Create core/shared/src/types/wallet.ts:
export type WalletPattern = 'institutional' | 'insider' | 'lucky_retail' | 'unknown';

export interface SmartWallet {
  id?: number;
  walletAddress: string;
  nickname?: string;
  pattern: WalletPattern;      // Classified by PatternClassifier
  winRate: number;             // 0-1
  avgProfitX: number;          // Average profit multiplier
  avgLossPct: number;
  totalTrades: number;
  winningTrades: number;
  isActive: boolean;
  lastTradeAt?: Date;
  addedAt: Date;
}

export interface WalletPerformance {
  walletAddress: string;
  period30d: {
    trades: number;
    winRate: number;
    totalPnlUsd: number;
    bestTradeX: number;
  };
}

Create core/shared/src/utils/logger.ts:
import pino from 'pino';

// WHY PINO: Fastest Node.js logger. Structured JSON output.
// JSON logs = searchable in any log aggregator. 5x faster than Winston.
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport:
    process.env['NODE_ENV'] === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  base: { service: process.env['SERVICE_NAME'] ?? 'mpg2' },
});

Create core/shared/src/utils/circuit-breaker.ts:
// WHY CIRCUIT BREAKER: If Helius API is down, ai-brain should not crash.
// After N failures, the breaker opens and returns cached/default response.
// Prevents cascading failures across services.
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly name: string,
    private readonly threshold = 5,
    private readonly timeout = 60_000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.name}`);
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) this.state = 'open';
  }
}

Create core/shared/src/utils/env.ts:
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVICE_NAME: z.string().optional(),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(16),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('7d'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL_SENTIMENT: z.string().default('llama3.2'),
  OLLAMA_MODEL_NARRATIVE: z.string().default('llama3.2'),
  OLLAMA_MODEL_EMBED: z.string().default('nomic-embed-text'),
  HELIUS_API_KEY: z.string().min(1),
  SOLANA_WALLET_PRIVATE_KEY: z.string().optional(),
  JITO_BLOCK_ENGINE_URL: z.string().url().optional(),
  PAPER_TRADING: z.string().transform(v => v === 'true').default('true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  API_PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Environment validation failed:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

Create core/shared/src/constants/risk.ts:
export const DEFAULT_RISK = {
  CAPITAL_TOTAL_USD: 1000,
  MAX_POSITION_PCT: 0.05,
  MAX_OPEN_POSITIONS: 5,
  RESERVE_CAPITAL_PCT: 0.20,

  MIN_SCORE_TO_BUY: 80,
  MIN_LIQUIDITY_USD: 10_000,
  MAX_LIQUIDITY_USD: 500_000,
  MIN_HOLDERS: 100,
  MIN_TOKEN_AGE_MINUTES: 60,
  MAX_TOKEN_AGE_HOURS: 6,
  MIN_BUY_SELL_RATIO: 0.55,
  MAX_PRICE_IMPACT_PCT: 0.05,

  STOP_LOSS_PCT: -0.30,
  TP1_MULTIPLIER: 2.0,  TP1_SELL_PCT: 0.30,
  TP2_MULTIPLIER: 5.0,  TP2_SELL_PCT: 0.30,
  TP3_MULTIPLIER: 10.0, TP3_SELL_PCT: 0.30,
  MOONBAG_PCT: 0.10,
  TRAILING_STOP_FROM_PEAK: 0.20,

  DAILY_LOSS_LIMIT_PCT: 0.10,
  WEEKLY_LOSS_LIMIT_PCT: 0.20,
  MAX_CONSECUTIVE_LOSSES: 3,
  MAX_SLIPPAGE_PCT: 0.15,
  JITO_TIP_SOL: 0.001,

  PUMP_SCAN_MS: 3_000,
  PRICE_CHECK_MS: 30_000,
  WALLET_SCAN_MS: 1_000,
  SOCIAL_SCAN_MS: 60_000,
  SAFETY_CACHE_MINUTES: 15,

  PLATFORM_WEIGHTS: {
    news: 1.4, twitter: 1.2, telegram: 1.1, reddit: 1.0,
  },

  INFLUENCER_TIERS: [
    { minFollowers: 1_000_000, weight: 3.0 },
    { minFollowers: 100_000,   weight: 2.0 },
    { minFollowers: 10_000,    weight: 1.5 },
    { minFollowers: 0,         weight: 1.0 },
  ],

  AI_WEIGHTS: {
    sentiment: 0.35,
    authenticity: 0.30,
    trend: 0.20,
    narrativeFreshness: 0.15,
  },

  // Regime-specific score minimums
  REGIME_MIN_SCORE: {
    EXTREME_BULL: 70,
    BULL: 80,
    SIDEWAYS: 85,
    BEAR: 90,
    EXTREME_BEAR: 999, // Effectively paused
  },
} as const;

Create core/shared/src/constants/chains.ts:
export const SOLANA = {
  PROGRAMS: {
    JUPITER:  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    RAYDIUM:  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    ORCA:     'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    JITO_TIP: 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  },
  MINTS: {
    SOL:  'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  REGEX: { ADDRESS: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g },
  KNOWN_NOT_TOKENS: new Set([
    'So11111111111111111111111111111111111111112',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  ]),
} as const;

Create core/shared/src/index.ts — re-export everything:
export * from './types/token';
export * from './types/signal';
export * from './types/trade';
export * from './types/user';
export * from './types/wallet';
export * from './utils/logger';
export * from './utils/env';
export * from './utils/circuit-breaker';
export * from './constants/risk';
export * from './constants/chains';

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1C: CORE/DB PACKAGE — DRIZZLE ORM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create core/db/package.json:
{
  "name": "@mpg2/db",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@mpg2/shared": "workspace:*",
    "drizzle-orm": "^0.32.0",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.23.0",
    "@types/pg": "^8.11.0"
  }
}

Create core/db/drizzle.config.ts:
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

Create core/db/src/schema/users.ts:
import { pgTable, text, boolean, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const planTierEnum = pgEnum('plan_tier', ['free', 'starter', 'pro', 'whale']);

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  planTier: planTierEnum('plan_tier').notNull().default('free'),
  publicSlug: text('public_slug').unique(),   // For leaderboard page
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  planTier: planTierEnum('plan_tier').notNull(),
  status: text('status').notNull(),            // active | cancelled | past_due
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id),
  keyHash: text('key_hash').notNull().unique(),
  name: text('name').notNull(),
  requestsToday: integer('requests_today').notNull().default(0),
  requestLimit: integer('request_limit').notNull().default(1000),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id),
  capitalUsd: integer('capital_usd').notNull().default(1000),
  maxPositionPct: integer('max_position_pct').notNull().default(5),
  minScoreToBuy: integer('min_score_to_buy').notNull().default(80),
  stopLossPct: integer('stop_loss_pct').notNull().default(30),
  paperTrading: boolean('paper_trading').notNull().default(true),
  telegramChatId: text('telegram_chat_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

Create core/db/src/schema/signals.ts:
import { pgTable, bigserial, varchar, text, decimal, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const rawSignals = pgTable('raw_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  platform: varchar('platform', { length: 20 }).notNull(),
  content: text('content'),
  contractAddress: varchar('contract_address', { length: 44 }),
  authorUsername: varchar('author_username', { length: 100 }),
  authorFollowers: integer('author_followers').default(0),
  engagementScore: decimal('engagement_score', { precision: 8, scale: 2 }).default('0'),
  platformWeight: decimal('platform_weight', { precision: 4, scale: 2 }).default('1.0'),
  influencerWeight: decimal('influencer_weight', { precision: 4, scale: 2 }).default('1.0'),
  rawData: jsonb('raw_data'),
  processed: boolean('processed').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const aiSignals = pgTable('ai_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contractAddress: varchar('contract_address', { length: 44 }).notNull(),
  tokenSymbol: varchar('token_symbol', { length: 20 }),
  sentimentScore: decimal('sentiment_score', { precision: 5, scale: 2 }),
  authenticityScore: decimal('authenticity_score', { precision: 4, scale: 3 }),
  trendScore: decimal('trend_score', { precision: 5, scale: 2 }),
  narrativeFreshness: decimal('narrative_freshness', { precision: 4, scale: 3 }),
  finalAiScore: decimal('final_ai_score', { precision: 5, scale: 2 }),
  platformsDetected: text('platforms_detected').array().default([]),
  platformCount: integer('platform_count').default(1),
  influencerCount: integer('influencer_count').default(0),
  reasoning: text('reasoning'),
  passedToSafety: boolean('passed_to_safety').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

Create core/db/src/schema/safety.ts:
import { pgTable, bigserial, varchar, text, decimal, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const safetyChecks = pgTable('safety_checks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contractAddress: varchar('contract_address', { length: 44 }).notNull().unique(),
  overallScore: decimal('overall_score', { precision: 5, scale: 2 }),
  mintAuthorityRevoked: boolean('mint_authority_revoked'),
  freezeAuthorityRevoked: boolean('freeze_authority_revoked'),
  topHolderPct: decimal('top_holder_pct', { precision: 6, scale: 4 }),
  top10HoldersPct: decimal('top10_holders_pct', { precision: 6, scale: 4 }),
  holderCount: integer('holder_count'),
  isHoneypot: boolean('is_honeypot').default(false),
  liquidityUsd: decimal('liquidity_usd', { precision: 18, scale: 2 }),
  tokenAgeMinutes: integer('token_age_minutes'),
  buySellRatio: decimal('buy_sell_ratio', { precision: 4, scale: 3 }),
  rugcheckScore: integer('rugcheck_score'),
  dnaMatchFound: boolean('dna_match_found').default(false),
  rejectionReason: text('rejection_reason'),
  passed: boolean('passed').default(false),
  checkedAt: timestamp('checked_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
});

export const tokenBlacklist = pgTable('token_blacklist', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  address: varchar('address', { length: 44 }).notNull().unique(),
  reason: text('reason'),
  addedBy: varchar('added_by', { length: 50 }).default('system'),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

export const tokenDna = pgTable('token_dna', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  creatorWallet: varchar('creator_wallet', { length: 44 }).notNull(),
  ruggedToken: varchar('rugged_token', { length: 44 }).notNull(),
  patterns: text('patterns').array().default([]),
  confidence: decimal('confidence', { precision: 4, scale: 3 }).default('1.0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

Create core/db/src/schema/trades.ts:
import { pgTable, bigserial, varchar, text, decimal, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const trades = pgTable('trades', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  contractAddress: varchar('contract_address', { length: 44 }).notNull(),
  tokenSymbol: varchar('token_symbol', { length: 20 }),
  tradeType: varchar('trade_type', { length: 30 }).notNull(),
  isPaperTrade: boolean('is_paper_trade').notNull().default(true),
  entryPrice: decimal('entry_price', { precision: 20, scale: 10 }),
  exitPrice: decimal('exit_price', { precision: 20, scale: 10 }),
  quantityTokens: decimal('quantity_tokens', { precision: 30, scale: 10 }),
  solAmount: decimal('sol_amount', { precision: 18, scale: 9 }),
  usdAmount: decimal('usd_amount', { precision: 18, scale: 2 }),
  pnlUsd: decimal('pnl_usd', { precision: 18, scale: 2 }),
  pnlPct: decimal('pnl_pct', { precision: 10, scale: 4 }),
  finalScore: decimal('final_score', { precision: 5, scale: 2 }),
  txSignature: varchar('tx_signature', { length: 100 }),
  gasFeeSOL: decimal('gas_fee_sol', { precision: 18, scale: 9 }),
  jitoTipSOL: decimal('jito_tip_sol', { precision: 18, scale: 9 }),
  sellReason: varchar('sell_reason', { length: 50 }),
  copyTradeWallet: varchar('copy_trade_wallet', { length: 44 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const positions = pgTable('positions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  contractAddress: varchar('contract_address', { length: 44 }).notNull(),
  tokenSymbol: varchar('token_symbol', { length: 20 }),
  entryPrice: decimal('entry_price', { precision: 20, scale: 10 }).notNull(),
  currentPrice: decimal('current_price', { precision: 20, scale: 10 }),
  highestPriceSeen: decimal('highest_price_seen', { precision: 20, scale: 10 }),
  quantityRemaining: decimal('quantity_remaining', { precision: 30, scale: 10 }).notNull(),
  usdInvested: decimal('usd_invested', { precision: 18, scale: 2 }).notNull(),
  currentUsdValue: decimal('current_usd_value', { precision: 18, scale: 2 }),
  unrealizedPnlPct: decimal('unrealized_pnl_pct', { precision: 10, scale: 4 }),
  tp1Executed: boolean('tp1_executed').default(false),
  tp2Executed: boolean('tp2_executed').default(false),
  tp3Executed: boolean('tp3_executed').default(false),
  trailingStopActive: boolean('trailing_stop_active').default(false),
  finalScore: decimal('final_score', { precision: 5, scale: 2 }),
  isPaperTrade: boolean('is_paper_trade').notNull().default(true),
  openedAt: timestamp('opened_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

Create core/db/src/schema/wallets.ts:
import { pgTable, bigserial, varchar, text, decimal, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const smartWallets = pgTable('smart_wallets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull().unique(),
  nickname: varchar('nickname', { length: 100 }),
  pattern: varchar('pattern', { length: 30 }).notNull().default('unknown'),
  winRate: decimal('win_rate', { precision: 4, scale: 3 }).default('0.5'),
  avgProfitX: decimal('avg_profit_x', { precision: 6, scale: 2 }).default('1.0'),
  avgLossPct: decimal('avg_loss_pct', { precision: 4, scale: 3 }).default('0.3'),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  isActive: boolean('is_active').default(true),
  lastTradeAt: timestamp('last_trade_at'),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

Create core/db/src/schema/stats.ts:
import { pgTable, bigserial, date, integer, decimal, boolean, timestamp, text, jsonb } from 'drizzle-orm/pg-core';

export const dailyStats = pgTable('daily_stats', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  date: date('date').notNull().unique(),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  losingTrades: integer('losing_trades').default(0),
  winRate: decimal('win_rate', { precision: 4, scale: 3 }).default('0'),
  totalPnlUsd: decimal('total_pnl_usd', { precision: 18, scale: 2 }).default('0'),
  capitalEod: decimal('capital_eod', { precision: 18, scale: 2 }),
  marketRegime: text('market_regime'),
  dailyLimitHit: boolean('daily_limit_hit').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const learningLog = pgTable('learning_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  parameter: varchar('parameter', { length: 100 }).notNull(),
  oldValue: text('old_value').notNull(),
  newValue: text('new_value').notNull(),
  reason: text('reason').notNull(),
  performanceData: jsonb('performance_data'),
  weekDate: date('week_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

Create core/db/src/index.ts:
export * from './schema/users';
export * from './schema/signals';
export * from './schema/safety';
export * from './schema/trades';
export * from './schema/wallets';
export * from './schema/stats';
export { drizzle } from 'drizzle-orm/node-postgres';
export { Pool } from 'pg';

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1D: DOCKER COMPOSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create docker-compose.yml:
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: mpg2-postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: mpg2-redis
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    container_name: mpg2-ollama
    # WHY OLLAMA IN DOCKER: Zero-cost local AI. No API keys. No rate limits.
    # Models stored in volume — survives container restarts.
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "11434:11434"
    environment:
      - OLLAMA_HOST=0.0.0.0
    restart: unless-stopped

  api-gateway:
    build: { context: ., dockerfile: services/api-gateway/Dockerfile }
    container_name: mpg2-api
    ports:
      - "${API_PORT:-3001}:3001"
    env_file: .env
    environment:
      SERVICE_NAME: api-gateway
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  market-data:
    build: { context: ., dockerfile: services/market-data/Dockerfile }
    container_name: mpg2-market-data
    env_file: .env
    environment:
      SERVICE_NAME: market-data
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  social-data:
    build: { context: ., dockerfile: services/social-data/Dockerfile }
    container_name: mpg2-social-data
    env_file: .env
    environment:
      SERVICE_NAME: social-data
    depends_on:
      redis: { condition: service_healthy }
    restart: unless-stopped

  ai-brain:
    build: { context: ., dockerfile: services/ai-brain/Dockerfile }
    container_name: mpg2-ai-brain
    env_file: .env
    environment:
      SERVICE_NAME: ai-brain
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      ollama: { condition: service_started }
    restart: unless-stopped

  security-engine:
    build: { context: ., dockerfile: services/security-engine/Dockerfile }
    container_name: mpg2-security
    env_file: .env
    environment:
      SERVICE_NAME: security-engine
    depends_on:
      redis: { condition: service_healthy }
    restart: unless-stopped

  risk-engine:
    build: { context: ., dockerfile: services/risk-engine/Dockerfile }
    container_name: mpg2-risk-engine
    env_file: .env
    environment:
      SERVICE_NAME: risk-engine
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  trade-engine:
    build: { context: ., dockerfile: services/trade-engine/Dockerfile }
    container_name: mpg2-trader
    env_file: .env
    environment:
      SERVICE_NAME: trade-engine
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      risk-engine: { condition: service_started }
    restart: unless-stopped

  notification-engine:
    build: { context: ., dockerfile: services/notification-engine/Dockerfile }
    container_name: mpg2-notifications
    env_file: .env
    environment:
      SERVICE_NAME: notification-engine
    depends_on:
      redis: { condition: service_healthy }
    restart: unless-stopped

  monetization:
    build: { context: ., dockerfile: services/monetization/Dockerfile }
    container_name: mpg2-monetization
    env_file: .env
    environment:
      SERVICE_NAME: monetization
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  ollama_data:

Create docker-compose.dev.yml:
version: '3.8'
services:
  postgres:
    ports:
      - "5432:5432"
  redis:
    ports:
      - "6379:6379"
  ollama:
    ports:
      - "11434:11434"
  api-gateway:
    volumes:
      - ./services/api-gateway/src:/app/src
    environment:
      LOG_LEVEL: debug
  ai-brain:
    volumes:
      - ./services/ai-brain/src:/app/src

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1E: SERVICE PACKAGE.JSON FILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each service has same structure. Create package.json for each:

services/api-gateway/package.json:
{
  "name": "@mpg2/api-gateway",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "SERVICE_NAME=api-gateway tsx watch src/server.ts",
    "build": "tsc --project tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mpg2/shared": "workspace:*",
    "@mpg2/db": "workspace:*",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/swagger": "^8.14.0",
    "@fastify/swagger-ui": "^4.0.0",
    "@fastify/websocket": "^10.0.1",
    "bullmq": "^5.12.0",
    "ioredis": "^5.4.0",
    "zod": "^3.23.4",
    "stripe": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0"
  }
}

Create same structure for all services, adding:
- @mpg2/shared: workspace:*
- @mpg2/db: workspace:*
- bullmq (for job queues)
- ioredis (for Redis)

services/market-data: add @solana/web3.js, @helius-labs/sdk
services/social-data: add twitter-api-v2, snoowrap, rss-parser, gramjs
services/ai-brain: add ollama (npm package for Ollama API calls)
services/security-engine: add @solana/web3.js
services/trade-engine: add @solana/web3.js, @jito-ts/sdk, @jup-ag/api
services/notification-engine: add grammy (Telegram bot framework)
services/monetization: add stripe

Run after creating all files:
pnpm install
```

---

# ═══════════════════════════════════════════════════════════════
# REDIS CHANNEL ARCHITECTURE — Service Communication Map
# ═══════════════════════════════════════════════════════════════

```
PUBLISH/SUBSCRIBE FLOW:
market-data       → publishes → 'market:token_data'
market-data       → publishes → 'market:whale_signal'     (copy trade signal)
social-data       → publishes → 'social:raw_signal'
ai-brain          → subscribes to 'market:token_data' + 'social:raw_signal' + 'market:whale_signal'
                  → publishes → 'ai:buy_signal'
security-engine   → subscribes to 'ai:buy_signal'
                  → publishes → 'security:verified_signal'
risk-engine       → subscribes to 'security:verified_signal'
                  → publishes → 'risk:approved_signal'
trade-engine      → subscribes to 'risk:approved_signal'
                  → publishes → 'trades:new' + 'trades:position_update'
notification-eng  → subscribes to 'trades:new' + 'trades:position_update' + 'risk:alert'
api-gateway       → subscribes to 'trades:new' + 'ai:buy_signal'
                  → forwards to WebSocket clients (dashboard)

REDIS CACHE KEYS:
'safety:{address}'           → safety check result (15 min TTL)
'price:{address}'            → token price (30s TTL)
'signal:dedup:{hash}'        → deduplication (24h TTL)
'daily_loss:{userId}:{date}' → daily loss per user (24h TTL)
'regime:current'             → market regime (1h TTL)
'paper_mode:{userId}'        → paper trading flag per user (no TTL)
'positions:count:{userId}'   → open position count (1min TTL)
'ollama:health'              → Ollama availability (5min TTL)
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 02 — API GATEWAY
# Depends on: PROMPT 01 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 02 of 16. Build the complete API Gateway.

Build services/api-gateway/src/server.ts — Fastify server:
- Register: cors → rate-limit → jwt → websocket → routes → swagger(dev only)
- Health endpoint: GET /health → { status: 'ok', services: {...} }
- All routes protected by JWT except /api/auth/* and /health

Build all route files (full TypeScript + Zod validation):

routes/auth.ts:
- POST /api/auth/register → create user (bcrypt password) → return JWT
- POST /api/auth/login → verify → return JWT
- POST /api/auth/refresh → new JWT
- GET /api/auth/me → current user from JWT

routes/tokens.ts:
- GET /api/tokens/search?q= → search by name/address
- GET /api/tokens/:address → full token + safety score
- GET /api/tokens/trending → top tokens by signal score
- POST /api/tokens/blacklist → add to blacklist

routes/signals.ts:
- GET /api/signals?limit=50&platform=twitter → recent signals
- GET /api/signals/stats → volume by platform today

routes/trades.ts:
- GET /api/trades?from=&to=&type=paper → trade history
- GET /api/trades/stats → win rate, P&L, profit factor

routes/portfolio.ts:
- GET /api/portfolio/positions → open positions with live P&L
- GET /api/portfolio/summary → capital, total P&L, daily P&L
- POST /api/portfolio/positions/:id/close → manual close

routes/settings.ts:
- GET /api/settings → current bot settings for user
- PUT /api/settings → update (Zod validates all values)
- POST /api/settings/paper-mode → toggle (requires "CONFIRM" body)

routes/subscription.ts:
- GET /api/subscription → current plan + usage
- POST /api/subscription/checkout → create Stripe checkout session
- POST /api/subscription/portal → Stripe customer portal
- POST /api/subscription/webhook → Stripe webhook handler

routes/realtime.ts:
- WS /ws/signals → stream new signals (Redis sub)
- WS /ws/positions → position updates every 30s
- WS /ws/alerts → risk alerts + trade notifications

middleware/subscription.ts:
- FeatureGate middleware: check if user's plan allows this route
- Inject feature flags into request context

All routes return: { data: T, error: null } | { data: null, error: string }
All protected routes: attach userId + planTier to request context
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 03 — MARKET DATA SERVICE
# Depends on: PROMPT 01 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 03 of 16. Build the Market Data service.

Build collectors — ALL use circuit breakers:

collectors/dexscreener.ts:
- Fetch trending Solana tokens: GET https://api.dexscreener.com/latest/dex/search?q=solana
- Fetch token by address: GET https://api.dexscreener.com/latest/dex/tokens/{address}
- Extract: price, volume24h, liquidityUsd, priceChange24h, txns24h
- Free. No API key. Rate limit: be polite (1 req/500ms max).

collectors/helius.ts:
- RPC calls: getTokenSupply, getTokenLargestAccounts (holder distribution)
- Geyser WebSocket: subscribe to smart wallet transactions
- Free tier: 100k credits/day

collectors/jupiter.ts:
- Price quote: GET https://quote-api.jup.ag/v6/quote?inputMint=...&outputMint=...&amount=...
- Used for: honeypot check (simulate sell) + actual trade execution
- Free. No API key.

collectors/rugcheck.ts:
- GET https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary
- Returns: score (0-1000), risks array, rugged boolean
- Free. No API key.

collectors/pump.ts:
- WebSocket: wss://pumpportal.fun/api/data
- Events: 'newToken', 'migration' (graduation to Raydium)
- Subscribe to: new token launches + Raydium graduations
- Free. No API key.

whale-tracker/PatternClassifier.ts:
Classify wallet patterns from transaction history:
- INSTITUTIONAL: large consistent positions, long hold times (>24h average)
- INSIDER: buys 1-3 blocks before major price moves (statistically significant)
- LUCKY_RETAIL: random entry/exit, inconsistent sizes
- Method: fetch last 100 transactions via Helius, analyze patterns

Build worker.ts using BullMQ:
- Queue: 'market-data' in Redis
- Job 'collect-prices': runs every 30 seconds
- Job 'collect-new-tokens': runs every 3 seconds (Pump.fun WS is realtime)
- Job 'scan-wallets': runs every 1 second
- On each token found: publish to Redis channel 'market:token_data'
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 04 — SOCIAL DATA SERVICE
# Depends on: PROMPT 01 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 04 of 16. Build the Social Data service.

Build scrapers:

scrapers/twitter.ts — twitter-api-v2 library:
- Search recent tweets containing Solana contract addresses
- Filter: min 100 followers, last 1 hour
- Use bearer token (free basic tier: 500k tweets/month)
- Extract: contract address (SOLANA.REGEX.ADDRESS), follower count, engagement

scrapers/reddit.ts — snoowrap library:
- Monitor: r/SolanaMemecoins, r/solana, r/CryptoMoonShots
- Filter: rising posts from last 2 hours
- Extract contract addresses from title + body

scrapers/telegram.ts — gramjs library (MTProto, free):
- Scrape public channels: configure list in data/telegram_channels.json
- gramjs uses Telegram API directly, no bot token needed for reading
- Extract contract addresses + engagement metrics (views, forwards)

scrapers/news.ts — rss-parser + CryptoPanic:
- RSS feeds: cointelegraph, decrypt, coindesk
- CryptoPanic free tier: GET https://cryptopanic.com/api/v1/posts/?auth_token={key}&currencies=SOL
- Weight news signals higher (news:1.4 vs twitter:1.2)

extractors/contract.ts:
- Apply SOLANA.REGEX.ADDRESS to extract addresses
- Filter out SOLANA.KNOWN_NOT_TOKENS (SOL, USDC, USDT)
- Validate format (32-44 base58 chars)

extractors/sentiment.ts:
- Fast keyword pre-filter BEFORE sending to Ollama (saves compute)
- Positive keywords: moon, gem, pump, bullish, aping, buying
- Negative keywords: rug, scam, dump, honeypot, avoid, warning
- Only send to Ollama if keyword score is ambiguous (±30%)

extractors/engagement.ts:
- Normalize engagement cross-platform to 0-100 scale
- Twitter: (likes * 1 + retweets * 3 + replies * 2) / follower_count
- Reddit: (upvotes * 1 + comments * 5) / subreddit_size_factor
- Telegram: (views / channel_subscribers)

Publish to Redis: 'social:raw_signal' with full RawSignal type
Deduplication: Redis key 'signal:dedup:{hash}' prevents same content twice
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 05 — AI BRAIN SERVICE
# Depends on: PROMPTS 01, 03, 04 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 05 of 16. Build the AI Brain — powered by Ollama (local, free).

WHY OLLAMA: Zero cost. Zero rate limits. llama3.2 is 3.8B params,
runs fast on CPU, excellent for sentiment and reasoning tasks.
One-time model download (~2GB). Then infinite usage forever.

Build ollama/OllamaClient.ts:
- HTTP client for local Ollama API at OLLAMA_URL
- POST /api/generate → text completion
- POST /api/embeddings → vector embedding
- Health check: GET /api/tags → verify models are available
- Circuit breaker: if Ollama is down, fall back to keyword scoring
- Retry: 3 attempts with 500ms backoff

Build ollama/SentimentModel.ts:
- Input: social media text about a token
- Prompt template (few-shot):
  Analyze the sentiment of this crypto post. Return JSON only.
  Text: "{content}"
  Respond: {"sentiment": 0-100, "authenticity": 0-1, "reasoning": "brief"}
  High authenticity = real person sharing genuine opinion.
  Low authenticity = bot, shill, or coordinated pump.
- Parse JSON response. If parse fails, use keyword fallback.

Build ollama/NarrativeModel.ts:
- Input: list of recent posts about a token + token name
- Detect: what narrative is driving this token?
- Score freshness: has this narrative been used before?
  "AI agent token" = OLD narrative (weight 0.5)
  "new unique story" = FRESH narrative (weight 1.5)
- Prompt returns: { narrative: string, freshness: 0-1, reasoning: string }

Build 5 agents:

agents/MarketAgent.ts — reads from Redis cache (market data):
- priceVelocity: price change % in last 1h vs last 24h
- volumeSpike: volume in last 1h vs average 1h volume (last 7 days)
- liquidityScore: liquidityUsd mapped to 0-100 (10k→20, 100k→80, 500k→100)
- buyPressure: buySellRatio mapped 0.5→0, 0.7→60, 0.9→100
- Output: MarketScore 0-100

agents/SocialAgent.ts — processes RawSignal batch:
- Call SentimentModel.ts (Ollama) for each raw signal
- Call NarrativeModel.ts for narrative freshness
- Weight by platform (news:1.4, twitter:1.2, telegram:1.1, reddit:1.0)
- Weight by influencer tier
- Cross-platform bonus: +10 per additional platform that mentions token
- Output: SocialScore 0-100

agents/ScamAgent.ts — reads security data:
- rugcheckScore: convert 0-1000 → inverted 0-100 (1000=bad → score 0)
- holderConcentration: top10HoldersPct > 60% → heavy penalty
- tokenAge: < 30min → high risk, < 6h → medium risk
- dnaMatch: found in token_dna → immediate BLOCK
- Output: ScamScore 0-100 (100 = safest)

agents/WhaleAgent.ts — reads whale_signal from Redis:
- INSTITUTIONAL pattern wallet buys → strong signal (+25 bonus)
- INSIDER pattern wallet buys → very strong signal (+35 bonus)
- LUCKY_RETAIL wallet buys → weak signal (no bonus)
- Multiple institutional wallets buying same token → max signal
- Output: WhaleScore 0-100

agents/DecisionAgent.ts — orchestrates all agents:
- Get current market regime from RegimeDetector
- Apply regime-adjusted weights:
  BULL:    market:0.25 social:0.30 scam:0.25 whale:0.20
  SIDEWAYS: market:0.20 social:0.25 scam:0.35 whale:0.20
  BEAR:    market:0.15 social:0.20 scam:0.45 whale:0.20
- finalScore = weighted sum of all agent scores
- If finalScore >= regimeMinScore → emit BuySignal to 'ai:buy_signal'
- Include full reasoning from each agent

learning/RegimeDetector.ts:
- SOL price action last 24h + 7d
- Overall memecoin market volume trend
- BTC dominance direction
- Output: EXTREME_BULL | BULL | SIDEWAYS | BEAR | EXTREME_BEAR
- Cache in Redis with 1h TTL: 'regime:current'

learning/SelfLearner.ts:
- Runs every Sunday at midnight (BullMQ cron)
- Fetch last 7 days trades from DB
- Calculate win rate per: platform, score range, time of day, regime
- If platform X win rate > 60%: increase platform weight by 0.1
- If platform X win rate < 40%: decrease platform weight by 0.1
- Log every change to learning_log table with reason
- Never move weight by more than 0.2 in one week (stability)

learning/Backtester.ts:
- Input: date range + strategy config
- Fetch raw_signals and safety_checks from DB for that period
- Replay through scoring engine with given weights
- Output: BacktestResult { totalTrades, winRate, totalPnlPct, maxDrawdown }
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 06 — SECURITY ENGINE
# Depends on: PROMPT 01 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 06 of 16. Build the Security Engine.

Subscribe to Redis channel: 'ai:buy_signal'
For each signal, run all checks in parallel (Promise.all).
Cache results in Redis: 'safety:{address}' with 15min TTL.
If cached result exists, use it (skip API calls).

checkers/RugChecker.ts:
- GET https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary
- Parse: score (0-1000, LOWER is more dangerous), risks array
- Convert to 0-100 scale (inverted: rugcheck 0 = our score 0, rugcheck 1000 = our score 100)
- Circuit breaker: if API down, return score 50 (neutral) with flag

checkers/HoneypotChecker.ts:
- Use Jupiter to simulate selling 100% of a token
- GET https://quote-api.jup.ag/v6/quote?inputMint={token}&outputMint=SOL&amount={amount}
- If priceImpact > 90% or quote fails → honeypot detected
- Free. No API key needed.

checkers/LiquidityChecker.ts:
- DexScreener: GET https://api.dexscreener.com/latest/dex/tokens/{address}
- Check: liquidityUsd >= MIN_LIQUIDITY_USD
- Check: liquidity lock (look for lock contract in pairs data)
- Check: liquidity removal events in last 24h

checkers/HolderChecker.ts:
- Helius RPC: getTokenLargestAccounts(mint)
- Calculate: topHolderPct, top10HoldersPct
- Flag: any single wallet holds > 20% (except known: team, LP)

checkers/MintChecker.ts:
- Solana RPC: getMint(address)
- Check: mintAuthority === null (authority revoked)
- Check: freezeAuthority === null (freeze revoked)
- Both must be null for a clean token

checkers/DnaChecker.ts:
- Fetch creator wallet from token metadata via Helius
- Query token_dna table for that creator wallet
- If match found with confidence > 0.8 → BLOCK immediately
- No API call needed — uses local DB

SecurityScorer.ts:
- Combine all scores with weights:
  rugcheck: 35%, honeypot: 25%, liquidity: 15%, holders: 15%, mint: 5%, dna: block
- If dna match → score 0, rejection_reason = 'Known rug creator'
- If is_honeypot → score 0
- If mintAuthority not revoked → -20 points
- Save result to safety_checks table
- Publish to 'security:verified_signal' if score >= 70
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 07 — RISK ENGINE
# Depends on: PROMPT 01 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 07 of 16. Build the Risk Engine.

Subscribe to Redis channel: 'security:verified_signal'
Run ALL guards before approving any trade.
Guards run sequentially — first failure stops processing.

guards/DailyLossGuard.ts:
- Read Redis key: 'daily_loss:{userId}:{date}'
- If value >= userSettings.capitalUsd * 0.10 → BLOCK with 'Daily loss limit reached'
- Log to Telegram via notification channel

guards/ExposureGuard.ts:
- Read Redis key: 'positions:count:{userId}'
- If count >= userSettings.maxPositions → BLOCK with 'Max positions reached'

guards/PositionSizeGuard.ts:
- Calculated size must not exceed 5% of current capital
- Current capital = userSettings.capitalUsd - sum of open positions invested

guards/SlippageGuard.ts:
- Fetch Jupiter quote for proposed position size
- If priceImpact > MAX_PRICE_IMPACT_PCT (5%) → BLOCK
- Too much slippage = we're buying too much relative to liquidity

guards/CooldownGuard.ts:
- Check last 5 trades for user in DB
- If last 3 are all STOP_LOSS → enable 1h cooldown
- Store cooldown expiry in Redis: 'cooldown:{userId}'

calculators/PositionSizer.ts:
- Input: finalScore, userId
- Get user's available capital
- Score 80-84 → 1% of capital
- Score 85-89 → 2% of capital
- Score 90-94 → 3.5% of capital
- Score 95+   → 5% of capital
- Return: positionSizeUsd

RiskController.ts:
- Run all guards in order
- If all pass: calculate position size, publish to 'risk:approved_signal'
- If any fails: log to DB, send alert to 'risk:alert' Redis channel
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 08 — TRADE ENGINE
# Depends on: PROMPTS 01, 07 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 08 of 16. Build the Trade Engine.

Subscribe to Redis channel: 'risk:approved_signal'
Check PAPER_TRADING flag per user (stored in Redis + DB).

executors/PaperExecutor.ts:
- Fetch current price from Redis cache ('price:{address}')
- Calculate quantity = positionSizeUsd / currentPrice
- Insert to trades table: isPaperTrade=true, tradeType='BUY'
- Insert to positions table
- Update Redis: increment 'positions:count:{userId}'
- Update Redis: set 'paper_mode:{userId}' = true
- Publish to 'trades:new' with full trade data

executors/LiveExecutor.ts:
- ONLY active if userSettings.paperTrading === false
- Jupiter swap: POST https://quote-api.jup.ag/v6/swap
- Jito bundle for priority inclusion
- Sign with SOLANA_WALLET_PRIVATE_KEY
- Monitor TX confirmation (30s timeout, retry once)
- Insert to trades table: isPaperTrade=false
- Publish to 'trades:new'

managers/PositionManager.ts (runs every 30 seconds via BullMQ):
For each open position:
1. Fetch current price from DexScreener
2. Calculate unrealizedPnlPct
3. Update position.currentPrice and position.currentUsdValue
4. Update highestPriceSeen if current > highest
5. Check exit conditions IN ORDER:
   - Is token on blacklist? → Emergency sell all
   - Is stop loss hit? (price < entryPrice * 0.70) → SELL_STOP_LOSS all
   - Is trailing stop hit? (price < highestPriceSeen * 0.80) AND trailing active → SELL_TRAILING
   - Is TP1 hit and not executed? (price >= entryPrice * 2.0) → SELL_TP1 30%, enable trailing
   - Is TP2 hit and not executed? (price >= entryPrice * 5.0) → SELL_TP2 30%
   - Is TP3 hit and not executed? (price >= entryPrice * 10.0) → SELL_TP3 30%
6. On any sell: update position, insert sell trade, publish 'trades:position_update'

managers/WalletTracker.ts:
- Only copy trades from INSTITUTIONAL and INSIDER pattern wallets
- Listen to 'market:whale_signal' Redis channel
- Validate: same token must pass security check first
- Emit BuySignal with source='copy_trade' if all checks pass
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 09 — NOTIFICATION ENGINE
# Depends on: PROMPT 01 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 09 of 16. Build the Notification Engine — MVP primary interface.

WHY GRAMMY for Telegram: Best TypeScript Telegram bot framework.
Zero dependencies beyond grammy. Excellent error handling.

telegram/TelegramBot.ts:
- Grammy bot instance
- Commands:
  /start → welcome message + quick setup guide
  /status → bot running? paper/live mode? regime? open positions count?
  /positions → table of all open positions with P&L
  /pnl → today's P&L summary
  /settings → show current risk settings
  /stop → EMERGENCY STOP (requires typing "CONFIRM STOP")
  /paper → switch to paper trading
  /live → switch to live trading (requires "CONFIRM LIVE")

telegram/alerts/TradeAlert.ts:
When 'trades:new' received:
  "🟢 BUY SIGNAL EXECUTED
  Token: {symbol} ({address:short})
  Size: ${usdAmount}
  Score: {finalScore}/100
  Source: {source}
  Mode: {'📄 PAPER' | '💰 LIVE'}"

telegram/alerts/TpSlAlert.ts:
TP hit:
  "🎯 Take Profit {1/2/3} Hit!
  Token: {symbol}
  Sold 30% at {price} (+{pct}%)
  Remaining: {remaining} tokens"

Stop Loss:
  "🛑 Stop Loss Hit
  Token: {symbol}
  Sold all at {price} ({pct}%)
  Loss: -${amount}"

telegram/alerts/RiskAlert.ts:
Daily limit:
  "⚠️ Daily Loss Limit Reached
  Lost ${amount} today (10% limit)
  Trading PAUSED until tomorrow"

reports/DailyReport.ts (BullMQ cron: 0 8 * * *):
  "📊 Daily Report — {date}
  Trades: {count} | Win Rate: {pct}%
  P&L: ${amount} ({pct}%)
  Capital: ${amount}
  Best: {token} +{pct}%
  Worst: {token} -{pct}%
  Regime: {regime}"

Subscribe to Redis channels:
- 'trades:new' → trade alerts
- 'trades:position_update' → TP/SL alerts
- 'risk:alert' → risk alerts
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 10 — MONETIZATION SERVICE
# Depends on: PROMPT 01, 02 complete
# ═══════════════════════════════════════════════════════════════

```
PROMPT 10 of 16. Build the Monetization service.

WHY STRIPE: No upfront cost. Webhooks handle all lifecycle events.
2.9%+$0.30 per transaction only. Best developer experience.

stripe/plans.ts:
Define all plans with feature gates:
- FREE:    $0/mo — paper trading, 10-min delayed signals, 3 positions max
- STARTER: $49/mo — live trading, real-time signals, 5 positions, copy trading
- PRO:     $149/mo — API access (1k req/day), 10 positions, backtest 90d
- WHALE:   $499/mo — unlimited positions, unlimited API, white-label ready

stripe/StripeClient.ts:
- createCustomer(email) → Stripe customer
- createCheckoutSession(userId, priceId) → checkout URL
- createPortalSession(customerId) → billing portal URL
- retrieveSubscription(subscriptionId) → current status

stripe/webhooks.ts — handle Stripe events:
- customer.subscription.created → update user planTier in DB
- customer.subscription.updated → update planTier
- customer.subscription.deleted → downgrade to free
- invoice.payment_failed → send Telegram alert to user

api-keys/ApiKeyManager.ts:
- generateKey() → random 32-byte key (prefix: mpg2_live_ or mpg2_test_)
- Store: hash in DB, return plaintext only once
- validateKey(key) → find by hash, check plan allows API access
- revokeKey(keyId, userId)

api-keys/UsageTracker.ts:
- Increment Redis counter: 'api_usage:{userId}:{date}'
- Check against plan limit before each API request
- Reset counter daily via BullMQ cron

FeatureGate.ts:
- checkFeature(userId, feature) → boolean
- Features: liveTrading, apiAccess, copyTrading, advancedCharts
- Read planTier from Redis cache ('plan:{userId}') or DB
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPT 11 — REACT DASHBOARD (Phase 2)
# Depends on: PROMPTS 01-10 complete and tested
# ═══════════════════════════════════════════════════════════════

```
PROMPT 11 of 16. Build the React Dashboard.

Tech: React 18 + Vite + TypeScript + Tailwind + Zustand + TanStack Query v5 + Recharts

WHY TANSTACK QUERY: Handles caching, refetch, loading/error states automatically.
Without it: 200 lines of useEffect per page. With it: 10 lines.

WHY ZUSTAND: 4KB, no provider needed, selective re-renders. Used in production
by Midjourney, Mantine. Redux is overkill for a dashboard.

Build apps/dashboard/src/App.tsx:
- React Router v6 with all routes
- Global Shell layout (Sidebar + Topbar)
- TanStack Query provider
- WebSocket provider (connection to /ws/*)

Build Shell.tsx:
Left sidebar (240px):
- Money Printer G2 logo
- Navigation: Overview, Signals, Tokens, Portfolio, Wallets, Backtest, Leaderboard, Subscription, Settings
- PAPER / LIVE mode badge (always visible, prominent)
- Market regime badge (BULL/BEAR/SIDEWAYS)

Top bar:
- Capital display: $1,234.56
- Today P&L: +$45.23 (+3.8%) green or red
- EMERGENCY STOP button (red, always visible, requires "CONFIRM" text)
- User menu

Build all pages:
Overview.tsx: 4 stat cards + equity curve (AreaChart) + live signal feed + recent trades
Signals.tsx: Real-time feed via WebSocket + platform filter + score filter
Tokens.tsx: Search + token card with safety breakdown
Portfolio.tsx: Open positions table + trade history with filters + P&L charts
Wallets.tsx: Smart wallet list + pattern classification + performance stats
Backtest.tsx: Date range picker + strategy config → run → results chart
Leaderboard.tsx: Public performance page (shareable link: /leaderboard/{publicSlug})
Subscription.tsx: Current plan + usage meters + upgrade buttons (Stripe checkout)
Settings.tsx: All bot settings with sliders + paper trading toggle (requires CONFIRM)

Build stores/botStore.ts (Zustand):
Store: paperTrading, marketRegime, dailyLossHit, openPositionCount, currentCapital

Build api/client.ts:
Typed fetch wrapper. All calls return typed results.
Handles: 401 (redirect to login), 403 (plan upgrade prompt), network errors.
```

---

# ═══════════════════════════════════════════════════════════════
# PROMPTS 12-16 SUMMARY
# ═══════════════════════════════════════════════════════════════

PROMPT 12 — MULTI-TENANT HARDENING
Add userId filtering to every DB query (no user sees another user's data).
Add row-level security policies in PostgreSQL.
Add per-user Telegram bot setup flow.
Performance public page: /leaderboard/{publicSlug} shows paper trading stats only.

PROMPT 13 — LIVE TRADING ENABLEMENT
Complete LiveExecutor.ts with Jupiter + Jito.
Add pre-trade checks: wallet balance, SOL for fees, slippage simulation.
Add post-trade monitoring: TX confirmation, failed TX handling.
Add live trading toggle with safety checks and Telegram confirmation.

PROMPT 14 — WHALE TRACKER ADVANCED
Pattern evolution: track if a wallet's pattern changes over time.
Multi-wallet correlation: 3+ institutional wallets same token = max signal boost.
Copy wallet discovery: script to find new profitable wallets on-chain.

PROMPT 15 — MONITORING + OBSERVABILITY
Add /metrics endpoint to each service (Prometheus format).
Metrics: http_requests_total, signals_processed_total, trades_executed_total,
         ai_score_histogram, safety_pass_rate, ollama_latency, positions_open.
Add structured error tracking via pino (no paid service needed).
Add Grafana dashboards (OSS) for: system overview, trading performance, signal pipeline.
Add Uptime monitoring via BullMQ health checks.

PROMPT 16 — TESTING + PRE-LAUNCH
Unit tests (Vitest): ScoreCalculator, all guards, DnaChecker, PositionSizer.
Integration tests: API routes with real DB (test database).
E2E test: Full pipeline — raw signal → paper trade executed.
scripts/pre_launch_check.ts:
  Check: all env vars set, Ollama running + models loaded, PostgreSQL writeable,
         Redis reachable, Helius API responding, PAPER_TRADING=true,
         Telegram bot connected, all services healthy via /health endpoint.
Write complete docs/setup.md with step-by-step setup guide.

---

# ═══════════════════════════════════════════════════════════════
# EXECUTION ORDER — MANDATORY
# ═══════════════════════════════════════════════════════════════

01 → Monorepo foundation (start here — everything depends on this)
02 → API Gateway
03 → Market Data (can run parallel with 02)
04 → Social Data (can run parallel with 02, 03)
05 → AI Brain (needs 03 + 04 complete)
06 → Security Engine (can run parallel with 05)
07 → Risk Engine (can run parallel with 05, 06)
08 → Trade Engine (needs 06 + 07 complete)
09 → Notification Engine (can run parallel with 08)
10 → Monetization (can run parallel with 08)
── MVP COMPLETE: Paper trading bot works + Telegram alerts ──
11 → React Dashboard
12 → Multi-tenant hardening
13 → Live trading
14 → Whale tracker advanced
15 → Monitoring
16 → Testing + Pre-launch

DO NOT skip prompts.
DO NOT move to next prompt until current one is working and tested.

---

# ═══════════════════════════════════════════════════════════════
# MONETIZATION TARGETS
# ═══════════════════════════════════════════════════════════════

FREE ($0):   Paper trading, delayed signals → Lead magnet, prove the system works
STARTER ($49): Real-time + live trading + copy trading → Main revenue driver
PRO ($149):  API access + advanced backtest → Power users
WHALE ($499): Unlimited everything → High-value users

Month 6:  50 Starter + 15 Pro + 3 Whale = $2,450 + $2,235 + $1,497 = $6,182/mo
Month 12: 200 Starter + 60 Pro + 10 Whale = $9,800 + $8,940 + $4,990 = $23,730/mo
Month 18: 800 Starter + 200 Pro + 30 Whale = $39,200 + $29,800 + $14,970 = $83,970/mo
Month 24: 2000+ users → $150k-200k/mo → $2M ARR

The leaderboard page (public performance) is the primary growth engine.
Users share their performance → organic viral growth → zero marketing cost.

---

---

# ═══════════════════════════════════════════════════════════════
# MACHINE 2 — SANDBOX / SIMULATION ENGINE
# Zero API keys. Zero wallet. Real market prices. Fake money.
# ═══════════════════════════════════════════════════════════════

## WHAT IS THE SANDBOX
Machine 2 is a completely isolated simulation environment.
It uses REAL Solana market prices to simulate REALISTIC trades.
The user puts in virtual money ($100, $500, etc.) and the system
buys/sells tokens automatically using the same AI logic as Machine 1.
After X hours, the user sees exactly how much they would have made or lost.

WHY THIS IS THE MOST IMPORTANT FEATURE:
- Zero barrier to entry. No API keys. No wallet. No setup.
- Proves the system works with REAL numbers
- Users share results → viral growth → converts to paying customers
- "I made +340% in 2 hours simulation" → user upgrades to $149/mo Pro plan

## MACHINE 2 vs MACHINE 1 COMPARISON

| Feature                  | Machine 1 (Normal)         | Machine 2 (Sandbox)        |
|--------------------------|----------------------------|----------------------------|
| Real money               | YES (live trading)         | NO (virtual only)          |
| Solana wallet            | REQUIRED for live          | NOT NEEDED                 |
| Helius API key           | REQUIRED                   | NOT NEEDED                 |
| Twitter/Reddit API       | REQUIRED for social data   | NOT NEEDED                 |
| Ollama AI                | REQUIRED for full AI       | NOT NEEDED (uses QuickScore)|
| Stripe subscription      | REQUIRED for live          | NOT NEEDED                 |
| Market prices            | Real (DexScreener)         | Real (DexScreener)         |
| Signal detection         | Full 6-agent AI system     | Keyword + RugCheck only    |
| Safety checks            | Full 5-checker system      | RugCheck only (free)       |
| Position management      | Full TP/SL system          | SAME exact logic           |
| P&L calculation          | Real money                 | Virtual money at real price|
| Setup time               | 2-3 hours                  | 30 SECONDS                 |
| Required env vars        | 15+                        | 3 (DB, Redis, Telegram opt)|

## SANDBOX FOLDER STRUCTURE

```
services/sandbox/
├── src/
│   ├── core/
│   │   ├── SandboxEngine.ts      # Main orchestrator — runs the whole simulation
│   │   ├── SandboxSession.ts     # One simulation run (balance + duration + results)
│   │   └── SandboxWallet.ts      # Virtual balance: tracks virtual USD holdings
│   ├── detectors/
│   │   ├── PumpFunDetector.ts    # WebSocket: new Pump.fun launches (FREE, no key)
│   │   ├── TrendingDetector.ts   # DexScreener trending Solana tokens (FREE, no key)
│   │   └── GraduationDetector.ts # Pump.fun → Raydium graduation events
│   ├── scoring/
│   │   ├── QuickScorer.ts        # Fast keyword scoring — no Ollama needed
│   │   └── SandboxSafetyChecker.ts # RugCheck API only (FREE, no key)
│   ├── execution/
│   │   ├── FakeExecutor.ts       # Records fake buys/sells at REAL current prices
│   │   └── SandboxPositionManager.ts # SAME TP/SL logic as Machine 1
│   ├── reporting/
│   │   ├── PortfolioTracker.ts   # Live virtual portfolio value
│   │   └── ReportGenerator.ts   # Full P&L breakdown on demand
│   └── telegram/
│       └── SandboxBot.ts         # Telegram bot — primary interface
├── tsconfig.json
└── package.json
```

## SANDBOX PROMPT — BUILD GUIDE

```
PROMPT S1 — SANDBOX ENGINE (Machine 2)
Depends on: PROMPT 01 complete (shared types + DB)
This is a STANDALONE service. Does not depend on any other service.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT SANDBOX NEEDS (FREE ONLY, NO KEYS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

APIs used (all FREE, no API key required):
1. DexScreener: https://api.dexscreener.com — trending tokens + prices
2. RugCheck: https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary — safety
3. Jupiter: https://quote-api.jup.ag/v6/quote — price verification + honeypot check
4. Pump.fun WebSocket: wss://pumpportal.fun/api/data — new token launches

No Twitter. No Reddit. No Telegram scraping. No Helius. No Ollama.
No Stripe. No wallet. ZERO paid services or API keys needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: core/SandboxSession.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SandboxConfig {
  sessionId: string;
  telegramChatId: string;
  startingBalanceUsd: number;     // e.g. 100
  durationMs: number;             // e.g. 7_200_000 (2 hours)
  maxPositions: number;           // e.g. 5
  minScoreToBuy: number;          // e.g. 65 (lower than real — sandbox explores more)
  stopLossPct: number;            // e.g. 0.30
  tp1: number; tp2: number; tp3: number; // 2x, 5x, 10x
  startedAt: Date;
  endsAt: Date;
}

export interface SandboxState {
  config: SandboxConfig;
  virtualBalanceUsd: number;      // Current available cash
  openPositions: SandboxPosition[];
  closedTrades: SandboxTrade[];
  totalTradesCount: number;
  winningTradesCount: number;
  isRunning: boolean;
}

export interface SandboxPosition {
  tokenAddress: string;
  tokenSymbol?: string;
  entryPrice: number;             // Real price at "buy" time
  currentPrice: number;           // Updated every 30s from DexScreener
  highestPriceSeen: number;
  virtualAmountUsd: number;       // How much virtual USD invested
  quantityTokens: number;
  unrealizedPnlPct: number;
  unrealizedPnlUsd: number;
  tp1Done: boolean;
  tp2Done: boolean;
  tp3Done: boolean;
  trailingActive: boolean;
  score: number;                  // Score that triggered buy
  openedAt: Date;
}

export interface SandboxTrade {
  tokenAddress: string;
  tokenSymbol?: string;
  tradeType: 'BUY' | 'SELL_TP1' | 'SELL_TP2' | 'SELL_TP3' | 'SELL_SL' | 'SELL_TRAILING';
  entryPrice: number;
  exitPrice?: number;
  amountUsd: number;
  pnlUsd?: number;
  pnlPct?: number;
  score: number;
  executedAt: Date;
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: detectors/PumpFunDetector.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Connect to Pump.fun WebSocket: wss://pumpportal.fun/api/data
Subscribe to: { method: "subscribeNewToken" }
Subscribe to: { method: "subscribeMigration" } (graduations)

On newToken event → emit candidate token
On migration event → emit graduation candidate (higher priority)

No API key. Free. Real-time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: detectors/TrendingDetector.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every 60 seconds:
GET https://api.dexscreener.com/latest/dex/search?q=solana

Filter results:
- volume24h > 10000
- liquidity > 5000
- priceChange1h > 5% (momentum)
- NOT already in open positions
- NOT in blacklist

Emit each filtered token as candidate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: scoring/QuickScorer.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHY QUICKSCORER (not Ollama):
Sandbox needs zero dependencies. QuickScorer is a rules-based system
that produces 70-80% accuracy vs Ollama. Fast. Zero compute. Deterministic.

Input: token data from DexScreener + RugCheck result

Score formula (0-100):
  liquidityScore    = map(liquidityUsd, 5000, 200000, 0, 25)    // 25 points max
  volumeScore       = map(volume24h,    1000,  500000, 0, 20)    // 20 points max
  priceVelocity     = map(priceChange1h,  5%,     50%, 0, 20)    // 20 points max
  safetyScore       = map(rugcheckScore, 0, 1000, 0, 20)         // 20 points max
  holderScore       = map(holderCount, 50, 1000, 0, 10)          // 10 points max
  ageBonus          = tokenAgeMinutes in [60, 720] ? +5 : 0      //  5 points bonus

  HARD BLOCKS (score → 0 immediately):
  - rugcheckScore < 300 (very risky)
  - isHoneypot === true
  - top10HoldersPct > 70%
  - mintAuthority not revoked
  - tokenAgeMinutes < 30 (too new, likely rug setup)

  finalScore = sum of all components (capped at 100)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: scoring/SandboxSafetyChecker.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each candidate token:
1. GET https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary
   - Extract: score, risks, top10HoldersPct, mintAuthorityRevoked
2. GET https://quote-api.jup.ag/v6/quote?inputMint={token}&outputMint=WSOL&amount=1000000
   - Check: priceImpact < 80% (honeypot check)
3. GET https://api.dexscreener.com/latest/dex/tokens/{mint}
   - Extract: liquidity, volume, holders, age

Cache each result in Redis: 'sandbox:safety:{address}' TTL 15 min
No Helius. No holder analysis. RugCheck alone is enough for sandbox.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: execution/FakeExecutor.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

On approved signal (score >= config.minScoreToBuy):

1. Fetch REAL current price from DexScreener (this makes it realistic)
2. Calculate position size:
   - Available cash = state.virtualBalanceUsd
   - Per position: min(available * 0.20, available / (maxPositions - openPositions.length))
   - If available < $1 → skip (not enough virtual funds)
3. Create SandboxPosition at REAL current price
4. Deduct from virtualBalanceUsd
5. Save to state
6. Send Telegram alert:
   "🤖 SANDBOX BUY
   Token: {symbol}
   Virtual spent: ${amount}
   Price: ${price}
   Score: {score}/100
   Balance remaining: ${balance}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: execution/SandboxPositionManager.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Runs every 30 seconds via setInterval (no BullMQ needed in sandbox).

For each open position:
1. Fetch current price: GET https://api.dexscreener.com/latest/dex/tokens/{address}
2. Update unrealizedPnlPct = (currentPrice - entryPrice) / entryPrice
3. Update highestPriceSeen
4. Check exits (SAME logic as Machine 1):
   - Stop Loss:      currentPrice < entryPrice * (1 - stopLossPct) → SELL ALL
   - Trailing Stop:  trailingActive AND currentPrice < highestPriceSeen * 0.80 → SELL ALL
   - TP1:            currentPrice >= entryPrice * 2.0 AND !tp1Done → SELL 30%, activate trailing
   - TP2:            currentPrice >= entryPrice * 5.0 AND !tp2Done → SELL 30%
   - TP3:            currentPrice >= entryPrice * 10.0 AND !tp3Done → SELL 30%

On any sell:
- Add realizedPnlUsd back to virtualBalanceUsd
- Remove position or update quantity
- Create SandboxTrade record
- Send Telegram alert with result

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: reporting/ReportGenerator.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

generateLiveReport(state: SandboxState): string
  Returns Telegram message:
  "📊 SANDBOX REPORT
  ━━━━━━━━━━━━━━━━━
  Started with:  $100.00
  Current value: $143.21  (+43.2%)
  Available cash: $67.50
  Open positions: 2

  📈 OPEN POSITIONS:
  • BONK: +127% ($25 → $56.75) 🟢
  • MYRO: -8%   ($25 → $23.00) 🔴

  📋 CLOSED TRADES: 3
  ✅ WIF:  +340%  (+$85)
  ✅ POPCAT: +82% (+$20)
  ❌ BOME:  -30%  (-$7.50)

  Win Rate: 66.7%
  Remaining time: 1h 23m"

generateFinalReport(state: SandboxState): string
  Same format but with:
  - Final portfolio value
  - Full trade list
  - If results are profitable → show upgrade CTA:
    "🚀 Ready to do this with REAL money?
    Upgrade to Starter plan: $49/month
    Start making real profits today"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: telegram/SandboxBot.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Grammy.js bot. Commands:

/start
  → Welcome + quick explanation
  → Show preset options:
    [💵 $50 · 2h] [💵 $100 · 2h] [💵 $100 · 24h] [💵 $500 · 24h]
  → Or type: /sim 100 2h

/sim {amount} {duration}
  Examples: /sim 100 2h | /sim 500 24h | /sim 1000 1d
  → Creates new SandboxSession
  → Starts SandboxEngine
  → Sends confirmation:
    "✅ Simulation started!
    Virtual capital: $100
    Duration: 2 hours (ends at 20:30)
    Min score to buy: 65
    Max positions: 5
    I'll alert you on every trade. Type /status to check anytime."

/status
  → Calls generateLiveReport() → sends current state

/positions
  → Lists all open positions with current P&L

/trades
  → Lists last 10 closed trades

/stop
  → Stops current simulation
  → Generates final report

/compare
  → Shows: "With $100, simulation made +$43.21 (+43.2%)
    On Machine 1 (real trading) this would be REAL profit."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD: core/SandboxEngine.ts (main orchestrator)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async start(config: SandboxConfig):
  1. Initialize SandboxState
  2. Start PumpFunDetector WebSocket
  3. Start TrendingDetector interval (60s)
  4. Start PositionManager interval (30s)
  5. Start session timer → when endsAt reached → generateFinalReport + stop all
  6. Save state to Redis: 'sandbox:session:{chatId}'
  7. Persist trades to DB (sandbox_trades table) for history

On each candidate token:
  1. SandboxSafetyChecker.check(address)
  2. QuickScorer.score(tokenData, safetyResult)
  3. If score >= config.minScoreToBuy AND positions < config.maxPositions:
     → FakeExecutor.buy(token, score, state)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SANDBOX DATABASE TABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to core/db/src/schema/sandbox.ts:

export const sandboxSessions = pgTable('sandbox_sessions', {
  id: text('id').primaryKey(),
  telegramChatId: text('telegram_chat_id').notNull(),
  startingBalance: decimal('starting_balance', { precision: 18, scale: 2 }),
  finalBalance: decimal('final_balance', { precision: 18, scale: 2 }),
  totalPnlUsd: decimal('total_pnl_usd', { precision: 18, scale: 2 }),
  totalPnlPct: decimal('total_pnl_pct', { precision: 10, scale: 4 }),
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  durationMs: integer('duration_ms'),
  config: jsonb('config'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  isComplete: boolean('is_complete').default(false),
});

export const sandboxTrades = pgTable('sandbox_trades', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sessionId: text('session_id').notNull().references(() => sandboxSessions.id),
  tokenAddress: varchar('token_address', { length: 44 }).notNull(),
  tokenSymbol: varchar('token_symbol', { length: 20 }),
  tradeType: varchar('trade_type', { length: 30 }).notNull(),
  entryPrice: decimal('entry_price', { precision: 20, scale: 10 }),
  exitPrice: decimal('exit_price', { precision: 20, scale: 10 }),
  amountUsd: decimal('amount_usd', { precision: 18, scale: 2 }),
  pnlUsd: decimal('pnl_usd', { precision: 18, scale: 2 }),
  pnlPct: decimal('pnl_pct', { precision: 10, scale: 4 }),
  score: decimal('score', { precision: 5, scale: 2 }),
  executedAt: timestamp('executed_at').notNull().defaultNow(),
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SANDBOX PACKAGE.JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "name": "@mpg2/sandbox",
  "dependencies": {
    "@mpg2/shared": "workspace:*",
    "@mpg2/db": "workspace:*",
    "ioredis": "^5.4.0",
    "grammy": "^1.42.0",
    "ws": "^8.18.0",
    "@types/ws": "^8.5.12",
    "pino": "^9.3.0",
    "zod": "^3.23.4"
  }
}
```

## SANDBOX ENVIRONMENT (.env.sandbox)

```
# MACHINE 2 — SANDBOX CONFIG
# MINIMUM REQUIRED: Only these 4 vars. NOTHING ELSE.

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mpg2
POSTGRES_USER=mpg2_user
POSTGRES_PASSWORD=changeme

REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=changeme

# Optional: Telegram bot for alerts (highly recommended)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Sandbox-specific settings
SANDBOX_MIN_SCORE=65
SANDBOX_MAX_POSITIONS=5
NODE_ENV=development
LOG_LEVEL=info

# Everything else = NOT NEEDED in sandbox mode
# No Helius API key
# No Twitter/Reddit APIs
# No Ollama
# No Stripe
# No Solana wallet
```

## DOCKER COMPOSE FOR SANDBOX (docker-compose.sandbox.yml)

```yaml
version: '3.8'
# Machine 2: Sandbox-only stack
# Start with: docker-compose -f docker-compose.yml -f docker-compose.sandbox.yml up -d sandbox
services:
  sandbox:
    build:
      context: .
      dockerfile: services/sandbox/Dockerfile
    container_name: mpg2-sandbox
    env_file: .env.sandbox
    environment:
      SERVICE_NAME: sandbox
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped
```

## HOW TO START MACHINE 2 (30 seconds setup)

```bash
# Step 1: Copy sandbox env (no editing required to test)
cp .env.example .env.sandbox

# Step 2: Start only what sandbox needs
docker-compose up -d postgres redis

# Step 3: Start sandbox service
pnpm --filter @mpg2/sandbox dev

# Step 4: Open Telegram, message your bot
# Type: /sim 100 2h
# The bot responds with confirmation
# Walk away. Come back in 2 hours.
# Type: /status to check anytime
```

## SANDBOX vs PAPER TRADING (KEY DIFFERENCE)

Paper Trading (Machine 1):
- Part of the full platform
- Requires all API keys (Helius, Twitter, etc.)
- Uses real 6-agent AI with Ollama
- Same flow as live trading but no real transactions
- For POWER USERS who want to test before going live

Sandbox (Machine 2):
- Completely standalone
- Zero API keys required
- Works in 30 seconds
- For FIRST-TIME USERS who want to see the concept work
- Sales/marketing tool: converts users to paid plans
- Can run multiple simultaneous sessions (multiple users testing)

---

# ═══════════════════════════════════════════════════════════════
# UPDATED EXECUTION ORDER (with Sandbox)
# ═══════════════════════════════════════════════════════════════

MACHINE 2 (Sandbox) — Can build FIRST, independently:
S1 → Sandbox Engine (zero dependencies, 30-second setup)
     Build this before Machine 1 to validate the concept fast.

MACHINE 1 (Normal) — Full platform:
01 → Monorepo foundation
02 → API Gateway
10s05 → AI Brain
06 → Security Engine
07 → Risk Engine
08 → Trade Engine
09 → Notification Engine
10 → Monetization
── MVP COMPLETE ──
11 → React Dashboard
12 → Multi-tenant hardening
13 → Live trading
14 → Whale tracker advanced
15 → Monitoring
16 → Testing + Pre-launch

RECOMMENDED ORDER: Build S1 first → show it to users → get feedback → build 01-16.

---

*MONEY PRINTER G2 MASTER PROMPT V3.1*
*16 Prompts (Machine 1) + 1 Prompt (Machine 2 Sandbox)*
*Open Source Only — Ollama AI — Drizzle ORM — Stripe — Multi-tenant*
