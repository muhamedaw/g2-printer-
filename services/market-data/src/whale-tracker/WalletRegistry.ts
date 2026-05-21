import { createLogger } from '@mpg2/shared';
import type { SmartWallet, WalletPattern } from '@mpg2/shared';
import type Redis from 'ioredis';
import { PatternClassifier } from './PatternClassifier.js';
import { scoreWallet } from './WalletScorer.js';
import { CopyTradeDetector } from './CopyTradeDetector.js';

const log = createLogger('wallet-registry');
const REGISTRY_KEY = 'whale:registry';

export class WalletRegistry {
  private classifier:  PatternClassifier;
  private detector:    CopyTradeDetector;

  constructor(private readonly redis: Redis) {
    this.classifier = new PatternClassifier();
    this.detector   = new CopyTradeDetector(redis);
  }

  async addWallet(address: string, nickname?: string): Promise<SmartWallet> {
    // Check if already known
    const existing = await this.get(address);
    if (existing) return existing;

    // Classify via Helius
    const profile = await this.classifier.classify(address);

    const wallet: SmartWallet = {
      walletAddress:  address,
      pattern:        profile.pattern,
      winRate:        profile.winRate / 100,
      avgProfitX:     1.5, // placeholder — updated over time from trade outcomes
      avgLossPct:     0.2,
      totalTrades:    profile.totalTrades,
      winningTrades:  Math.floor(profile.totalTrades * (profile.winRate / 100)),
      isActive:       true,
      addedAt:        new Date(),
      ...(nickname ? { nickname } : {}),
    };

    await this.save(wallet);

    // Compute and store score
    const scored = scoreWallet(wallet);
    await this.detector.updateWalletScore(address, scored.score, scored.copyWeight);

    log.info({ address: address.slice(0, 8), pattern: wallet.pattern, score: scored.score }, 'Wallet added to registry');
    return wallet;
  }

  async updatePerformance(address: string, wonTrade: boolean, profitX: number): Promise<void> {
    const wallet = await this.get(address);
    if (!wallet) return;

    const newTotal    = wallet.totalTrades + 1;
    const newWinning  = wallet.winningTrades + (wonTrade ? 1 : 0);
    const newWinRate  = newWinning / newTotal;
    const newAvgProfit = ((wallet.avgProfitX * wallet.totalTrades) + profitX) / newTotal;

    const updated: SmartWallet = {
      ...wallet,
      totalTrades:    newTotal,
      winningTrades:  newWinning,
      winRate:        newWinRate,
      avgProfitX:     newAvgProfit,
      lastTradeAt:    new Date(),
    };

    await this.save(updated);

    const scored = scoreWallet(updated);
    await this.detector.updateWalletScore(address, scored.score, scored.copyWeight);

    // Deactivate consistently bad wallets
    if (newTotal >= 20 && newWinRate < 0.25) {
      updated.isActive = false;
      await this.save(updated);
      log.info({ address: address.slice(0, 8) }, 'Wallet deactivated — poor performance');
    }
  }

  async getAll(): Promise<SmartWallet[]> {
    const raw = await this.redis.hgetall(REGISTRY_KEY);
    return Object.values(raw).map(v => JSON.parse(v) as SmartWallet);
  }

  async getActive(): Promise<SmartWallet[]> {
    const all = await this.getAll();
    return all.filter(w => w.isActive);
  }

  async get(address: string): Promise<SmartWallet | null> {
    const raw = await this.redis.hget(REGISTRY_KEY, address);
    return raw ? JSON.parse(raw) as SmartWallet : null;
  }

  private async save(wallet: SmartWallet): Promise<void> {
    await this.redis.hset(REGISTRY_KEY, wallet.walletAddress, JSON.stringify(wallet));
  }

  async seedKnownWallets(addresses: string[]): Promise<void> {
    log.info({ count: addresses.length }, 'Seeding known wallets');
    for (const addr of addresses) {
      await this.addWallet(addr).catch(err =>
        log.warn({ err, addr }, 'Failed to seed wallet'),
      );
      await new Promise(r => setTimeout(r, 300)); // polite
    }
  }
}
