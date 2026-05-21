import { createLogger } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('copy-trade-detector');

export interface WalletSwap {
  wallet:    string;
  tokenMint: string;
  side:      'buy' | 'sell';
  usdAmount: number;
  txSig:     string;
  timestamp: number;
}

export interface CopySignal {
  wallet:    string;
  tokenMint: string;
  usdAmount: number;
  copyWeight: number;
  walletScore: number;
}

// Helius enhanced webhook payload (simplified)
interface HeliusTxPayload {
  type:      string;
  signature: string;
  timestamp: number;
  feePayer:  string;
  tokenTransfers?: Array<{
    mint:          string;
    fromUserAccount: string;
    toUserAccount:  string;
    tokenAmount:    number;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount:   string;
    amount:          number;
  }>;
}

export class CopyTradeDetector {
  constructor(private readonly redis: Redis) {}

  async processWebhookPayload(payloads: HeliusTxPayload[]): Promise<void> {
    for (const tx of payloads) {
      if (tx.type !== 'SWAP') continue;

      const swap = this.extractSwap(tx);
      if (!swap) continue;

      // Check if this wallet is tracked
      const scoreRaw = await this.redis.hget('whale:scores', swap.wallet);
      if (!scoreRaw) continue;

      const { score, copyWeight } = JSON.parse(scoreRaw) as { score: number; copyWeight: number };
      if (score < 50) continue; // only copy high-quality wallets

      if (swap.side === 'buy' && swap.usdAmount >= 100) {
        const signal: CopySignal = {
          wallet:      swap.wallet,
          tokenMint:   swap.tokenMint,
          usdAmount:   swap.usdAmount,
          copyWeight,
          walletScore: score,
        };
        await this.redis.publish('whale:copy_signal', JSON.stringify(signal));
        log.info({ wallet: swap.wallet.slice(0, 8), token: swap.tokenMint.slice(0, 8), score }, 'Copy signal emitted');
      }

      // Track wallet activity in Redis sorted set (score = timestamp)
      await this.redis.zadd(`whale:activity:${swap.wallet}`, swap.timestamp, swap.txSig);
      await this.redis.zremrangebyrank(`whale:activity:${swap.wallet}`, 0, -101); // keep last 100
    }
  }

  private extractSwap(tx: HeliusTxPayload): WalletSwap | null {
    if (!tx.tokenTransfers?.length) return null;

    const transfer = tx.tokenTransfers[0];
    if (!transfer) return null;

    // Determine buy vs sell by token flow direction
    const isReceiving = transfer.toUserAccount === tx.feePayer;
    const side: 'buy' | 'sell' = isReceiving ? 'buy' : 'sell';

    // Estimate USD from native SOL transfers
    const nativeSol = tx.nativeTransfers?.find(n =>
      n.fromUserAccount === tx.feePayer || n.toUserAccount === tx.feePayer,
    );
    const solAmount = nativeSol ? nativeSol.amount / 1e9 : 0;
    const usdAmount = solAmount * 150; // rough SOL price estimate; real price from Redis

    return {
      wallet:    tx.feePayer,
      tokenMint: transfer.mint,
      side,
      usdAmount,
      txSig:     tx.signature,
      timestamp: tx.timestamp,
    };
  }

  async getTopWallets(limit = 20): Promise<Array<{ address: string; score: number }>> {
    const raw = await this.redis.hgetall('whale:scores');
    return Object.entries(raw)
      .map(([address, v]) => ({ address, score: (JSON.parse(v) as { score: number }).score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async updateWalletScore(address: string, score: number, copyWeight: number): Promise<void> {
    await this.redis.hset('whale:scores', address, JSON.stringify({ score, copyWeight }));
    await this.redis.sadd('whale:watch_list_set', address);
    // Keep master list for Helius webhook registration
    const list = await this.redis.smembers('whale:watch_list_set');
    await this.redis.set('whale:watch_list', JSON.stringify(list));
  }
}
