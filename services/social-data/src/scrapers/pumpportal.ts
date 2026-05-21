import { createLogger } from '@mpg2/shared';
import type { RawSignal, AiSignal } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('pumpportal-scraper');

const WS_URL = 'wss://pumpportal.fun/api/data';

// Quick pre-filter — same patterns as security-engine but applied before ANY network calls
const SNIPER_SCAM_PATTERNS = [
  /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/,              // dates: 06/22/2027
  /^(rug|scam|test|fake|honeypot)/i,
  /^\d+$/,                                        // numbers only
  /^[^a-zA-Z0-9]+$/,                             // punctuation only
  /^.{1}$/,                                       // single char
  /^(official|offical|off1cial|offi[ck]ial)/i,   // "official" impersonation
  /offic[^i]al/i,
  /^(admin|founder|team|dev|ceo|insider|alpha|vip)$/i,
  /^(elon|trump|biden|musk|solana|bitcoin|ethereum|sol|btc|eth)$/i, // impersonation coins
];

interface NewTokenEvent {
  mint:              string;
  name:              string;
  symbol:            string;
  traderPublicKey:   string;
  initialBuy:        number;   // SOL amount dev bought at creation
  marketCapSol?:     number;
  bondingCurveKey?:  string;
  uri?:              string;
  txType:            string;
}

