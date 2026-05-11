import 'dotenv/config';
import { createLogger } from '@mpg2/shared';
import { SandboxEngine } from './core/SandboxEngine.js';
import { SandboxBot } from './telegram/SandboxBot.js';

const log = createLogger('sandbox');

async function main() {
  log.info('Money Printer G2 — Sandbox starting...');

  const engine = new SandboxEngine();

  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    log.warn('TELEGRAM_BOT_TOKEN not set — running engine-only mode (no Telegram bot)');
    log.info('Sandbox engine ready. Connect via API or set TELEGRAM_BOT_TOKEN to enable bot.');
    await new Promise(() => {}); // keep alive
    return;
  }

  const bot = new SandboxBot(botToken, engine);

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await bot.start();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
