# Multi-stage Dockerfile for all Money Printer G2 services.
# Build arg SERVICE selects which package to build.
#
# Example:
#   docker build --build-arg SERVICE=market-data -t mpg2-market-data .
#   docker build --build-arg SERVICE=api-gateway  -t mpg2-api-gateway .

ARG NODE_VERSION=22
ARG SERVICE=api-gateway

# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Stage 2: deps — install all workspace deps ────────────────────────────────
FROM base AS deps
# Tell Playwright not to download its own Chromium — we use system Chromium in prod
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/shared/package.json   core/shared/
COPY core/db/package.json       core/db/
COPY services/api-gateway/package.json       services/api-gateway/
COPY services/market-data/package.json       services/market-data/
COPY services/social-data/package.json       services/social-data/
COPY services/ai-brain/package.json          services/ai-brain/
COPY services/security-engine/package.json   services/security-engine/
COPY services/risk-engine/package.json       services/risk-engine/
COPY services/trade-engine/package.json      services/trade-engine/
COPY services/notification-engine/package.json services/notification-engine/
COPY services/monetization/package.json      services/monetization/
COPY services/sandbox/package.json           services/sandbox/
COPY apps/dashboard/package.json             apps/dashboard/
# pnpm v11: --ignore-scripts prevents native build errors; onlyBuiltDependencies in package.json suppresses ERR_PNPM_IGNORED_BUILDS
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── Stage 3: build — compile the full monorepo ────────────────────────────────
FROM deps AS builder
ARG SERVICE
COPY . .
# Use tsc binary directly (bypasses pnpm workspace validation that fails in subdirs)
RUN /app/node_modules/.bin/tsc --project core/shared/tsconfig.json
RUN /app/node_modules/.bin/tsc --project core/db/tsconfig.json
RUN /app/node_modules/.bin/tsc --project services/${SERVICE}/tsconfig.json

# ── Stage 4: prod — minimal runtime image ────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS prod
ARG SERVICE
ENV NODE_ENV=production
ENV CI=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Install Chromium system packages only for social-data (Playwright TikTok scraper)
RUN if [ "$SERVICE" = "social-data" ]; then \
      apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
    fi
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace manifests for runtime resolution
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/shared/package.json  core/shared/
COPY core/db/package.json      core/db/

# Copy service package.json
COPY services/${SERVICE}/package.json services/${SERVICE}/

# Install production deps only (native addons use JS fallbacks — no build tools needed)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/core/shared/dist      core/shared/dist
COPY --from=builder /app/core/db/dist          core/db/dist
COPY --from=builder /app/services/${SERVICE}/dist services/${SERVICE}/dist

# Copy optional JSON config files (wallets.json for social-data copy-trade watcher)
# The [n] glob trick makes this a no-op if the file doesn't exist for other services
COPY services/${SERVICE}/wallets.jso[n] services/${SERVICE}/

WORKDIR /app/services/${SERVICE}

# Determine entry point: api-gateway has server.js, others have worker.js
CMD ["node", "dist/worker.js"]
