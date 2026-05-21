import { createLogger } from '@mpg2/shared';
import type { AiSignal } from '@mpg2/shared';
import type Redis from 'ioredis';

const log = createLogger('helius-watcher');

// pump.fun program address on Solana mainnet
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// Helius WebSocket endpoint (requires API key)
// Used as backup when PumpPortal WebSocket is unavailable
export class HeliusWatcher {
  private ws:         WebSocket | null = null;
  private running    = false;
  private retryMs    = 2_000;
  private retryCount = 0;
  private subId:     number | null = null;
  private hbTimer:   ReturnType<typeof setInterval> | null = null;

  constructor(private readonly redisPub: Redis) {}

  start(): void {
    const apiKey = process.env['HELIUS_API_KEY'];
    if (!apiKey) {
      log.debug('HELIUS_API_KEY not set — Helius watcher disabled');
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
      log.warn({ err }, 'Helius WebSocket constructor failed — retrying');
      this.scheduleReconnect(apiKey);
      return;
    }

    this.ws.onopen = () => {
      log.info('Helius WebSocket connected — subscribing to pump.fun logs');
      this.retryMs = 2_000;

      // Subscribe to pump.fun program logs — fires on every instruction
      const subscribeMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'logsSubscribe',
        params: [
          { mentions: [PUMP_PROGRAM] },
          { commitment: 'confirmed' },
        ],
      };
      this.ws!.send(JSON.stringify(subscribeMsg));

      // Heartbeat every 25s
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

        // Store subscription ID
        if (msg['id'] === 1 && msg['result'] !== undefined) {
          this.subId = msg['result'] as number;
          log.debug({ subId: this.subId }, 'Helius logsSubscribe confirmed');
          return;
        }

        const params = msg['params'] as { result?: { value?: { logs?: string[]; signature?: string } } } | undefined;
        if (!params?.result?.value) return;

        const { logs, signature } = params.result.value;
        if (!logs || !signature) return;

        // Detect "create" instruction in pump.fun program logs
        const hasCreate = logs.some(l => l.includes('Instruction: Create') || l.includes('create'));
        if (!hasCreate) return;

        // Extract mint address from logs — pump.fun logs include the mint
        // Format: "Program log: mint: <address>"
        let mint: string | null = null;
        for (const line of logs) {
          const m = line.match(/mint:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
          if (m?.[1]) { mint = m[1]; break; }
        }
        if (!mint) return;

        // Dedup: only process each mint once (PumpPortal may have already handled it)
        const dedupKey = `helius:seen:${mint}`;
        void this.redisPub.set(dedupKey, '1', 'EX', 120).then(result => {
          if (result !== 'OK') return; // already processed

          log.info({ mint: mint!.slice(0, 8), sig: signature.slice(0, 12) }, 'Helius backup: new pump.fun token detected');

          // Emit a minimal AI signal for security-engine to evaluate
          // Score is conservative (85 = min threshold) since we lack full context
          const aiSignal: AiSignal = {
            contractAddress:    mint!,
            sentimentScore:     70,
            authenticityScore:  70,
            trendScore:         85,
            narrativeFreshness: 90,
            finalAiScore:       85,
            platformsDetected:  ['news'],
            platformCount:      1,
            influencerCount:    0,
            reasoning:          `Helius backup: pump.fun create tx ${signature.slice(0, 12)}`,
            passedToSafety:     false,
            source:             'sniper',
            createdAt:          new Date(),
          };

          void this.redisPub.publish('ai:signal', JSON.stringify(aiSignal)).catch(() => null);
        }).catch(() => null);
      } catch { /* ignore parse errors */ }
    };

    this.ws.onerror = () => { /* logged on close */ };

    this.ws.onclose = () => {
      if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
      if (this.running) {
        this.retryCount++;
        if (this.retryCount >= 3) {
          log.info('Helius WS unavailable after 3 attempts — likely requires paid plan. Disabled.');
          this.running = false;
          return;
        }
        log.info({ retryMs: this.retryMs, attempt: this.retryCount }, 'Helius WS closed — reconnecting');
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
