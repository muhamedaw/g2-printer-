import { createId } from '@paralleldrive/cuid2';
import type { SandboxConfig, SandboxState, SandboxPosition, SandboxTrade } from '@mpg2/shared';
import { sleep, createLogger } from '@mpg2/shared';
import { SandboxWallet } from './SandboxWallet.js';
import { TokenDetector } from '../detectors/TokenDetector.js';
import { FakeExecutor } from '../execution/FakeExecutor.js';
import { SandboxPositionManager } from '../execution/SandboxPositionManager.js';
import { ReportGenerator } from '../reporting/ReportGenerator.js';
import { QuickScorer } from '../scoring/QuickScorer.js';
import { getDb } from '@mpg2/db';
import { sandboxSessions, sandboxTrades, sandboxPositions } from '@mpg2/db';
import { eq, and } from 'drizzle-orm';

const log = createLogger('sandbox-engine');
const TICK_INTERVAL_MS = 15_000;
const SCAN_FOR_BUYS_INTERVAL = 4; // every 4 ticks = 60s

export class SandboxEngine {
  private sessions = new Map<string, SandboxState>();
  private detector = new TokenDetector();
  private executor = new FakeExecutor();
  private positionMgr = new SandboxPositionManager();
  private reporter = new ReportGenerator();
  private scorer = new QuickScorer();

  async createSession(params: {
    userId: string;
    startingCapital: number;
    durationMs: number;
    takeProfitPercent?: number;
    stopLossPercent?: number;
    positionSizePercent?: number;
    maxPositions?: number;
    minScoreThreshold?: number;
  }): Promise<SandboxState> {
    const sessionId = createId();
    const config: SandboxConfig = {
      userId: params.userId,
      sessionId,
      startingCapital: params.startingCapital,
      durationMs: params.durationMs,
      maxPositions: params.maxPositions ?? 5,
      positionSizePercent: params.positionSizePercent ?? 20,
      takeProfitPercent: params.takeProfitPercent ?? 50,
      stopLossPercent: params.stopLossPercent ?? 20,
      minScoreThreshold: params.minScoreThreshold ?? 60,
      paper: true,
    };

    const now = new Date();
    const state: SandboxState = {
      config,
      status: 'RUNNING',
      capital: params.startingCapital,
      peakCapital: params.startingCapital,
      openPositions: new Map(),
      closedTrades: [],
      startedAt: now,
      endsAt: new Date(now.getTime() + params.durationMs),
      totalTrades: 0,
      winningTrades: 0,
      totalPnlUsd: 0,
    };

    try {
      const db = getDb();
      await db.insert(sandboxSessions).values({
        id: sessionId,
        userId: params.userId,
        status: 'RUNNING',
        startingCapital: String(params.startingCapital),
        currentCapital: String(params.startingCapital),
        peakCapital: String(params.startingCapital),
        config,
        endsAt: state.endsAt,
      });
    } catch (err) {
      // DB failure shouldn't block the session — log and continue in-memory
      log.warn({ err, sessionId }, 'DB insert failed — running in-memory only');
    }

    this.sessions.set(sessionId, state);
    this.runLoop(sessionId);
    return state;
  }

