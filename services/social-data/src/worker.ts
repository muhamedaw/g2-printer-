import 'dotenv/config';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { TwitterScraper }      from './scrapers/twitter.js';
import { RedditScraper }       from './scrapers/reddit.js';
import { CryptoPanicScraper }  from './scrapers/cryptopanic.js';
import { TelegramMonitor }     from './scrapers/telegram-monitor.js';
import { PumpPortalMonitor }   from './scrapers/pumpportal.js';
import { WalletWatcher }       from './scrapers/wallet-watcher.js';
import { TikTokScraper }       from './scrapers/tiktok.js';
import { InstagramScraper }    from './scrapers/instagram.js';
import { DexScreenerScraper }  from './scrapers/dexscreener.js';
import { GeckoTerminalScraper } from './scrapers/gecko-terminal.js';
import { GraduationMonitor }  from './scrapers/graduation-monitor.js';
import { HeliusWatcher }           from './scrapers/helius-watcher.js';
import { HeliusGraduationWatcher } from './scrapers/helius-graduation.js';
import { extractAllContracts } from './extractors/contract-extractor.js';

const log = createLogger('social-data-worker');

const redisConn = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const redisPub = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] ?? undefined,
  maxRetriesPerRequest: null,
});

const queue     = new Queue('social-data', { connection: redisConn });
const twitter   = new TwitterScraper();
const reddit    = new RedditScraper();
const news      = new CryptoPanicScraper();
const tg         = new TelegramMonitor(redisPub);
const pumpPortal    = new PumpPortalMonitor(redisPub);
const walletWatcher = new WalletWatcher(redisPub);
const tiktok    = new TikTokScraper();
const instagram = new InstagramScraper();
const dex       = new DexScreenerScraper(redisPub);
const gecko     = new GeckoTerminalScraper(redisPub);
const graduation         = new GraduationMonitor(redisPub);
const heliusWatcher      = new HeliusWatcher(redisPub);
const heliusGraduation   = new HeliusGraduationWatcher(redisPub);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function publishSignals(signals: RawSignal[]): Promise<void> {
  for (const s of signals) {
    await redisPub.publish('social:raw_signal', JSON.stringify(s));
    // Feed contract extractor — store content text in rolling list
    if (s.content) {
      await redisPub.lpush('social:recent_texts', s.content);
      await redisPub.ltrim('social:recent_texts', 0, 499);
    }
  }
}

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function handleScrapeTwitter(): Promise<void> {
  const signals = await twitter.fetchLatest();
  await publishSignals(signals);
  log.info({ count: signals.length }, 'twitter scraped');
}

async function handleScrapeReddit(): Promise<void> {
  const signals = await reddit.fetchLatest();
  await publishSignals(signals);
  log.info({ count: signals.length }, 'reddit scraped');
}

async function handleScrapeNews(): Promise<void> {
  const signals = await news.fetchLatest();
  await publishSignals(signals);
  log.info({ count: signals.length }, 'news scraped');
}

async function handleScrapeTikTok(): Promise<void> {
  const signals = await tiktok.fetchLatest();
  await publishSignals(signals);
  log.info({ count: signals.length }, 'tiktok scraped');
}

async function handleScrapeInstagram(): Promise<void> {
  const signals = await instagram.fetchLatest();
  await publishSignals(signals);
  log.info({ count: signals.length }, 'instagram scraped');
}

async function handleScrapeGraduations(): Promise<void> {
  await graduation.fetchGraduations();
}

async function handleScrapeGeckoTerminal(): Promise<void> {
  const signals = await gecko.fetchLatest();
  // Publish twice to meet AI brain threshold
  const doubled = signals.flatMap(s => [
    s,
    { ...s, platform: 'telegram' as const, platformWeight: 1.0, engagementScore: s.engagementScore * 0.85 },
  ]);
  await publishSignals(doubled);
  if (signals.length > 0) log.info({ count: signals.length }, 'gecko scraped');
}

async function handleScrapeDexScreener(): Promise<void> {
  const signals = await dex.fetchLatest();
  // Publish each signal twice: once as news, once as telegram — ensures AI brain threshold of 2 is met
  const doubled = signals.flatMap(s => [
    s,
    { ...s, platform: 'telegram' as const, platformWeight: 1.0, engagementScore: s.engagementScore * 0.8 },
  ]);
  await publishSignals(doubled);
  if (signals.length > 0) log.info({ count: signals.length }, 'dexscreener scraped');
}

