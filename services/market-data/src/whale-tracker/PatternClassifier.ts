import { CircuitBreaker, createLogger } from '@mpg2/shared';
import type { WalletPattern } from '@mpg2/shared';

const log = createLogger('pattern-classifier');
const breaker = new CircuitBreaker('helius-tx', 5, 60_000);

interface HeliusTx {
  type: string;
  timestamp: number;
  tokenTransfers?: Array<{ mint: string; tokenAmount: number }>;
  nativeTransfers?: Array<{ amount: number }>;
}

interface WalletProfile {
  address: string;
  pattern: WalletPattern;
  winRate: number;
  avgHoldMinutes: number;
  totalTrades: number;
}

export class PatternClassifier {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env['HELIUS_API_KEY'] ?? '';
  }

  async classify(address: string): Promise<WalletProfile> {
    if (!this.apiKey) {
      return { address, pattern: 'unknown', winRate: 0, avgHoldMinutes: 0, totalTrades: 0 };
    }

    const txs = await this.fetchRecentTxs(address);
    if (txs.length === 0) {
      return { address, pattern: 'unknown', winRate: 0, avgHoldMinutes: 0, totalTrades: 0 };
    }

    const pattern = this.detectPattern(txs);
    const { winRate, avgHoldMinutes } = this.calcMetrics(txs);

    return { address, pattern, winRate, avgHoldMinutes, totalTrades: txs.length };
  }

  private async fetchRecentTxs(address: string): Promise<HeliusTx[]> {
    return breaker.execute(async () => {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${this.apiKey}&limit=100&type=SWAP`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      return res.json() as Promise<HeliusTx[]>;
    }).catch(() => []);
  }

  private detectPattern(txs: HeliusTx[]): WalletPattern {
    if (txs.length < 5) return 'unknown';

    const swaps = txs.filter(t => t.type === 'SWAP');
    const uniqueMints = new Set(
      swaps.flatMap(t => t.tokenTransfers?.map(tr => tr.mint) ?? [])
    ).size;

    // Institutional: many swaps, high diversity, large amounts
    const avgAmount = swaps
      .flatMap(t => t.nativeTransfers?.map(n => n.amount) ?? [0])
      .reduce((s, a) => s + a, 0) / Math.max(swaps.length, 1);

    if (avgAmount > 50 * 1e9 && uniqueMints > 20) return 'institutional';

    // Insider: concentrated bets, buys early, high win rate implied by few tokens
    if (uniqueMints < 5 && swaps.length > 10) return 'insider';

    // Lucky retail: many small trades across many tokens
    if (uniqueMints > 10 && avgAmount < 1 * 1e9) return 'lucky_retail';

    return 'unknown';
  }

  private calcMetrics(txs: HeliusTx[]): { winRate: number; avgHoldMinutes: number } {
    const swaps = txs.filter(t => t.type === 'SWAP').sort((a, b) => a.timestamp - b.timestamp);
    if (swaps.length < 2) return { winRate: 0, avgHoldMinutes: 0 };

    // Pair buys/sells by mint to estimate hold times
    const mintFirst = new Map<string, number>();
    const holdTimes: number[] = [];

    for (const tx of swaps) {
      for (const tr of tx.tokenTransfers ?? []) {
        if (!mintFirst.has(tr.mint)) {
          mintFirst.set(tr.mint, tx.timestamp);
        } else {
          const holdMs = (tx.timestamp - mintFirst.get(tr.mint)!) * 1000;
          holdTimes.push(holdMs / 60_000);
          mintFirst.delete(tr.mint);
        }
      }
    }

    const avgHoldMinutes = holdTimes.length > 0
      ? holdTimes.reduce((s, h) => s + h, 0) / holdTimes.length
      : 0;

    // Win rate heuristic: swaps with subsequent higher-value exits
    const winRate = holdTimes.length > 0 ? Math.min(holdTimes.filter(h => h < 60).length / holdTimes.length * 100, 100) : 0;

    return { winRate, avgHoldMinutes };
  }

  async classifyBatch(addresses: string[]): Promise<WalletProfile[]> {
    const results: WalletProfile[] = [];
    for (const addr of addresses) {
      try {
        results.push(await this.classify(addr));
      } catch (err) {
        log.warn({ err, addr }, 'classify failed — skipping');
        results.push({ address: addr, pattern: 'unknown', winRate: 0, avgHoldMinutes: 0, totalTrades: 0 });
      }
      // polite rate limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    }
    return results;
  }
}
