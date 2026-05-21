import { Bot, type Context } from 'grammy';
import { createLogger } from '@mpg2/shared';

const log = createLogger('telegram-notifier');

export class TelegramNotifier {
  private bot: Bot;

  constructor(token: string) {
    this.bot = new Bot(token);
    this.bot.catch(err => {
      log.warn({ err }, 'grammy error — bot continues polling');
    });
  }

  getBot(): Bot {
    return this.bot;
  }

  async send(chatId: number | string, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    } catch (err) {
      log.warn({ err, chatId }, 'Failed to send Telegram message');
    }
  }

  async sendAll(chatIds: Array<number | string>, text: string): Promise<void> {
    for (const id of chatIds) {
      await this.send(id, text);
      await new Promise(r => setTimeout(r, 50)); // avoid flood limits
    }
  }
}
