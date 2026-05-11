import { Bot, type Context } from 'grammy';
import { SandboxEngine } from '../core/SandboxEngine.js';
import { parseDuration, formatUsd, formatDuration } from '@mpg2/shared';
import { createLogger } from '@mpg2/shared';

const log = createLogger('sandbox-bot');

export class SandboxBot {
  private bot: Bot;
  private engine: SandboxEngine;

  constructor(token: string, engine: SandboxEngine) {
    this.bot = new Bot(token);
    this.engine = engine;
    this.registerCommands();
  }

  private registerCommands(): void {
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
    this.bot.command('sim', this.handleSim.bind(this));
    this.bot.command('status', this.handleStatus.bind(this));
    this.bot.command('positions', this.handlePositions.bind(this));
    this.bot.command('trades', this.handleTrades.bind(this));
    this.bot.command('stop', this.handleStop.bind(this));
    this.bot.command('report', this.handleReport.bind(this));
  }

  private async handleStart(ctx: Context): Promise<void> {
    await ctx.reply([
      '🤖 *Money Printer G2 — Sandbox*',
      '',
      'Welcome to the paper trading simulator.',
      'Scan real Solana tokens, apply real scoring, execute fake trades.',
      '',
      'Use /help to see all commands.',
    ].join('\n'), { parse_mode: 'Markdown' });
  }

  private async handleHelp(ctx: Context): Promise<void> {
    await ctx.reply([
      '📖 *Commands*',
      '',
      '`/sim <amount> <duration>` — Start a simulation',
      '  Examples: `/sim 100 2h` `/sim 500 30m` `/sim 1000 1d`',
      '',
      '`/status` — Current capital & open positions',
      '`/positions` — Open positions with P&L',
      '`/trades` — Last 10 trades',
      '`/report` — Full session report',
      '`/stop` — Stop current session early',
    ].join('\n'), { parse_mode: 'Markdown' });
  }

  private async handleSim(ctx: Context): Promise<void> {
    const userId = String(ctx.from?.id ?? 'unknown');

    const existing = this.engine.getActiveSession(userId);
    if (existing) {
      await ctx.reply('⚠️ You already have a running simulation. Use /stop to end it first.');
      return;
    }

    const args = ctx.message?.text?.split(' ').slice(1) ?? [];
    const capital = parseFloat(args[0] ?? '');
    const duration = parseDuration(args[1] ?? '');

    if (isNaN(capital) || capital < 10 || capital > 100_000) {
      await ctx.reply('❌ Invalid amount. Use between $10 and $100,000.\nExample: `/sim 100 2h`', { parse_mode: 'Markdown' });
      return;
    }
    if (!duration || duration < 60_000 || duration > 7 * 86_400_000) {
      await ctx.reply('❌ Invalid duration. Range: 1m to 7d.\nExample: `/sim 100 2h`', { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply('🚀 Starting simulation...', { parse_mode: 'Markdown' });

    const state = await this.engine.createSession({
      userId,
      startingCapital: capital,
      durationMs: duration,
    });

    await ctx.reply([
      `✅ *Simulation Started*`,
      ``,
      `💰 Capital: ${formatUsd(capital)}`,
      `⏱ Duration: ${formatDuration(duration)}`,
      `🎯 Take Profit: 50% | Stop Loss: 20%`,
      `📊 Max Positions: 5`,
      `🔍 Min Score: 60/100`,
      ``,
      `Session ID: \`${state.config.sessionId}\``,
      ``,
      `The bot will scan for opportunities every 60 seconds.`,
      `Use /status to check progress.`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const userId = String(ctx.from?.id ?? 'unknown');
    const session = this.engine.getActiveSession(userId);
    if (!session) {
      await ctx.reply('No active simulation. Start one with `/sim 100 2h`', { parse_mode: 'Markdown' });
      return;
    }
    const text = this.engine.getStatus(session.config.sessionId);
    await ctx.reply(text ?? 'No data.', { parse_mode: 'Markdown' });
  }

  private async handlePositions(ctx: Context): Promise<void> {
    const userId = String(ctx.from?.id ?? 'unknown');
    const session = this.engine.getActiveSession(userId);
    if (!session) {
      await ctx.reply('No active simulation.');
      return;
    }

    const positions = [...session.openPositions.values()];
    if (positions.length === 0) {
      await ctx.reply('No open positions yet.');
      return;
    }

    const lines = positions.map(p => {
      const sign = p.pnlPercent >= 0 ? '🟢' : '🔴';
      return `${sign} *${p.tokenSymbol}*\n  Entry: $${p.entryPrice.toFixed(6)} → Now: $${p.currentPrice.toFixed(6)}\n  P&L: ${p.pnlPercent >= 0 ? '+' : ''}${p.pnlPercent.toFixed(2)}% (${formatUsd(p.pnlUsd)})\n  Score: ${p.score}/100`;
    });

    await ctx.reply(`📊 *Open Positions (${positions.length})*\n\n${lines.join('\n\n')}`, { parse_mode: 'Markdown' });
  }

  private async handleTrades(ctx: Context): Promise<void> {
    const userId = String(ctx.from?.id ?? 'unknown');
    const session = this.engine.getActiveSession(userId);
    if (!session) {
      await ctx.reply('No active simulation.');
      return;
    }

    const sells = session.closedTrades.filter(t => t.action === 'SELL').slice(-10).reverse();
    if (sells.length === 0) {
      await ctx.reply('No completed trades yet.');
      return;
    }

    const lines = sells.map(t => {
      const sign = (t.pnlPercent ?? 0) >= 0 ? '✅' : '❌';
      return `${sign} ${t.tokenSymbol} | ${(t.pnlPercent ?? 0) >= 0 ? '+' : ''}${(t.pnlPercent ?? 0).toFixed(1)}% | ${t.exitReason}`;
    });

    await ctx.reply(`🔢 *Last Trades*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  }

  private async handleStop(ctx: Context): Promise<void> {
    const userId = String(ctx.from?.id ?? 'unknown');
    const session = this.engine.getActiveSession(userId);
    if (!session) {
      await ctx.reply('No active simulation to stop.');
      return;
    }

    await ctx.reply('🛑 Stopping simulation...');
    await this.engine.stopSession(session.config.sessionId);
    const report = this.engine.getReport(session.config.sessionId);
    await ctx.reply(report ?? 'Session stopped.', { parse_mode: 'Markdown' });
  }

  private async handleReport(ctx: Context): Promise<void> {
    const userId = String(ctx.from?.id ?? 'unknown');
    const session = this.engine.getActiveSession(userId);
    if (!session) {
      await ctx.reply('No active simulation.');
      return;
    }
    const report = this.engine.getReport(session.config.sessionId);
    await ctx.reply(report ?? 'No report yet.', { parse_mode: 'Markdown' });
  }

  async start(): Promise<void> {
    log.info('Starting Telegram bot...');
    await this.bot.start({
      onStart: () => log.info('Sandbox bot is running'),
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
