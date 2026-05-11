import type { SandboxState, SandboxReport, SandboxTrade } from '@mpg2/shared';
import { formatUsd, formatPercent, formatDuration } from '@mpg2/shared';

export class ReportGenerator {
  generate(state: SandboxState): SandboxReport {
    const { closedTrades, config } = state;
    const endingCapital = state.capital;
    const totalPnlUsd = endingCapital - config.startingCapital;
    const totalPnlPercent = (totalPnlUsd / config.startingCapital) * 100;
    const maxDrawdownPercent = ((state.peakCapital - state.capital) / state.peakCapital) * 100;

    const sells = closedTrades.filter(t => t.action === 'SELL');
    const wins = sells.filter(t => (t.pnlUsd ?? 0) > 0);
    const losses = sells.filter(t => (t.pnlUsd ?? 0) <= 0);

    const sorted = [...sells].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0));
    const bestTrade = sorted[0] ?? null;
    const worstTrade = sorted[sorted.length - 1] ?? null;

    const avgHoldTimeMs = this.calcAvgHoldTime(closedTrades);

    return {
      sessionId: config.sessionId,
      durationMs: state.endsAt.getTime() - state.startedAt.getTime(),
      startingCapital: config.startingCapital,
      endingCapital,
      totalPnlUsd,
      totalPnlPercent,
      maxDrawdownPercent,
      totalTrades: sells.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : 0,
      bestTrade,
      worstTrade,
      avgHoldTimeMs,
    };
  }

  formatTelegram(report: SandboxReport): string {
    const emoji = report.totalPnlUsd >= 0 ? '📈' : '📉';
    const pnlEmoji = report.totalPnlUsd >= 0 ? '🟢' : '🔴';

    return [
      `${emoji} *Sandbox Session Report*`,
      ``,
      `💰 Starting Capital: ${formatUsd(report.startingCapital)}`,
      `${pnlEmoji} Ending Capital: ${formatUsd(report.endingCapital)}`,
      `📊 Total P&L: ${formatUsd(report.totalPnlUsd)} (${formatPercent(report.totalPnlPercent)})`,
      ``,
      `📉 Max Drawdown: ${formatPercent(-report.maxDrawdownPercent)}`,
      `⏱ Duration: ${formatDuration(report.durationMs)}`,
      ``,
      `🔢 Trades: ${report.totalTrades}`,
      `✅ Wins: ${report.winningTrades} | ❌ Losses: ${report.losingTrades}`,
      `🎯 Win Rate: ${formatPercent(report.winRate)}`,
      `⏳ Avg Hold: ${formatDuration(report.avgHoldTimeMs)}`,
      ``,
      report.bestTrade ? `🏆 Best: ${report.bestTrade.tokenSymbol} ${formatPercent(report.bestTrade.pnlPercent ?? 0)}` : '',
      report.worstTrade ? `💀 Worst: ${report.worstTrade.tokenSymbol} ${formatPercent(report.worstTrade.pnlPercent ?? 0)}` : '',
    ].filter(Boolean).join('\n');
  }

  formatStatus(state: SandboxState): string {
    const remaining = state.endsAt.getTime() - Date.now();
    const capitalChange = state.capital - state.config.startingCapital;
    const pnlPct = (capitalChange / state.config.startingCapital) * 100;
    const pnlEmoji = capitalChange >= 0 ? '🟢' : '🔴';

    const positionLines = [...state.openPositions.values()].map(p =>
      `  • ${p.tokenSymbol}: ${formatPercent(p.pnlPercent)} (score: ${p.score})`
    );

    return [
      `🤖 *Sandbox Status*`,
      ``,
      `${pnlEmoji} Capital: ${formatUsd(state.capital)} (${formatPercent(pnlPct)})`,
      `⏱ Time Left: ${formatDuration(Math.max(0, remaining))}`,
      `📊 Open Positions: ${state.openPositions.size}/${state.config.maxPositions}`,
      `🔢 Total Trades: ${state.totalTrades}`,
      ...positionLines,
    ].join('\n');
  }

  private calcAvgHoldTime(trades: SandboxTrade[]): number {
    const buys = new Map<string, Date>();
    let totalMs = 0;
    let count = 0;
    for (const t of trades) {
      if (t.action === 'BUY') {
        buys.set(t.tokenMint, t.executedAt);
      } else {
        const buyTime = buys.get(t.tokenMint);
        if (buyTime) {
          totalMs += t.executedAt.getTime() - buyTime.getTime();
          count++;
        }
      }
    }
    return count > 0 ? totalMs / count : 0;
  }
}
