import type Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';

const log = createLogger('metrics-collector');

export interface SystemMetrics {
  tokensScanned:    number;
  signalsEmitted:   number;
  whalesTracked:    number;
  copySignals:      number;
  priceUpdates:     number;
  lastCollectedAt:  string;
}

const KEY_PREFIX = 'metrics:market-data';
const TTL        = 3600; // 1 hour

export class MetricsCollector {
  private counters = {
    tokensScanned:  0,
    signalsEmitted: 0,
    copySignals:    0,
    priceUpdates:   0,
  };

  constructor(private readonly redis: Redis) {}

  incTokensScanned(n = 1)  { this.counters.tokensScanned  += n; }
  incSignalsEmitted(n = 1) { this.counters.signalsEmitted += n; }
  incCopySignals(n = 1)    { this.counters.copySignals    += n; }
  incPriceUpdates(n = 1)   { this.counters.priceUpdates   += n; }

  async flush(): Promise<void> {
    try {
      const pipe = this.redis.pipeline();
      pipe.incrby(`${KEY_PREFIX}:tokens_scanned`,  this.counters.tokensScanned);
      pipe.incrby(`${KEY_PREFIX}:signals_emitted`, this.counters.signalsEmitted);
      pipe.incrby(`${KEY_PREFIX}:copy_signals`,    this.counters.copySignals);
      pipe.incrby(`${KEY_PREFIX}:price_updates`,   this.counters.priceUpdates);
      pipe.expire(`${KEY_PREFIX}:tokens_scanned`,  TTL);
      pipe.expire(`${KEY_PREFIX}:signals_emitted`, TTL);
      pipe.expire(`${KEY_PREFIX}:copy_signals`,    TTL);
      pipe.expire(`${KEY_PREFIX}:price_updates`,   TTL);
      // Update heartbeat
      pipe.set(`heartbeat:market-data`, String(Date.now()), 'EX', 300);
      await pipe.exec();

      // Reset in-memory counters after flush
      this.counters.tokensScanned  = 0;
      this.counters.signalsEmitted = 0;
      this.counters.copySignals    = 0;
      this.counters.priceUpdates   = 0;
    } catch (err) {
      log.warn({ err }, 'metrics flush failed');
    }
  }

  async getSnapshot(): Promise<SystemMetrics> {
    const [scanned, emitted, whales, copy, prices] = await Promise.all([
      this.redis.get(`${KEY_PREFIX}:tokens_scanned`),
      this.redis.get(`${KEY_PREFIX}:signals_emitted`),
      this.redis.hlen('whale:registry'),
      this.redis.get(`${KEY_PREFIX}:copy_signals`),
      this.redis.get(`${KEY_PREFIX}:price_updates`),
    ]);

    return {
      tokensScanned:   Number(scanned  ?? 0),
      signalsEmitted:  Number(emitted  ?? 0),
      whalesTracked:   Number(whales   ?? 0),
      copySignals:     Number(copy     ?? 0),
      priceUpdates:    Number(prices   ?? 0),
      lastCollectedAt: new Date().toISOString(),
    };
  }
}
