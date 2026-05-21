import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { createLogger } from '@mpg2/shared';
import type { RawSignal } from '@mpg2/shared';
import { toRawSignal } from '../normalizers/engagement.js';
import type Redis from 'ioredis';

const log = createLogger('telegram-monitor');
const CHANNELS = ['solana_calls', 'solanagems', 'pumpfun_calls'];

export class TelegramMonitor {
  private client: TelegramClient | null = null;
  private running = false;

  constructor(private readonly redisPub: Redis) {}

  async start(): Promise<void> {
    const apiId   = Number(process.env['TELEGRAM_API_ID']);
    const apiHash = process.env['TELEGRAM_API_HASH'] ?? '';
    const session = process.env['TELEGRAM_SESSION'] ?? '';

    if (!apiId || !apiHash) {
      log.warn('TELEGRAM_API_ID/HASH not set — Telegram MTProto monitor disabled');
      return;
    }

    try {
      this.client = new TelegramClient(new StringSession(session), apiId, apiHash, {
        connectionRetries: 5,
      });
      await this.client.connect();
      log.info('Telegram MTProto connected');
      this.running = true;
      void this.poll();
    } catch (err) {
      log.warn({ err }, 'Telegram MTProto connect failed — monitor disabled');
    }
  }

  stop(): void {
    this.running = false;
    this.client?.disconnect();
  }

  private async poll(): Promise<void> {
    while (this.running && this.client) {
      for (const channel of CHANNELS) {
        try {
          const signals = await this.fetchChannel(channel);
          for (const s of signals) {
            await this.redisPub.publish('social:raw_signal', JSON.stringify(s));
          }
        } catch (err) {
          log.debug({ err, channel }, 'channel fetch failed');
        }
      }
      await new Promise(r => setTimeout(r, 30_000));
    }
  }

  private async fetchChannel(channel: string): Promise<RawSignal[]> {
    if (!this.client) return [];
    const messages = await this.client.getMessages(channel, { limit: 10 });
    return messages
      .filter(m => !!m.message)
      .map(m => toRawSignal({
        platform: 'telegram',
        text: m.message ?? '',
        authorUsername: channel,
        followers: 0,
        likes: 0,
        reposts: 0,
        replies: 0,
        views: (m as unknown as { views?: number }).views ?? 0,
        createdAt: new Date((m.date ?? 0) * 1000),
      }));
  }
}
