import { createLogger } from '@mpg2/shared';
import type { AiSignal } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('helius-graduation');

// pump.fun migration program — triggered when a token graduates from bonding curve
const PUMP_MIGRATE_PROGRAM  = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

// PROMPT 82: Detect pump.fun graduations via Helius logsSubscribe — 2-5s faster than GeckoTerminal polling
export class HeliusGraduationWatcher {
  private ws:         WebSocket | null = null;
  private running    = false;
  private retryMs    = 2_000;
  private retryCount = 0;
  private hbTimer:   ReturnType<typeof setInterval> | null = null;

  constructor(private readonly redisPub: Redis) {}

  start(): void {
    const apiKey = process.env['HELIUS_API_KEY'];
    if (!apiKey) {
      log.debug('HELIUS_API_KEY not set — graduation watcher disabled');
      return;
    }
    this.running = true;
    this.connect(apiKey);
  }

  stop(): void {
    this.running = false;
    if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
    this.ws?.close();
    this.ws = null;
  }

  private connect(apiKey: string): void {
    if (!this.running) return;

    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      log.warn({ err }, 'Helius graduation WS failed — retrying');
      this.scheduleReconnect(apiKey);
      return;
    }

    this.ws.onopen = () => {
      log.info('Helius graduation WS connected — subscribing to migration program');
      this.retryMs = 2_000;

      this.ws!.send(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method:  'logsSubscribe',
        params:  [
          { mentions: [PUMP_MIGRATE_PROGRAM] },
          { commitment: 'confirmed' },
        ],
      }));

      if (this.hbTimer) clearInterval(this.hbTimer);
      this.hbTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'getHealth' }));
        }
      }, 25_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        const params = msg['params'] as { result?: { value?: { logs?: string[]; signature?: string } } } | undefined;
        if (!params?.result?.value) return;

        const { logs, signature } = params.result.value;
        if (!logs || !signature) return;

        // Graduation log: "Instruction: MigrateFunds" or "migrate" in pump.fun migration
        const isGraduation = logs.some(l =>
          l.toLowerCase().includes('migrate') ||
          l.includes('Instruction: MigrateFunds'),
        );
        if (!isGraduation) return;

        // Extract mint from logs
        let mint: string | null = null;
        for (const line of logs) {
          const m = line.match(/mint:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
          if (m?.[1]) { mint = m[1]; break; }
        }
        if (!mint) return;

        // Dedup
        const key = `helius:grad:${mint}`;
        void this.redisPub.set(key, '1', 'EX', 3600).then(result => {
          if (result !== 'OK') return;

          log.info({ mint: mint!.slice(0, 8), sig: signature.slice(0, 12) }, 'Helius: pump.fun graduation detected');

          // Graduation signals are high-conviction: token survived bonding curve = real demand
          const aiSignal: AiSignal = {
            contractAddress:    mint!,
            sentimentScore:     85,
            authenticityScore:  90,
            trendScore:         88,
            narrativeFreshness: 95,
            finalAiScore:       88,
            platformsDetected:  ['news'],
            platformCount:      1,
            influencerCount:    0,
            reasoning:          `Helius graduation: pump.fun bonding curve completed (${signature.slice(0, 12)})`,
            passedToSafety:     false,
            source:             'pump_graduation',
            createdAt:          new Date(),
          };

          void this.redisPub.publish('ai:signal', JSON.stringify(aiSignal)).catch(() => null);
        }).catch(() => null);
      } catch { /* ignore */ }
    };

    this.ws.onerror = () => { /* logged on close */ };

    this.ws.onclose = () => {
      if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
      if (this.running) {
        this.retryCount++;
        if (this.retryCount >= 3) {
          log.info('Helius graduation WS unavailable after 3 attempts — likely requires paid plan. Disabled.');
          this.running = false;
          return;
        }
        log.info({ retryMs: this.retryMs, attempt: this.retryCount }, 'Helius graduation WS closed — reconnecting');
        this.scheduleReconnect(apiKey);
      }
    };
  }

  private scheduleReconnect(apiKey: string): void {
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
    setTimeout(() => this.connect(apiKey), delay);
  }
}
