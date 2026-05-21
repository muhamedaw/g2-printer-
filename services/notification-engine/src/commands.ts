import { type Bot, type Context } from 'grammy';
import { createLogger } from '@mpg2/shared';
import type Redis from 'ioredis';
import type { Position, Trade } from '@mpg2/shared';
import { formatPosition, formatPortfolioSummary } from './formatters.js';

const log = createLogger('bot-commands');

// Map Telegram chat ID → userId (simple single-tenant for now)
function userId(ctx: Context): string {
  return String(ctx.chat?.id ?? 'unknown');
}

export function registerCommands(bot: Bot, redis: Redis): void {

  bot.command('start', async ctx => {
    const chatId = ctx.chat.id;
    await redis.sadd('users:live_trading', String(chatId));
    await redis.set(`user:${chatId}:chat_id`, String(chatId));
    await ctx.reply(
      '👋 <b>Money Printer G2</b>\n\n' +
      '✅ تم تسجيلك — البوت يراقبك الآن.\n\n' +
      '/status — حالة النظام\n' +
      '/positions — المراكز المفتوحة\n' +
      '/pnl — الأرباح والخسائر\n' +
      '/debug — تشخيص النظام\n' +
      '/help — جميع الأوامر',
      { parse_mode: 'HTML' },
    );
  });

  bot.command('help', async ctx => {
    await ctx.reply(
      '📖 <b>الأوامر</b>\n\n' +
      '<b>📊 المراقبة</b>\n' +
      '/status — حالة النظام والمحفظة\n' +
      '/positions — المراكز المفتوحة + TP/SL\n' +
      '/pnl — الأرباح والخسائر اليوم وكل الوقت\n' +
      '/journal — آخر 10 صفقات مغلقة\n' +
      '/stats — أداء كل مصدر إشارة\n' +
      '/wallets — أفضل محافظ copy-trade\n' +
      '/debug — تشخيص لماذا لا تحدث صفقات\n\n' +
      '<b>🎮 التحكم</b>\n' +
      '/stop — إيقاف فتح صفقات جديدة\n' +
      '/resume — استئناف التداول\n' +
      '/close [mint] — إغلاق مركز يدويًا\n' +
      '/watch [mint] — شراء يدوي لتوكن\n\n' +
      '<b>🚨 الطوارئ</b>\n' +
      '/emergency — إيقاف طارئ فوري\n' +
      '/resume_all — إلغاء الإيقاف الطارئ',
      { parse_mode: 'HTML' },
    );
  });

  bot.command('status', async ctx => {
    const uid = userId(ctx);
    const [openCountRaw, portfolioRaw, paused] = await Promise.all([
      redis.scard(`positions:${uid}`),
      redis.get(`portfolio:${uid}:usd`),
      redis.get(`trading:${uid}:paused`),
    ]);

    const portfolioUsd = portfolioRaw ? parseFloat(portfolioRaw) : 0;
    const statusIcon = paused ? '⏸️' : '▶️';

    await ctx.reply(
      `${statusIcon} <b>حالة النظام</b>\n\n` +
      `💼 المراكز المفتوحة: ${openCountRaw}\n` +
      `💵 قيمة المحفظة: $${portfolioUsd.toFixed(2)}\n` +
      `🤖 وضع التداول: ${paused ? 'متوقف' : 'نشط'}`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('positions', async ctx => {
    const uid = userId(ctx);
    const mints = await redis.smembers(`positions:${uid}`);

    if (mints.length === 0) {
      await ctx.reply('لا توجد مراكز مفتوحة حاليًا.');
      return;
    }

    const lines: string[] = [];
    for (const mint of mints) {
      const raw = await redis.hget(`position:${uid}:${mint}`, 'data');
      if (!raw) continue;
      lines.push(formatPosition(JSON.parse(raw) as Position));
    }

    await ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
  });

  bot.command('pnl', async ctx => {
    const uid = userId(ctx);
    const mints = await redis.smembers(`positions:${uid}`);
    const positions: Position[] = [];
    for (const mint of mints) {
      const raw = await redis.hget(`position:${uid}:${mint}`, 'data');
      if (raw) positions.push(JSON.parse(raw) as Position);
    }

    const tradesRaw = await redis.lrange(`trades:${uid}`, 0, 199);
    const trades = tradesRaw.map(r => JSON.parse(r) as Trade);

    await ctx.reply(formatPortfolioSummary(positions, trades), { parse_mode: 'HTML' });
  });

  bot.command('stop', async ctx => {
    const uid = userId(ctx);
    await redis.set(`trading:${uid}:paused`, '1');
    log.info({ uid }, 'Trading paused by user');
    await ctx.reply('⏸️ تم إيقاف فتح صفقات جديدة. المراكز الحالية لا تزال تُراقَب.');
  });

  bot.command('resume', async ctx => {
    const uid = userId(ctx);
    await redis.del(`trading:${uid}:paused`);
    log.info({ uid }, 'Trading resumed by user');
    await ctx.reply('▶️ تم استئناف التداول.');
  });

  bot.command('close', async ctx => {
    const uid = userId(ctx);
    const mint = ctx.match?.trim();
    if (!mint) { await ctx.reply('الاستخدام: /close <mint_address>'); return; }

    await redis.publish('trade:manual_close', JSON.stringify({ userId: uid, contractAddress: mint }));
    await ctx.reply(`⚡ طلب إغلاق مرسل لـ ${mint.slice(0, 8)}…`);
  });

  bot.command('emergency', async ctx => {
    await redis.set('system:emergency_stop', '1');
    await redis.publish('system:emergency', JSON.stringify({ triggeredBy: String(ctx.chat?.id), at: new Date().toISOString() }));
    log.warn({ chatId: ctx.chat?.id }, 'EMERGENCY STOP activated via Telegram');
    await ctx.reply(
      '🚨 <b>EMERGENCY STOP ACTIVE</b>\n\n' +
      'جميع الإشارات الجديدة محجوبة.\n' +
      'المراكز المفتوحة لا تزال تُراقَب وتُغلق تلقائياً.\n\n' +
      'لإعادة التداول: /resume_all',
      { parse_mode: 'HTML' },
    );
  });

  bot.command('resume_all', async ctx => {
    await redis.del('system:emergency_stop');
    log.info({ chatId: ctx.chat?.id }, 'Emergency stop cleared via Telegram');
    await ctx.reply('✅ Emergency stop مُزال — التداول مُستأنَف.');
  });

  bot.command('debug', async ctx => {
    const uid = userId(ctx);

    const today = new Date().toISOString().slice(0, 10);
    const [
      paused,
      emergencyStop,
      consecutiveLosses,
      circuitHighThreshold,
      openCount,
      planTier,
      outcomesCount,
      regimeRaw,
      solChange24h,
      solPrice,
      funnelReceived,
      funnelSecPassed,
      funnelRiskPassed,
      funnelBuys,
      funnelAiPassed,
      funnelAiFiltered,
      portfolioRaw,
      dailyLossRaw,
      drawdownPeakRaw,
    ] = await Promise.all([
      redis.get(`trading:${uid}:paused`),
      redis.get('system:emergency_stop'),
      redis.get(`circuit:${uid}:consecutive_losses`),
      redis.get('circuit:global:high_threshold'),
      redis.scard(`positions:${uid}`),
      redis.get(`user:${uid}:plan`),
      redis.llen('learning:outcomes'),
      redis.get('market:regime'),
      redis.get('market:sol_price_change_24h'),
      redis.get('sol:price_usd'),
      redis.get('stats:daily:signals_received'),
      redis.get('stats:daily:security_passed'),
      redis.get('stats:daily:risk_passed'),
      redis.get('stats:daily:buys_executed'),
      redis.get('stats:daily:ai_passed'),
      redis.get('stats:daily:ai_filtered'),
      redis.get(`portfolio:${uid}:usd`),
      redis.get(`risk:daily_loss:${uid}:${today}`),
      redis.get(`risk:drawdown:${uid}:peak`),
    ]);

    // Compute current multiplier (EV-based formula matching SelfLearner.getScoreMultiplier)
    let multiplierText = 'N/A (&lt; 20 صفقة)';
    try {
      const raw = await redis.lrange('learning:outcomes', 0, 199);
      if (raw.length >= 20) {
        const outcomes = raw.map(r => JSON.parse(r) as { aiScore: number; pnlPct: number })
          .filter(o => o.aiScore >= 70);
        if (outcomes.length >= 5) {
          const wr     = outcomes.filter(o => o.pnlPct > 0).length / outcomes.length;
          const avgPnl = outcomes.reduce((s, o) => s + o.pnlPct, 0) / outcomes.length;
          const mult   = avgPnl > 0.10 ? 1.05 : avgPnl > 0 ? 1.0 : Math.min(Math.max(wr / 0.50, 0.95), 1.0);
          const evText = avgPnl > 0 ? `EV +${(avgPnl * 100).toFixed(0)}%` : `EV ${(avgPnl * 100).toFixed(0)}%`;
          multiplierText = `${mult.toFixed(2)} | WR ${(wr * 100).toFixed(0)}% | ${evText}`;
        }
      }
    } catch { /* ignore */ }

    const maxPos = { free: 3, starter: 5, pro: 10, whale: 25 }[planTier ?? 'free'] ?? 3;

    // Compute peak hours status (matches risk-engine tradingHoursScoreFloor)
    const utcHour = new Date().getUTCHours();
    const isPeak  = (utcHour >= 13 && utcHour < 18) || (utcHour >= 20);
    const minScore = 85 + (isPeak ? 0 : 2); // off-peak +2 (matches risk-engine tradingHoursScoreFloor)

    // High threshold circuit TTL in minutes
    const htMinutes = circuitHighThreshold
      ? Math.ceil((await redis.ttl('circuit:global:high_threshold')) / 60)
      : 0;

    // Parse regime
    const regimeData = regimeRaw ? JSON.parse(regimeRaw) as { regime: string; minScore: number } : null;
    const regimeText = regimeData ? `${regimeData.regime} (min ${regimeData.minScore})` : 'SIDEWAYS (لم يُحدَّث بعد)';
    const solChangeNum = solChange24h ? parseFloat(solChange24h) : null;
    const solChangeText = solChangeNum != null
      ? `${solChangeNum > 0 ? '+' : ''}${solChangeNum.toFixed(1)}% (${solChangeNum > 3 ? '🐂 bull' : solChangeNum < -3 ? '🐻 bear' : '➡️ sideways'})`
      : 'لم يُحدَّث بعد';
    const solPriceText  = solPrice ? `$${parseFloat(solPrice).toFixed(1)}` : 'N/A';

    // Risk guards status
    const portfolioUsd  = portfolioRaw ? parseFloat(portfolioRaw) : 1000;
    const dailyLossUsd  = dailyLossRaw ? parseFloat(dailyLossRaw) : 0;
    const dailyLimitUsd = portfolioUsd * 0.10; // DEFAULT_RISK.DAILY_LOSS_LIMIT_PCT = 10%
    const dailyLossPct  = (dailyLossUsd / dailyLimitUsd * 100).toFixed(0);
    const drawdownPeak  = drawdownPeakRaw ? parseFloat(drawdownPeakRaw) : portfolioUsd;
    const drawdownPct   = drawdownPeak > 0 ? ((drawdownPeak - portfolioUsd) / drawdownPeak * 100).toFixed(1) : '0.0';
    const weeklyLimit   = 20; // DEFAULT_RISK.WEEKLY_LOSS_LIMIT_PCT = 20%

    // Check which sources are auto-disabled (negative EV circuit)
    const sources = ['sniper', 'social', 'copy_trade', 'pump_graduation'];
    const srcDisabledTtls = await Promise.all(sources.map(s =>
      redis.ttl(`circuit:source:${s}:disabled`).then(ttl => ttl > 0 ? `${s}(${Math.ceil(ttl / 60)}m)` : null).catch(() => null),
    ));
    const disabledSources = srcDisabledTtls.filter(Boolean);
    const disabledText = disabledSources.length > 0 ? `🔴 ${disabledSources.join(', ')}` : '✅ جميعها نشطة';

    const lines = [
      `🔍 <b>Debug — نظام التداول</b>\n`,
      `🤖 التداول: ${paused ? '⏸️ متوقف' : '▶️ نشط'}`,
      `🚨 Emergency stop: ${emergencyStop ? '🔴 مفعّل' : '✅ معطّل'}`,
      `⚡ Circuit (خسائر متتالية): ${consecutiveLosses ?? 0}/3`,
      `📊 Circuit (high threshold): ${circuitHighThreshold ? `🔴 نشط — ${htMinutes} دقيقة متبقية (≥ 90)` : '✅ معطّل'}`,
      `🚫 المصادر المعطَّلة (EV سلبي): ${disabledText}`,
      `📉 Daily loss guard: $${dailyLossUsd.toFixed(1)} / $${dailyLimitUsd.toFixed(1)} (${dailyLossPct}%)`,
      `📉 Drawdown: ${drawdownPct}% من القمة (حد: ${weeklyLimit}%)`,
      `📈 Score multiplier: ${multiplierText}`,
      `🌐 Regime: ${regimeText}`,
      `💲 SOL: ${solPriceText} | 24h: ${solChangeText}`,
      `📂 المراكز المفتوحة: ${openCount}/${maxPos} (plan: ${planTier ?? 'free'})`,
      `🧠 بيانات التعلم: ${outcomesCount} صفقة`,
      `\n⚙️ الحد الأدنى للـ score: ${minScore} (${isPeak ? '✅ peak hours' : '⏰ off-peak +2'})`,
      `🎯 Sniper: mcap ≥ 30 SOL | SL -15% | exit -8%@10m / -10%@20m`,
      `💹 TPs: TP1 1.5x(30%) | TP2 3x(30%) | TP3 6x(30%) | trailing 15%`,
      `\n📡 <b>Signal Funnel (today)</b>`,
      `🧠 Social→AI: ${funnelAiPassed ?? 0} passed | ${funnelAiFiltered ?? 0} filtered`,
      `Received: ${funnelReceived ?? 0} → Security: ${funnelSecPassed ?? 0} → Risk: ${funnelRiskPassed ?? 0} → Buys: ${funnelBuys ?? 0}`,
    ];

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('watch', async ctx => {
    const uid  = userId(ctx);
    const mint = ctx.match?.trim();
    if (!mint || mint.length < 32) {
      await ctx.reply('الاستخدام: /watch <mint_address>\nمثال: /watch ABC123...pump');
      return;
    }
    // Publish as manual AI signal → goes through security → risk → trade-engine
    const aiSignal = {
      contractAddress:    mint,
      sentimentScore:     80,
      authenticityScore:  80,
      trendScore:         80,
      narrativeFreshness: 80,
      finalAiScore:       88,
      platformsDetected:  ['news' as const],
      platformCount:      1,
      influencerCount:    0,
      reasoning:          `Manual watch by ${uid}`,
      passedToSafety:     false,
      source:             'manual' as const,
      createdAt:          new Date(),
    };
    await redis.publish('ai:signal', JSON.stringify(aiSignal));
    await ctx.reply(`👀 إرسال إشارة يدوية لـ ${mint.slice(0, 8)}… — ستصل إشعار الشراء قريباً إذا نجحت الفحوصات.`);
    log.info({ uid, mint: mint.slice(0, 8) }, 'Manual watch signal submitted');
  });

  bot.command('journal', async ctx => {
    const uid = userId(ctx);
    const tradesRaw = await redis.lrange(`trades:${uid}`, 0, 49);
    const closed = tradesRaw
      .map(r => JSON.parse(r) as Trade)
      .filter(t => t.pnlUsd !== undefined && t.tradeType !== 'BUY')
      .slice(0, 10);

    if (closed.length === 0) {
      await ctx.reply('لا توجد صفقات مغلقة بعد.');
      return;
    }

    const exitShort: Record<string, string> = {
      SELL_TP1: 'TP1', SELL_TP2: 'TP2', SELL_TP3: 'TP3',
      SELL_STOP_LOSS: 'SL', SELL_TRAILING: 'Trail', SELL_TIMEOUT: 'Time',
      SELL_MANUAL: 'Manual', SELL_DEV_RUG: 'Rug',
    };
    const srcEmoji: Record<string, string> = {
      sniper: '🎯', copy_trade: '👤', pump_graduation: '🎓', social: '📡',
    };

    const lines = [`📓 <b>آخر ${closed.length} صفقة مغلقة</b>\n`];
    for (const t of closed) {
      const pnlPct  = ((t.pnlPct ?? 0) * 100).toFixed(1);
      const pnlUsd  = (t.pnlUsd ?? 0).toFixed(2);
      const sign    = (t.pnlPct ?? 0) >= 0 ? '🟢' : '🔴';
      const sym     = t.tokenSymbol ?? `${t.contractAddress.slice(0, 6)}…`;
      const exit    = exitShort[t.tradeType] ?? t.tradeType;
      const src     = srcEmoji[t.source ?? 'social'] ?? '📌';
      const time    = new Date(t.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      lines.push(`${sign} <b>${sym}</b> ${pnlPct}% ($${pnlUsd}) — ${exit} ${src} ${time}`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('stats', async ctx => {
    const uid = userId(ctx);
    const tradesRaw = await redis.lrange(`trades:${uid}`, 0, 499);
    const trades = tradesRaw.map(r => JSON.parse(r) as Trade).filter(t => t.pnlUsd !== undefined && t.pnlPct !== undefined);

    if (trades.length === 0) {
      await ctx.reply('لا توجد صفقات مغلقة بعد.');
      return;
    }

    type SourceStats = { wins: number; total: number; winPnlSum: number; lossPnlSum: number };
    const bySource = new Map<string, SourceStats>();
    for (const t of trades) {
      const src = t.source ?? 'social';
      const s = bySource.get(src) ?? { wins: 0, total: 0, winPnlSum: 0, lossPnlSum: 0 };
      s.total++;
      const pct = (t.pnlPct ?? 0) * 100;
      if (pct > 0) { s.wins++; s.winPnlSum += pct; }
      else { s.lossPnlSum += Math.abs(pct); }
      bySource.set(src, s);
    }

    const sourceEmoji: Record<string, string> = {
      social: '📡', sniper: '🎯', copy_trade: '👤', pump_graduation: '🎓',
    };

    const lines = [`📊 <b>Source Performance</b> (last ${trades.length} trades)\n`];
    for (const [src, s] of bySource) {
      const wr      = s.wins / s.total;
      const avgWin  = s.wins > 0 ? s.winPnlSum / s.wins : 0;
      const avgLoss = (s.total - s.wins) > 0 ? s.lossPnlSum / (s.total - s.wins) : 0;
      // EV = WR × avgWin - (1-WR) × avgLoss (expected % per trade)
      const ev      = wr * avgWin - (1 - wr) * avgLoss;
      const evSign  = ev >= 0 ? '🟢' : '🔴';
      const emoji   = sourceEmoji[src] ?? '📌';
      lines.push(
        `${emoji} <b>${src}</b>  ${s.total} صفقة\n` +
        `  WR ${(wr * 100).toFixed(0)}%  |  ${evSign} EV ${ev >= 0 ? '+' : ''}${ev.toFixed(1)}%/صفقة\n` +
        `  avg win +${avgWin.toFixed(0)}%  |  avg loss -${avgLoss.toFixed(0)}%`,
      );
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('wallets', async ctx => {
    // Show top copy-trade wallets by win rate (requires ≥ 3 closed trades)
    const keys = await redis.keys('copy_trade:wallet:*:total');
    type WalletStat = { addr: string; name: string; total: number; wins: number; wr: number };
    const stats: WalletStat[] = [];

    for (const key of keys) {
      const addr  = key.replace('copy_trade:wallet:', '').replace(':total', '');
      const total = parseInt(await redis.get(key) ?? '0', 10);
      if (total < 3) continue;
      const wins  = parseInt(await redis.get(`copy_trade:wallet:${addr}:wins`) ?? '0', 10);
      const name  = await redis.get(`copy_trade:wallet:${addr}:name`) ?? addr.slice(0, 8);
      stats.push({ addr, name, total, wins, wr: wins / total });
    }

    if (stats.length === 0) {
      await ctx.reply('لا توجد بيانات أداء كافية بعد (< 3 صفقات لكل محفظة).');
      return;
    }

    stats.sort((a, b) => b.wr - a.wr);
    const top = stats.slice(0, 15);

    const lines = [`👤 <b>أفضل محافظ Copy-Trade</b> (${stats.length} محفظة مع بيانات)\n`];
    for (const s of top) {
      const wr  = (s.wr * 100).toFixed(0);
      const icon = s.wr >= 0.60 ? '🟢' : s.wr >= 0.40 ? '🟡' : '🔴';
      lines.push(`${icon} <b>${s.name}</b>: ${s.wins}/${s.total} (${wr}%)`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.on('message', async ctx => {
    log.debug({ chatId: ctx.chat?.id }, 'Unhandled message');
  });
}