  getSession(sessionId: string): SandboxState | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): SandboxState[] {
    return [...this.sessions.values()].filter(s => s.config.userId === userId);
  }

  getActiveSession(userId: string): SandboxState | undefined {
    return this.getUserSessions(userId).find(s => s.status === 'RUNNING');
  }

  async stopSession(sessionId: string): Promise<SandboxState | null> {
    const state = this.sessions.get(sessionId);
    if (!state) return null;
    state.status = 'STOPPED';
    await this.finalizeSession(state);
    return state;
  }

  private runLoop(sessionId: string): void {
    // Deliberately not await — runs independently. Errors are caught inside.
    void this.loopImpl(sessionId);
  }

  private async loopImpl(sessionId: string): Promise<void> {
    let tick = 0;
    log.info({ sessionId }, 'Session loop started');

    while (true) {
      const state = this.sessions.get(sessionId);
      if (!state || state.status !== 'RUNNING') {
        log.info({ sessionId, status: state?.status }, 'Session loop exiting');
        break;
      }

      if (Date.now() >= state.endsAt.getTime()) {
        state.status = 'COMPLETED';
        await this.finalizeSession(state).catch(e => log.error({ e }, 'finalizeSession error'));
        break;
      }

      try {
        // Update open positions — check TP/SL
        const { closed, updatedPositions } = await this.positionMgr.checkAndClose(
          state.openPositions, state.config,
        );
        state.openPositions = updatedPositions;

        for (const trade of closed) {
          state.capital += trade.fakeUsdAmount;
          if (state.capital > state.peakCapital) state.peakCapital = state.capital;
          state.closedTrades.push(trade);
          state.totalTrades++;
          if ((trade.pnlUsd ?? 0) > 0) state.winningTrades++;
          await this.persistTrade(trade, state.config.userId).catch(() => null);
        }

        // Scan for new buys every 4 ticks (60s)
        if (tick % SCAN_FOR_BUYS_INTERVAL === 0) {
          await this.tryBuy(state).catch(e =>
            log.warn({ e, sessionId }, 'tryBuy failed — skipping this tick'),
          );
        }

        await this.persistSessionState(state).catch(() => null);
      } catch (err) {
        // Never let a single tick kill the loop
        log.error({ err, sessionId, tick }, 'Tick error — continuing');
      }

      tick++;
      await sleep(TICK_INTERVAL_MS);
    }
  }

  private async tryBuy(state: SandboxState): Promise<void> {
    if (state.openPositions.size >= state.config.maxPositions) return;

    const candidates = await this.detector.getTopCandidates(state.config.minScoreThreshold, 3);

    for (const candidate of candidates) {
      if (state.openPositions.size >= state.config.maxPositions) break;
      if (state.openPositions.has(candidate.snapshot.mint)) continue;
      if (state.capital < 5) break; // not enough fake money

      const qs = this.scorer.score(candidate.snapshot);
      const result = this.executor.buy(state.config, candidate.snapshot, qs, state.capital);
      if (!result) continue;

      const { position, trade } = result;
      if (trade.fakeUsdAmount > state.capital) continue;

      state.capital -= trade.fakeUsdAmount;
      state.openPositions.set(position.tokenMint, position);
      state.closedTrades.push(trade);
      state.totalTrades++;

      await this.persistTrade(trade, state.config.userId).catch(() => null);
      await this.persistPosition(position, state.config).catch(() => null);
      log.info({ sessionId: state.config.sessionId, token: position.tokenSymbol, score: qs.total }, 'sandbox buy');
    }
  }

  private async finalizeSession(state: SandboxState): Promise<void> {
    const timeoutTrades = this.positionMgr.closeAll(state.openPositions, state.config);
    for (const trade of timeoutTrades) {
      state.capital += trade.fakeUsdAmount;
      state.closedTrades.push(trade);
      await this.persistTrade(trade, state.config.userId).catch(() => null);
    }
    state.openPositions.clear();
    state.totalPnlUsd = state.capital - state.config.startingCapital;

    try {
      const db = getDb();
      await db.update(sandboxSessions)
        .set({
          status: state.status,
          currentCapital: String(state.capital),
          peakCapital: String(state.peakCapital),
          totalPnlUsd: String(state.totalPnlUsd),
          totalTrades: state.totalTrades,
          winningTrades: state.winningTrades,
          completedAt: new Date(),
        })
        .where(eq(sandboxSessions.id, state.config.sessionId));
    } catch (err) {
      log.warn({ err }, 'DB update on finalize failed');
    }

    log.info({ sessionId: state.config.sessionId, status: state.status, pnl: state.totalPnlUsd }, 'session ended');
  }

  private async persistSessionState(state: SandboxState): Promise<void> {
    const db = getDb();
    await db.update(sandboxSessions)
      .set({
        currentCapital: String(state.capital),
        peakCapital: String(state.peakCapital),
        totalTrades: state.totalTrades,
        winningTrades: state.winningTrades,
      })
      .where(eq(sandboxSessions.id, state.config.sessionId));
  }

  private async persistTrade(trade: SandboxTrade, userId: string): Promise<void> {
    const db = getDb();
    await db.insert(sandboxTrades).values({
      id: trade.tradeId,
      sessionId: trade.sessionId,
      userId,
      tokenMint: trade.tokenMint,
      tokenSymbol: trade.tokenSymbol,
      tokenName: trade.tokenSymbol,
      action: trade.action,
      fakeUsdAmount: String(trade.fakeUsdAmount),
      price: String(trade.price),
      score: trade.score,
      exitReason: trade.exitReason ?? null,
      pnlUsd: trade.pnlUsd != null ? String(trade.pnlUsd) : null,
      pnlPercent: trade.pnlPercent != null ? String(trade.pnlPercent) : null,
    }).onConflictDoNothing();
  }

  private async persistPosition(pos: SandboxPosition, config: SandboxConfig): Promise<void> {
    const db = getDb();
    await db.insert(sandboxPositions).values({
      id: pos.positionId,
      sessionId: config.sessionId,
      userId: config.userId,
      tokenMint: pos.tokenMint,
      tokenSymbol: pos.tokenSymbol,
      tokenName: pos.tokenName,
      entryPrice: String(pos.entryPrice),
      fakeUsdSpent: String(pos.fakeSolSpent),
      fakeTokensHeld: String(pos.fakeTokensHeld),
      score: pos.score,
    }).onConflictDoNothing();
  }

  getReport(sessionId: string): string | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;
    const report = this.reporter.generate(state);
    return this.reporter.formatTelegram(report);
  }

  getStatus(sessionId: string): string | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;
    return this.reporter.formatStatus(state);
  }
}
