import type Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';

const log = createLogger('self-learner');

interface TradeOutcome {
  contractAddress: string;
  aiScore: number;
  pnlPct: number;
  exitReason: string;
  holdMinutes: number;
}

interface PatternStats {
  totalTrades:   number;
  winRate:       number;
  avgPnl:        number;
  avgAiScore:    number;
}

export class SelfLearner {
  constructor(private readonly redis: Redis) {}

  async recordOutcome(outcome: TradeOutcome): Promise<void> {
    const key = `learning:outcomes`;
    await this.redis.lpush(key, JSON.stringify(outcome));
    await this.redis.ltrim(key, 0, 999); // keep last 1000 trades
    log.debug({ contractAddress: outcome.contractAddress, pnlPct: outcome.pnlPct }, 'Outcome recorded');
  }

  async getStats(): Promise<PatternStats> {
    const raw = await this.redis.lrange('learning:outcomes', 0, 999);
    if (raw.length === 0) return { totalTrades: 0, winRate: 0, avgPnl: 0, avgAiScore: 0 };

    const outcomes = raw.map(r => JSON.parse(r) as TradeOutcome);
    const wins = outcomes.filter(o => o.pnlPct > 0);

    return {
      totalTrades: outcomes.length,
      winRate:     (wins.length / outcomes.length) * 100,
      avgPnl:      outcomes.reduce((s, o) => s + o.pnlPct, 0) / outcomes.length,
      avgAiScore:  outcomes.reduce((s, o) => s + o.aiScore, 0) / outcomes.length,
    };
  }

  // Derives a score-calibration multiplier based on expected value, not just win rate.
  // A 33% WR system can still be profitable if winners are large (+100%) vs losers (-20%).
  // Pure win-rate calibration would wrongly penalize a profitable-but-volatile system.
  async getScoreMultiplier(minScore: number): Promise<number> {
    const raw = await this.redis.lrange('learning:outcomes', 0, 199);
    if (raw.length < 20) return 1.0; // not enough data

    const outcomes = raw.map(r => JSON.parse(r) as TradeOutcome)
      .filter(o => o.aiScore >= minScore);

    if (outcomes.length < 5) return 1.0;

    const avgPnl  = outcomes.reduce((s, o) => s + o.pnlPct, 0) / outcomes.length;
    const winRate = outcomes.filter(o => o.pnlPct > 0).length / outcomes.length;

    // Positive EV → don't penalize (at most +5% boost for strong performers)
    if (avgPnl > 0.10) return 1.05; // EV > 10%: slight boost to flow more signals
    if (avgPnl > 0)    return 1.0;  // EV > 0%: neutral, don't reduce
    // Negative EV → reduce with 0.95 floor (prevents deadlock)
    return Math.min(Math.max(winRate / 0.50, 0.95), 1.0);
  }
}
