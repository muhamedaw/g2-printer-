import { createLogger, DEFAULT_RISK } from '@mpg2/shared';
import type { Position, Trade } from '@mpg2/shared';
import type Redis from 'ioredis';
import { PaperExecutor } from './PaperExecutor.js';

const log = createLogger('position-manager');

export class PositionManager {
  private readonly paper: PaperExecutor;

  constructor(
    private readonly redis: Redis,
    private readonly onTrade: (trade: Trade) => Promise<void> = async () => {},
    private readonly onPositionClose: (userId: string, mint: string) => Promise<void> = async () => {},
    private readonly onPositionUpdate: (position: Position) => Promise<void> = async () => {},
  ) {
    this.paper = new PaperExecutor(redis);
  }

  async checkAllPositions(userId: string): Promise<Trade[]> {
    const mints = await this.redis.smembers(`positions:${userId}`);

    // Parallel checks: run all positions simultaneously so a slow price fetch on one
    // doesn't delay SL detection on another (sequential checks caused rug blindspot)
    const results = await Promise.allSettled(
      mints.map(mint => this.checkPosition(userId, mint)),
    );

    const trades: Trade[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) trades.push(r.value);
      if (r.status === 'rejected') log.warn({ err: r.reason }, 'Position check failed');
    }
    return trades;
  }

  private async fetchPriceFallback(mint: string): Promise<number | null> {
    // Try Jupiter first (fast, covers graduated tokens)
    try {
      const res = await fetch(
        `https://price.jup.ag/v6/price?ids=${mint}`,
        { signal: AbortSignal.timeout(4_000) },
      );
      if (res.ok) {
        const data = await res.json() as { data?: Record<string, { price: number }> };
        const price = data.data?.[mint]?.price ?? null;
        if (price && price > 0) {
          // Short TTL: stale prices caused SL to miss rugs for up to 5 minutes
          await this.redis.set(`token:${mint}:price`, String(price), 'EX', 10);
          return price;
        }
      }
    } catch { /* fall through */ }

    // Fallback: DexScreener (covers pump.fun bonding curve tokens)
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) return null;
      const data = await res.json() as { pairs?: Array<{ priceUsd?: string }> };
      const priceStr = data.pairs?.[0]?.priceUsd;
      const price = priceStr ? parseFloat(priceStr) : null;
      if (price && price > 0) {
        await this.redis.set(`token:${mint}:price`, String(price), 'EX', 10);
        return price;
      }
    } catch { /* ignore */ }

    return null;
  }

  async checkPosition(userId: string, mint: string): Promise<Trade | null> {
    const raw = await this.redis.hget(`position:${userId}:${mint}`, 'data');
    if (!raw) return null;

    const position   = JSON.parse(raw) as Position;

    // Enrich position with symbol if it was missing at buy time (social signals)
    if (!position.tokenSymbol) {
      const sym = await this.redis.get(`token:${mint}:symbol`);
      if (sym) {
        position.tokenSymbol = sym;
        // Persist enrichment so future checks don't need to refetch
        await this.redis.hset(`position:${userId}:${mint}`, { data: JSON.stringify(position) });
      }
    }

    // Always fetch fresh price — never use stale Redis cache for position decisions.
    // Root cause of avg SL at -50%: cache was 120-300s old, rug completed before next fetch.
    const currentPrice = await this.fetchPriceFallback(mint);

    // Source-based time window — computed before price check so no-price branch can use it
    const TIME_EXIT_MS_NO_PRICE =
      position.source === 'sniper'          ? 60  * 60 * 1_000 :
      position.source === 'pump_graduation' ? 120 * 60 * 1_000 :
      position.source === 'copy_trade'      ? 120 * 60 * 1_000 :
      90 * 60 * 1_000;

    const MAX_POSITION_AGE_MS = 24 * 60 * 60 * 1_000;
    const positionAgeMs = Date.now() - new Date(position.openedAt).getTime();
    if (!currentPrice || currentPrice <= 0) {
      // Graceful time-exit: position outlived its window but we have no live price.
      // Use last known price (or entry) — avoids holding dead-coin slots until 24h.
      // Safe after TIME_EXIT_MS: any live token should be fetchable in 90+ minutes.
      if (!position.tp1Executed && positionAgeMs > TIME_EXIT_MS_NO_PRICE) {
        const exitPrice = position.currentPrice ?? position.entryPrice;
        const trade = await this.paper.sell(position, exitPrice, 1.0, 'SELL_TIMEOUT');
        await this.closePosition(userId, mint);
        await this.publishTrade(trade);
        log.info({ mint: mint.slice(0, 8), ageHours: (positionAgeMs / 3_600_000).toFixed(1), source: position.source }, 'No-price time exit');
        return trade;
      }
      // Force-close genuine 24h zombies at 99% loss
      if (positionAgeMs > MAX_POSITION_AGE_MS) {
        const exitPrice = position.entryPrice * 0.01;
        const trade = await this.paper.sell(position, exitPrice, 1.0, 'SELL_STOP_LOSS');
        await this.closePosition(userId, mint);
        await this.publishTrade(trade);
        return trade;
      }
      return null;
    }
    const pnlPct = (currentPrice - position.entryPrice) / position.entryPrice;

    // Always update live price fields so /positions shows real PnL
    position.currentPrice = currentPrice;
    position.currentUsdValue = position.quantityRemaining * currentPrice;
    position.unrealizedPnlPct = pnlPct;

    // Update highest price
    if (currentPrice > position.highestPriceSeen) {
      position.highestPriceSeen = currentPrice;
    }
    await this.updatePosition(position);
    await this.checkNearTpAlert(userId, position, pnlPct);

    // Stop loss — snipers use tighter -15% (fast rugs go deep; save 5% vs global -20%)
    const stopLossPct = position.source === 'sniper' ? -0.15 : DEFAULT_RISK.STOP_LOSS_PCT;
    if (pnlPct <= stopLossPct) {
      const trade = await this.paper.sell(position, currentPrice, 1.0, 'SELL_STOP_LOSS');
      await this.redis.set(`token:${mint}:sl_cooldown`, '1', 'EX', 4 * 60 * 60);
      // Blacklist dev wallet for 30 days if sniper rugged hard (>50% loss = clear rug)
      if (position.source === 'sniper' && pnlPct < -0.50) {
        const devWallet = await this.redis.get(`dev:${mint}:wallet`).catch(() => null);
        if (devWallet) {
          await this.redis.set(`dev:blacklist:${devWallet}`, '1', 'EX', 30 * 86_400);
          log.info({ dev: devWallet.slice(0, 8), mint: mint.slice(0, 8), pnlPct: (pnlPct * 100).toFixed(0) + '%' }, 'Dev wallet blacklisted — serial rug protection');
        }
      }
      await this.closePosition(userId, mint);
      await this.publishTrade(trade);
      return trade;
    }

    // Trailing stop (active after TP1) — tightens at each TP milestone and with position age
    if (position.trailingStopActive) {
      const ageHours = positionAgeMs / (60 * 60 * 1_000);
      const baseTrailing = ageHours > 12 ? 0.10  // old position: tighten to 10%
        : ageHours > 6 ? 0.12                    // aging position: tighten to 12%
        : DEFAULT_RISK.TRAILING_STOP_FROM_PEAK;  // fresh: use constant (15%)
      const trailingStopPct = position.tp3Executed ? 0.05
        : position.tp2Executed ? 0.08
        : baseTrailing;
      const drawFromPeak = (currentPrice - position.highestPriceSeen) / position.highestPriceSeen;
      if (drawFromPeak <= -trailingStopPct) {
        const trade = await this.paper.sell(position, currentPrice, 1.0, 'SELL_TRAILING');
        // Set 2h rebuy cooldown after any profitable trailing exit to avoid re-entering a dumping token
        if (pnlPct > 0) {
          await this.redis.set(`token:${mint}:tp_cooldown`, '1', 'EX', 2 * 60 * 60);
        }
        await this.closePosition(userId, mint);
        await this.publishTrade(trade);
        return trade;
      }
    }

    // Pre-TP1 drawdown guard: token showed promise (+15% peak) then reversed 15% from peak
    // Exit near breakeven instead of riding all the way to -15%/-20% stop loss
    const peakGain     = (position.highestPriceSeen - position.entryPrice) / position.entryPrice;
    const drawFromPeak = (currentPrice - position.highestPriceSeen) / position.highestPriceSeen;
    if (!position.tp1Executed && positionAgeMs > 10 * 60 * 1_000 && peakGain >= 0.15 && drawFromPeak <= -0.15) {
      const trade = await this.paper.sell(position, currentPrice, 1.0, 'SELL_TRAILING');
      await this.closePosition(userId, mint);
      await this.publishTrade(trade);
      log.info({ mint: mint.slice(0, 8), peakGain: (peakGain * 100).toFixed(0) + '%', drawFromPeak: (drawFromPeak * 100).toFixed(0) + '%', pnlPct: (pnlPct * 100).toFixed(1) + '%' }, 'Pre-TP1 drawdown exit');
      return trade;
    }

    // Sniper ultra-early exit: -8% in first 10 min = early price rejection, cut quickly
    if (position.source === 'sniper' && !position.tp1Executed && positionAgeMs > 10 * 60 * 1_000 && pnlPct < -0.08) {
      const trade = await this.paper.sell(position, currentPrice, 1.0, 'SELL_TIMEOUT');
      await this.redis.set(`token:${mint}:sl_cooldown`, '1', 'EX', 4 * 60 * 60);
      await this.closePosition(userId, mint);
      await this.publishTrade(trade);
      return trade;
    }

    // Sniper fast exit: if -10% after 20 min, the token is dead — free the slot early
    if (position.source === 'sniper' && !position.tp1Executed && positionAgeMs > 20 * 60 * 1_000 && pnlPct < -0.10) {
      const trade = await this.paper.sell(position, currentPrice, 1.0, 'SELL_TIMEOUT');
      await this.redis.set(`token:${mint}:sl_cooldown`, '1', 'EX', 4 * 60 * 60);
      await this.closePosition(userId, mint);
      await this.publishTrade(trade);
      return trade;
    }

    // Time-based exit: varies by source — snipers die faster, graduation tokens need more time
    // Threshold +5%: if token hasn't shown ≥5% gain by the time limit, it's stagnant — free the slot
    // (was -5%: only exited losing positions, leaving flat 0% "zombie" positions open for hours)
    const TIME_EXIT_MS =
      position.source === 'sniper'          ? 60  * 60 * 1_000 : // 60 min: snipers are fast-moving
      position.source === 'pump_graduation' ? 120 * 60 * 1_000 : // 120 min: liquidity builds slowly
      position.source === 'copy_trade'      ? 120 * 60 * 1_000 : // 120 min: follow smart money longer
      90 * 60 * 1_000;                                            // 90 min: default (social signals)
    if (!position.tp1Executed && positionAgeMs > TIME_EXIT_MS && pnlPct < 0.05) {
      const trade = await this.paper.sell(position, currentPrice, 1.0, 'SELL_TIMEOUT');
      await this.redis.set(`token:${mint}:sl_cooldown`, '1', 'EX', 4 * 60 * 60);
      await this.closePosition(userId, mint);
      await this.publishTrade(trade);
      return trade;
    }

    // TP1: 1.5x entry — sell more in bear/sideways regimes to lock profits faster
    if (!position.tp1Executed && currentPrice >= position.entryPrice * DEFAULT_RISK.TP1_MULTIPLIER) {
      const regimeRaw = await this.redis.get('market:regime').catch(() => null);
      const regime    = regimeRaw ? (JSON.parse(regimeRaw) as { regime: string }).regime : 'SIDEWAYS';
      const isBullish = ['BULL', 'EXTREME_BULL'].includes(regime);
      const tp1SellPct = isBullish ? DEFAULT_RISK.TP1_SELL_PCT : 0.50; // 50% in bear/sideways
      const trade = await this.paper.sell(position, currentPrice, tp1SellPct, 'SELL_TP1');
      position.tp1Executed = true;
      position.trailingStopActive = true;
      position.quantityRemaining *= (1 - tp1SellPct);
      position.usdInvested *= (1 - tp1SellPct);
      await this.updatePosition(position);
      await this.publishTrade(trade);
      return trade;
    }

    // TP2: 3x entry
    if (position.tp1Executed && !position.tp2Executed && currentPrice >= position.entryPrice * DEFAULT_RISK.TP2_MULTIPLIER) {
      const trade = await this.paper.sell(position, currentPrice, DEFAULT_RISK.TP2_SELL_PCT, 'SELL_TP2');
      position.tp2Executed = true;
      position.quantityRemaining *= (1 - DEFAULT_RISK.TP2_SELL_PCT);
      position.usdInvested *= (1 - DEFAULT_RISK.TP2_SELL_PCT);
      await this.updatePosition(position);
      await this.publishTrade(trade);
      return trade;
    }

    // TP3: 6x entry
    if (position.tp2Executed && !position.tp3Executed && currentPrice >= position.entryPrice * DEFAULT_RISK.TP3_MULTIPLIER) {
      const trade = await this.paper.sell(position, currentPrice, DEFAULT_RISK.TP3_SELL_PCT, 'SELL_TP3');
      position.tp3Executed = true;
      position.quantityRemaining *= (1 - DEFAULT_RISK.TP3_SELL_PCT);
      position.usdInvested *= (1 - DEFAULT_RISK.TP3_SELL_PCT);
      await this.updatePosition(position);
      await this.publishTrade(trade);
      return trade;
    }

    return null;
  }

  private async checkNearTpAlert(userId: string, position: Position, pnlPct: number): Promise<void> {
    // Fire once per approach level (20-min cooldown) so user gets a heads-up before TP executes
    const mint = position.contractAddress;
    const sym  = position.tokenSymbol ?? mint.slice(0, 8);

    if (!position.tp1Executed && pnlPct >= 0.35) {
      const key = `alert:${userId}:${mint}:near_tp1`;
      const isNew = await this.redis.set(key, '1', 'EX', 20 * 60, 'NX');
      if (isNew) {
        await this.redis.publish('trade:alert', JSON.stringify({
          userId, mint, symbol: sym,
          type: 'NEAR_TP1', pnlPct: (pnlPct * 100).toFixed(1),
          label: 'TP1 (1.5x)',
        }));
      }
    } else if (position.tp1Executed && !position.tp2Executed && pnlPct >= 1.50) {
      const key = `alert:${userId}:${mint}:near_tp2`;
      const isNew = await this.redis.set(key, '1', 'EX', 20 * 60, 'NX');
      if (isNew) {
        await this.redis.publish('trade:alert', JSON.stringify({
          userId, mint, symbol: sym,
          type: 'NEAR_TP2', pnlPct: (pnlPct * 100).toFixed(1),
          label: 'TP2 (3x)',
        }));
      }
    } else if (position.tp2Executed && !position.tp3Executed && pnlPct >= 4.00) {
      const key = `alert:${userId}:${mint}:near_tp3`;
      const isNew = await this.redis.set(key, '1', 'EX', 20 * 60, 'NX');
      if (isNew) {
        await this.redis.publish('trade:alert', JSON.stringify({
          userId, mint, symbol: sym,
          type: 'NEAR_TP3', pnlPct: (pnlPct * 100).toFixed(1),
          label: 'TP3 (6x)',
        }));
      }
    }
  }

  private async updatePosition(position: Position): Promise<void> {
    position.updatedAt = new Date();
    await this.redis.hset(`position:${position.userId}:${position.contractAddress}`, {
      data: JSON.stringify(position),
    });
    await this.onPositionUpdate(position).catch(err => log.warn({ err }, 'onPositionUpdate failed'));
  }

  private async closePosition(userId: string, mint: string): Promise<void> {
    await this.redis.del(`position:${userId}:${mint}`);
    await this.redis.srem(`positions:${userId}`, mint);
    await this.onPositionClose(userId, mint).catch(err => log.warn({ err }, 'onPositionClose failed'));
    log.info({ userId, mint }, 'Position closed');
  }

  private async publishTrade(trade: Trade): Promise<void> {
    await this.onTrade(trade).catch(err => log.warn({ err }, 'onTrade callback failed'));
    await this.redis.publish('trade:executed', JSON.stringify(trade));
  }
}