export class PumpPortalMonitor {
  private ws:       WebSocket | null = null;
  private running = false;
  private retryMs  = 1_000;
  private hbTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly redisPub: Redis) {}

  start(): void {
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (!this.running) return;

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      log.warn({ err }, 'PumpPortal WebSocket constructor failed — retrying');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      log.info('PumpPortal WebSocket connected');
      this.retryMs = 1_000;

      // Subscribe to new token creation events
      this.ws!.send(JSON.stringify({ method: 'subscribeNewToken' }));

      // Heartbeat ping every 30 s to keep connection alive
      if (this.hbTimer) clearInterval(this.hbTimer);
      this.hbTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ method: 'ping' }));
        }
      }, 30_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Partial<NewTokenEvent>;
        if (data.txType === 'create' && data.mint) {
          void this.handleNewToken(data as NewTokenEvent);
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onerror = (event) => {
      log.debug({ event }, 'PumpPortal WS error');
    };

    this.ws.onclose = () => {
      if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
      if (this.running) {
        log.info({ retryMs: this.retryMs }, 'PumpPortal WS closed — reconnecting');
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 60_000);
    setTimeout(() => this.connect(), delay);
  }

  private async handleNewToken(event: NewTokenEvent): Promise<void> {
    // Fast scam name check — reject before any network calls or scoring
    const sym = event.symbol ?? '';
    if (sym && SNIPER_SCAM_PATTERNS.some(p => p.test(sym))) {
      log.info({ mint: event.mint.slice(0, 8), sym }, 'Pump.fun scam symbol — rejected early');
      return;
    }

    // Dev wallet rug blacklist — serial ruggers create new tokens under same wallet
    const devKey = `dev:blacklist:${event.traderPublicKey}`;
    const isBlacklisted = await this.redisPub.get(devKey).catch(() => null);
    if (isBlacklisted) {
      log.info({ mint: event.mint.slice(0, 8), dev: event.traderPublicKey.slice(0, 8) }, 'Dev wallet blacklisted — token rejected');
      return;
    }

    // initialBuy = number of tokens bought by creator out of 1B total supply
    // devBuyPct  = fraction of supply (0.01 = 1%)
    const devBuyPct = (event.initialBuy ?? 0) / 1_000_000_000;
    const mcSol     = event.marketCapSol ?? 0;

    // ── Sniper: dev bought ≥ 2% of supply, mcap in sweet spot 60-120 SOL ────────
    // 7-day data: 30-60 SOL tokens had 91% rug rate, 60-120 SOL tokens have more traction.
    // 60 SOL = ~70% of graduation threshold (85 SOL) — token survived bonding curve longer.
    if (devBuyPct >= 0.02 && mcSol >= 60 && mcSol <= 120) {
      // Serial creator filter: dev creating 3+ tokens in 6h = spam/bot pattern (low conviction)
      const creationsKey = `dev:creations:6h:${event.traderPublicKey}`;
      const creations = await this.redisPub.incr(creationsKey);
      if (creations === 1) await this.redisPub.expire(creationsKey, 6 * 3600);
      if (creations >= 3) {
        log.info({ mint: event.mint.slice(0, 8), dev: event.traderPublicKey.slice(0, 8), count: creations }, 'Serial creator — sniper skipped');
      } else {
        void this.emitSniperSignal(event, devBuyPct, mcSol);
      }
    }

    // ── Graduation approaching: mcSol ≥ 60 SOL = 70% of 85 SOL graduation threshold ──
    // Token near graduation = likely to list on PumpSwap/Raydium within minutes.
    // Alert user so they can watch for the graduation signal.
    const GRAD_THRESHOLD_SOL = 85;
    if (mcSol >= GRAD_THRESHOLD_SOL * 0.70 && mcSol < GRAD_THRESHOLD_SOL) {
      const pct = Math.round((mcSol / GRAD_THRESHOLD_SOL) * 100);
      const seenKey = `graduation:alert:${event.mint}`;
      const alreadyAlerted = await this.redisPub.get(seenKey).catch(() => null);
      if (!alreadyAlerted) {
        await this.redisPub.set(seenKey, '1', 'EX', 3600).catch(() => null);
        await this.redisPub.publish('trade:alert', JSON.stringify({
          userId: 'broadcast',
          mint:   event.mint,
          symbol: event.symbol ?? event.mint.slice(0, 8),
          type:   'NEAR_GRADUATION',
          pnlPct: String(pct),
          label:  `Bonding curve ${pct}% — قريب من التخرج`,
        })).catch(() => null);
        log.info({ mint: event.mint.slice(0, 8), mcSol: mcSol.toFixed(1), pct }, 'Near graduation — alert sent');
      }
    }

    // ── Normal AI scoring path ────────────────────────────────────────────────
    const signal = this.tokenToSignal(event, devBuyPct);
    if (!signal) return;

    const signalB: RawSignal = {
      ...signal,
      platform:       'telegram',
      platformWeight:  1.0,
      engagementScore: signal.engagementScore * 0.9,
    };
    await this.redisPub.publish('social:raw_signal', JSON.stringify(signal));
    await this.redisPub.publish('social:raw_signal', JSON.stringify(signalB));

    await this.redisPub.lpush('social:recent_texts', signal.content);
    await this.redisPub.ltrim('social:recent_texts', 0, 499);

    log.debug({ mint: event.mint, symbol: event.symbol, devBuyPct: (devBuyPct * 100).toFixed(2) + '%', mcSol }, 'new pump.fun token');
  }

  private async emitSniperSignal(event: NewTokenEvent, devBuyPct: number, mcSol: number): Promise<void> {
    // Snapshot launch price estimate before the delay (mcap at birth)
    const solPriceAtLaunch = parseFloat((await this.redisPub.get('sol:price_usd').catch(() => null)) ?? '150');
    const launchPriceEst   = (mcSol * solPriceAtLaunch) / 1_000_000_000;

    // Wait 30s before acting — filters instant rugs that collapse within seconds.
    // Most honeypots and dev-rug tokens lose >50% of mcap in the first 30s.
    await new Promise(r => setTimeout(r, 30_000));

    // Always fetch FRESH price from DexScreener after the 30s delay.
    // Old code read from Redis cache (set at token creation) which could be 30s stale —
    // meaning a rugged token appeared "alive" because the cached pre-rug price was still there.
    const solPriceRaw = await this.redisPub.get('sol:price_usd').catch(() => null);
    const solPrice    = solPriceRaw ? parseFloat(solPriceRaw) : 150;

    let priceEst: number;
    try {
      const res  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${event.mint}`, { signal: AbortSignal.timeout(5_000) });
      const data = res.ok ? await res.json() as {
        pairs?: Array<{
          priceUsd?: string;
          txns?: { m5?: { buys?: number; sells?: number } };
          volume?: { m5?: number };
          liquidity?: { usd?: number };
        }>
      } : null;
      const pair    = data?.pairs?.[0];
      const dexPrice = pair?.priceUsd ? parseFloat(pair.priceUsd) : null;

      // Bundle detection: coordinated wallets pump token in first minute then dump.
      if (pair) {
        const m5buys  = pair.txns?.m5?.buys  ?? 0;
        const m5sells = pair.txns?.m5?.sells ?? 0;
        const volM5   = pair.volume?.m5 ?? 0;
        const liqUsd  = pair.liquidity?.usd ?? 0;
        const isBundle = m5buys >= 25 && m5sells <= 2 && liqUsd > 0 && (volM5 / liqUsd) > 3;
        if (isBundle) {
          log.info({ mint: event.mint.slice(0, 8), m5buys, m5sells, volM5: volM5.toFixed(0), liqUsd: liqUsd.toFixed(0) }, 'Bundle detected — coordinated pump, skipped');
          return;
        }
      }

      if (dexPrice && dexPrice > 0) {
        // Hard alive check: price dropped > 60% from launch estimate = rug already happened
        const rugHappened = launchPriceEst > 0 && (dexPrice / launchPriceEst) < 0.40;
        if (rugHappened) {
          log.info({ mint: event.mint.slice(0, 8), drop: ((1 - dexPrice / launchPriceEst) * 100).toFixed(0) + '%' }, 'Rug detected in 30s window — sniper aborted');
          return;
        }
        priceEst = dexPrice;
      } else {
        // Not on DexScreener yet — use mcap estimate (security engine will filter rugs)
        const mcUsd = mcSol * solPrice;
        priceEst = mcUsd > 0 ? mcUsd / 1_000_000_000 : 0.000001;
      }
    } catch {
      const mcUsd = mcSol * solPrice;
      priceEst = mcUsd > 0 ? mcUsd / 1_000_000_000 : 0.000001;
    }

    // Short TTL — position monitor reads this price; stale prices caused SL to miss rugs for 5+ min
    await this.redisPub.set(`token:${event.mint}:price`,      String(priceEst), 'EX', 10);
    await this.redisPub.set(`token:${event.mint}:first_seen`, String(Date.now()), 'EX', 4 * 3600);
    await this.redisPub.set(`token:${event.mint}:first_price`, String(priceEst), 'EX', 4 * 3600);

    // Track dev wallet for rug detection
    await this.redisPub.set(`dev:${event.mint}:wallet`, event.traderPublicKey, 'EX', 3_600);
    await this.redisPub.set(`dev:${event.mint}:launch`, String(Date.now()), 'EX', 3_600);
    await this.redisPub.sadd('dev:mints:active', event.mint);

    // Momentum check: compare current price to launch price estimate
    // Rising price after 30s = organic buyers coming in = positive signal
    const momentumRatio  = launchPriceEst > 0 ? priceEst / launchPriceEst : 1;

    // Hard reject: token is DOWN after 30s — early sellers are dumping, skip entirely.
    // Even a small decline (< -5%) after 30s means whale sell pressure is already active.
    if (momentumRatio < 0.95) {
      log.info({ mint: event.mint.slice(0, 8), momentumRatio: momentumRatio.toFixed(2) }, 'Sniper declining after 30s — early sellers dumping, skipped');
      return;
    }

    // Pump guard: if token doubled in 30s = coordinated manipulation, not organic → skip
    if (momentumRatio >= 2.0) {
      log.info({ mint: event.mint.slice(0, 8), momentumRatio: momentumRatio.toFixed(2) }, 'Sniper pump guard: 2x in 30s — likely manipulation, skipped');
      return;
    }

    const momentumBonus  = momentumRatio >= 1.2 ? 8  // +20%: strong momentum
      : momentumRatio >= 1.05 ? 4                    // +5%: mild momentum
      : 0;                                           // flat (0.95–1.05): neutral

    // Score: 60 base + dev conviction (up to 20) + early mcap bonus (up to 10) + momentum
    // Brackets shifted to match new 30 SOL minimum: 30-40 = early (10), 40-120 = mid (5)
    const convictionBonus = Math.min(devBuyPct * 1000, 20);
    const earlyBonus      = mcSol <= 40 ? 10 : 5;
    const finalScore      = Math.round(60 + convictionBonus + earlyBonus + momentumBonus);

    if (momentumBonus !== 0) {
      log.info({ mint: event.mint.slice(0, 8), momentumRatio: momentumRatio.toFixed(2), momentumBonus, finalScore }, 'Sniper momentum applied');
    }

    // Route through security-engine (rug + honeypot + scam symbol checks)
    // Previously went directly to risk:buy_signal — bypassed ALL safety checks!
    const aiSignal: AiSignal = {
      contractAddress:    event.mint,
      tokenSymbol:        event.symbol,
      sentimentScore:     80,
      authenticityScore:  80,
      trendScore:         finalScore,
      narrativeFreshness: 95,
      finalAiScore:       finalScore,
      platformsDetected:  ['news'],
      platformCount:      1,
      influencerCount:    0,
      reasoning:          `Sniper: ${event.symbol ?? event.mint.slice(0, 8)} | dev ${(devBuyPct * 100).toFixed(1)}% supply | mcap ${mcSol.toFixed(1)} SOL`,
      passedToSafety:     false,
      source:             'sniper',
      createdAt:          new Date(),
    };

    await this.redisPub.publish('ai:signal', JSON.stringify(aiSignal));
    log.info({
      mint:   event.mint,
      symbol: event.symbol,
      devPct: (devBuyPct * 100).toFixed(2) + '%',
      mcSol:  mcSol.toFixed(1),
      score:  finalScore,
    }, 'SNIPER → security-engine');
  }

  private tokenToSignal(event: NewTokenEvent, devBuyPct: number): RawSignal | null {
    if (!event.mint) return null;

    const mcSol       = event.marketCapSol ?? 0;
    const buyScore    = Math.min(devBuyPct * 500, 20); // 0–20 pts
    const mcScore     = mcSol > 0 ? Math.min(Math.log10(mcSol + 1) * 5, 15) : 0;
    const engagementScore = 20 + buyScore + mcScore;

    const text = [
      `NEW pump.fun token: ${event.symbol} (${event.name}).`,
      `Dev bought ${(devBuyPct * 100).toFixed(2)}% of supply at launch.`,
      `Market cap: ${mcSol > 0 ? mcSol.toFixed(1) + ' SOL' : 'unknown'}.`,
      `Contract: ${event.mint}`,
    ].join(' ');

    return {
      platform:        'news',
      content:         text,
      contractAddress: event.mint,
      authorUsername:  event.traderPublicKey?.slice(0, 8) ?? 'pumpfun',
      authorFollowers: 0,
      engagementScore,
      platformWeight:  1.5,
      influencerWeight: 1.2,
      processed:       false,
      createdAt:       new Date(),
    };
  }
}
