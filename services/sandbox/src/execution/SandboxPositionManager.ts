import type { SandboxPosition, SandboxTrade, SandboxConfig } from '@mpg2/shared';
import { DexScreenerClient } from '../api/DexScreenerClient.js';
import { FakeExecutor } from './FakeExecutor.js';

export class SandboxPositionManager {
  private dex = new DexScreenerClient();
  private executor = new FakeExecutor();

  async checkAndClose(
    positions: Map<string, SandboxPosition>,
    config: SandboxConfig,
  ): Promise<{ closed: SandboxTrade[]; updatedPositions: Map<string, SandboxPosition> }> {
    const closed: SandboxTrade[] = [];
    const updated = new Map(positions);

    for (const [mint, pos] of updated) {
      const price = await this.dex.getTokenPrice(mint);
      if (price === null) continue;

      const position = { ...pos, currentPrice: price };
      const pnlPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
      position.pnlUsd = (pnlPct / 100) * pos.fakeSolSpent;
      position.pnlPercent = pnlPct;
      updated.set(mint, position);

      let exitReason: SandboxTrade['exitReason'] | null = null;
      if (pnlPct >= config.takeProfitPercent) exitReason = 'TAKE_PROFIT';
      else if (pnlPct <= -config.stopLossPercent) exitReason = 'STOP_LOSS';

      if (exitReason) {
        const trade = this.executor.sell(config, position, price, exitReason);
        closed.push(trade);
        updated.delete(mint);
      }
    }

    return { closed, updatedPositions: updated };
  }

  closeAll(
    positions: Map<string, SandboxPosition>,
    config: SandboxConfig,
  ): SandboxTrade[] {
    return [...positions.values()].map(pos =>
      this.executor.sell(config, pos, pos.currentPrice, 'TIMEOUT')
    );
  }
}
