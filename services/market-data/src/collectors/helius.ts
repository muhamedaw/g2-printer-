import { CircuitBreaker, createLogger } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('helius-collector');
const breaker = new CircuitBreaker('helius', 5, 60_000);

export class HeliusCollector {
  private readonly apiKey: string;
  private readonly rpcUrl: string;

  constructor(private readonly redis: Redis) {
    this.apiKey = process.env['HELIUS_API_KEY'] ?? '';
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
  }

  async getTopHolders(mint: string): Promise<Array<{ address: string; pct: number }>> {
    return breaker.execute(async () => {
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getTokenLargestAccounts',
          params: [mint],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const data = await res.json() as { result?: { value?: Array<{ amount: string; uiAmount: number }> } };
      const accounts = data.result?.value ?? [];
      const totalSupply = accounts.reduce((s, a) => s + a.uiAmount, 0);
      return accounts.slice(0, 10).map(a => ({
        address: '',
        pct: totalSupply > 0 ? (a.uiAmount / totalSupply) * 100 : 0,
      }));
    }).catch(() => []);
  }

  // Poll recent SWAP transactions for watched wallets (no public URL needed)
  async pollWalletSwaps(wallets: string[]): Promise<Array<{ wallet: string; mint: string; side: 'buy' | 'sell'; solAmount: number; txSig: string; timestamp: number }>> {
    if (!this.apiKey) return [];

    const results: Array<{ wallet: string; mint: string; side: 'buy' | 'sell'; solAmount: number; txSig: string; timestamp: number }> = [];

    for (const wallet of wallets.slice(0, 10)) { // max 10 per cycle to avoid rate limits
      try {
        const res = await fetch(
          `https://api.helius.xyz/v0/addresses/${wallet}/transactions?type=SWAP&limit=5&api-key=${this.apiKey}`,
          { signal: AbortSignal.timeout(8_000) },
        );
        if (!res.ok) continue;

        const txs = await res.json() as Array<{
          signature: string;
          timestamp: number;
          feePayer: string;
          tokenTransfers?: Array<{ mint: string; fromUserAccount: string; toUserAccount: string; tokenAmount: number }>;
          nativeTransfers?: Array<{ fromUserAccount: string; toUserAccount: string; amount: number }>;
        }>;

        for (const tx of txs) {
          const transfer = tx.tokenTransfers?.[0];
          if (!transfer) continue;

          const isReceiving = transfer.toUserAccount === tx.feePayer;
          const nativeSol = tx.nativeTransfers?.find(n =>
            n.fromUserAccount === tx.feePayer || n.toUserAccount === tx.feePayer,
          );
          const solAmount = nativeSol ? nativeSol.amount / 1e9 : 0;

          results.push({
            wallet,
            mint:      transfer.mint,
            side:      isReceiving ? 'buy' : 'sell',
            solAmount,
            txSig:     tx.signature,
            timestamp: tx.timestamp,
          });
        }

        await new Promise(r => setTimeout(r, 200)); // polite delay per wallet
      } catch { /* skip failing wallets */ }
    }

    return results;
  }

  // Check if a wallet sold a specific mint token since a given timestamp
  async checkWalletSoldMint(wallet: string, mint: string, sinceMs: number): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(
        `https://api.helius.xyz/v0/addresses/${wallet}/transactions?limit=10&api-key=${this.apiKey}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) return false;
      const txs = await res.json() as Array<{
        signature: string;
        timestamp: number;
        feePayer: string;
        tokenTransfers?: Array<{ mint: string; fromUserAccount: string; toUserAccount: string; tokenAmount: number }>;
      }>;
      for (const tx of txs) {
        if (tx.timestamp * 1_000 < sinceMs) continue; // only recent txs
        const sell = tx.tokenTransfers?.find(t =>
          t.mint === mint && t.fromUserAccount === tx.feePayer && t.tokenAmount > 0,
        );
        if (sell) return true;
      }
      return false;
    } catch { return false; }
  }

  async watchWallets(wallets: string[]): Promise<void> {
    if (!this.apiKey) return log.warn('HELIUS_API_KEY not set — wallet watching disabled');
    // Helius Geyser webhook — register wallets to watch (requires public WEBHOOK_URL)
    if (!process.env['WEBHOOK_URL']) {
      log.debug('WEBHOOK_URL not set — using polling mode instead');
      return;
    }
    const res = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: `${process.env['WEBHOOK_URL']}/api/helius/webhook`,
        transactionTypes: ['SWAP'],
        accountAddresses: wallets,
        webhookType: 'enhanced',
      }),
    });
    if (!res.ok) log.warn({ status: res.status }, 'Helius webhook registration failed');
    else log.info({ count: wallets.length }, 'Helius wallet watch registered');
  }
}