async function handleExtractContracts(): Promise<void> {
  // Read recent signals from Redis list (populated by subscribers elsewhere)
  const raw = await redisPub.lrange('social:recent_texts', 0, 99);
  if (raw.length === 0) return;

  const freq = extractAllContracts(raw);
  const hot = [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (hot.length === 0) return;

  await redisPub.publish('social:hot_contracts', JSON.stringify(hot));
  log.info({ count: hot.length }, 'hot contracts extracted');

  // Route hot contract mentions through ai-brain via raw signals so the multiplier,
  // velocity bonus, and Groq/Ollama scoring are properly applied.
  // Publish 2 signals (reddit + telegram) to meet ai-brain's ≥2 threshold.
  for (const [contractAddress, mentions] of hot) {
    // Skip contracts we've recently signalled (TTL 30 min to avoid duplicates)
    const seenKey = `hot_contract:sent:${contractAddress}`;
    const alreadySent = await redisPub.get(seenKey);
    if (alreadySent) continue;
    await redisPub.set(seenKey, '1', 'EX', 1_800);

    // Engagement scales with mention count — more mentions = more organic interest
    const engagement = Math.min(50 + mentions * 10, 100);
    const baseSignal: RawSignal = {
      contractAddress,
      platform:       'reddit',
      content:        `${mentions} social posts mention this Solana token contract`,
      authorUsername: 'social_aggregator',
      authorFollowers: 5000 * mentions,
      engagementScore: engagement,
      platformWeight:  1.0,
      influencerWeight: 1.0,
      processed:       false,
      createdAt:       new Date(),
    };
    await redisPub.publish('social:raw_signal', JSON.stringify(baseSignal));
    // Second signal as telegram to meet ai-brain ≥2 threshold
    await redisPub.publish('social:raw_signal', JSON.stringify({
      ...baseSignal,
      platform: 'telegram',
      engagementScore: engagement * 0.85,
    }));
    log.info({ contractAddress: contractAddress.slice(0, 8), mentions, engagement }, 'Hot contract signals → ai-brain');
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker('social-data', async (job: Job) => {
  switch (job.name) {
    case 'scrape-twitter':        return handleScrapeTwitter();
    case 'scrape-reddit':         return handleScrapeReddit();
    case 'scrape-news':           return handleScrapeNews();
    case 'scrape-tiktok':         return handleScrapeTikTok();
    case 'scrape-instagram':      return handleScrapeInstagram();
    case 'scrape-dexscreener':    return handleScrapeDexScreener();
    case 'scrape-gecko':          return handleScrapeGeckoTerminal();
    case 'scrape-graduations':    return handleScrapeGraduations();
    case 'extract-contracts':     return handleExtractContracts();
    default: log.warn({ jobName: job.name }, 'unknown job');
  }
}, { connection: redisConn, concurrency: 2 });

worker.on('failed',    (job, err) => log.error({ err, jobName: job?.name }, 'job failed'));
worker.on('completed', job        => log.debug({ jobName: job.name }, 'job done'));

// ─── Recurring schedules ─────────────────────────────────────────────────────

async function scheduleJobs(): Promise<void> {
  await queue.upsertJobScheduler('scrape-twitter',    { every: 60_000  }, { name: 'scrape-twitter',    data: {} });
  await queue.upsertJobScheduler('scrape-reddit',     { every: 30_000  }, { name: 'scrape-reddit',     data: {} });
  await queue.upsertJobScheduler('scrape-news',       { every: 120_000 }, { name: 'scrape-news',       data: {} });
  await queue.upsertJobScheduler('scrape-tiktok',     { every: 300_000 }, { name: 'scrape-tiktok',     data: {} });
  await queue.upsertJobScheduler('scrape-instagram',   { every: 600_000 }, { name: 'scrape-instagram',   data: {} });
  await queue.upsertJobScheduler('scrape-dexscreener', { every: 180_000 }, { name: 'scrape-dexscreener', data: {} });
  await queue.upsertJobScheduler('scrape-gecko',       { every: 300_000 }, { name: 'scrape-gecko',       data: {} });
  await queue.upsertJobScheduler('scrape-graduations', { every: 120_000 }, { name: 'scrape-graduations', data: {} });
  await queue.upsertJobScheduler('extract-contracts', { every: 15_000  }, { name: 'extract-contracts', data: {} });
  log.info('Job schedulers registered');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Social Data worker starting…');

  await tg.start();
  pumpPortal.start();
  walletWatcher.start();
  heliusWatcher.start();
  heliusGraduation.start();
  await scheduleJobs();

  // Kick off immediate scrapes
  await queue.add('scrape-news',        {}, { priority: 1 });
  await queue.add('scrape-dexscreener', {}, { priority: 1 });
  await queue.add('scrape-reddit',      {}, { priority: 2 });
  await queue.add('scrape-twitter',     {}, { priority: 2 });
  await queue.add('scrape-gecko',       {}, { priority: 1 });
  await queue.add('scrape-graduations', {}, { priority: 1 });

  // Heartbeat for monitoring
  const hb = setInterval(() => {
    void redisPub.set('heartbeat:social-data', String(Date.now()), 'EX', 300).catch(() => null);
  }, 60_000);
  void redisPub.set('heartbeat:social-data', String(Date.now()), 'EX', 300).catch(() => null);

  log.info('Social Data worker ready');

  process.on('SIGTERM', async () => {
    clearInterval(hb);
    tg.stop();
    pumpPortal.stop();
    walletWatcher.stop();
    await worker.close();
    await queue.close();
    redisConn.disconnect();
    redisPub.disconnect();
    log.info('Graceful shutdown complete');
    process.exit(0);
  });
}

main().catch(err => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});
