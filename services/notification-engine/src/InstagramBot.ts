import { IgApiClient } from 'instagram-private-api';
import Jimp from 'jimp';
import { createLogger } from '@mpg2/shared';
import type { Trade } from '@mpg2/shared';

const log = createLogger('instagram-bot');

const CRYPTO_HASHTAGS = ['#solana', '#memecoin', '#pumpfun', '#cryptogems', '#solanamemecoin', '#degen', '#newtoken'];

const FOLLOW_TARGETS = ['solana', 'pumpdotfun', 'raydium', 'jupiterexchange'];

export class InstagramBot {
  private ig: IgApiClient;
  private loggedIn = false;
  private myUserId: number | null = null;
  private redis: import('ioredis').Redis | null = null;

  setRedis(redis: import('ioredis').Redis): void { this.redis = redis; }

  private async logActivity(action: string, content: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.redis) return;
    const entry = JSON.stringify({ platform: 'instagram', action, content, ...meta, createdAt: new Date().toISOString() });
    await this.redis.lpush('social:activity', entry).catch(() => null);
    await this.redis.ltrim('social:activity', 0, 499).catch(() => null);
  }

  private lastPostAt = 0;
  private dailyPostCount = 0;
  private lastDayReset = new Date().toDateString();
  private readonly MAX_DAILY_POSTS = 8;
  private readonly MIN_POST_INTERVAL = 15 * 60 * 1000; // 15 min

  private seenMediaIds = new Set<string>();

  private loginFailed = false;

  constructor() {
    this.ig = new IgApiClient();
    this.ig.state.generateDevice(process.env['INSTAGRAM_USERNAME'] ?? 'mpg2bot');
  }

  private async ensureLogin(): Promise<boolean> {
    if (this.loggedIn) return true;
    if (this.loginFailed) return false;
    const user = process.env['INSTAGRAM_USERNAME'];
    const pass = process.env['INSTAGRAM_PASSWORD'];
    if (!user || !pass) {
      log.warn('INSTAGRAM credentials not set — bot disabled');
      this.loginFailed = true;
      return false;
    }
    try {
      await this.ig.simulate.preLoginFlow();
      const account = await this.ig.account.login(user, pass);
      this.myUserId = account.pk;
      await this.ig.simulate.postLoginFlow();
      this.loggedIn = true;
      log.info('Instagram login successful');
      return true;
    } catch (err) {
      log.warn({ err }, 'Instagram login failed — disabling bot');
      this.loginFailed = true;
      return false;
    }
  }

  private canPost(): boolean {
    const today = new Date().toDateString();
    if (today !== this.lastDayReset) { this.dailyPostCount = 0; this.lastDayReset = today; }
    if (this.dailyPostCount >= this.MAX_DAILY_POSTS) return false;
    if (Date.now() - this.lastPostAt < this.MIN_POST_INTERVAL) return false;
    return true;
  }

  // ─── Image generation ──────────────────────────────────────────────────────

  private async generateTradeImage(trade: Trade): Promise<Buffer> {
    const W = 1080, H = 1080;
    const img = new Jimp(W, H, 0x0f1117ff); // dark background

    // Green accent bar at top
    const accentColor = trade.tradeType === 'BUY' ? 0x00ff88ff : 0xff4444ff;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < 12; y++) img.setPixelColor(accentColor, x, y);
      for (let y = H - 12; y < H; y++) img.setPixelColor(accentColor, x, y);
    }

    // Load font and write text
    const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    const symbol = trade.tokenSymbol ?? trade.contractAddress.slice(0, 8);
    const action = trade.tradeType === 'BUY' ? '🚀 NEW POSITION' : '✅ POSITION CLOSED';
    const score  = Math.round(trade.finalScore * 100);

    img.print(font32, 60, 100, action);
    img.print(font32, 60, 180, `$${symbol}`);
    img.print(font16, 60, 260, `AI Score: ${score}/100`);
    img.print(font16, 60, 300, `Size: $${trade.usdAmount.toFixed(0)} (paper)`);

    if (trade.pnlPct && trade.pnlPct > 0) {
      img.print(font32, 60, 360, `+${trade.pnlPct.toFixed(1)}% Profit`);
      img.print(font16, 60, 420, `P&L: +$${(trade.pnlUsd ?? 0).toFixed(0)}`);
    }

    img.print(font16, 60, H - 120, 'Money Printer G2');
    img.print(font16, 60, H - 80,  '#Solana #Memecoin #CryptoAI');

    return img.getBufferAsync(Jimp.MIME_JPEG) as Promise<Buffer>;
  }

  // ─── Post announcement ─────────────────────────────────────────────────────

  async announceTrade(trade: Trade): Promise<void> {
    if (!this.canPost()) return;
    const ok = await this.ensureLogin();
    if (!ok) return;

    try {
      const imgBuffer = await this.generateTradeImage(trade);
      const symbol = trade.tokenSymbol ?? trade.contractAddress.slice(0, 8);
      const action = trade.tradeType === 'BUY' ? 'bought' : 'closed';
      const tags   = CRYPTO_HASHTAGS.join(' ');

      const caption = trade.tradeType === 'BUY'
        ? `🚀 Just ${action} $${symbol}\n📊 AI Score: ${Math.round(trade.finalScore * 100)}/100\n💰 $${trade.usdAmount.toFixed(0)} paper position\n\n${tags}`
        : `✅ Closed $${symbol} +${(trade.pnlPct ?? 0).toFixed(1)}%\n💰 +$${(trade.pnlUsd ?? 0).toFixed(0)} paper\n\n${tags}`;

      await this.ig.publish.photo({ file: imgBuffer, caption });
      this.lastPostAt = Date.now();
      this.dailyPostCount++;
      log.info({ symbol, action }, 'Instagram post published');
      await this.logActivity('post', caption.slice(0, 120), { symbol, tradeType: trade.tradeType });
    } catch (err) {
      log.warn({ err }, 'Instagram post failed');
      if (String(err).includes('login_required')) { this.loggedIn = false; this.loginFailed = true; }
    }
  }

  // ─── Hashtag engagement ────────────────────────────────────────────────────

  async engageWithHashtags(): Promise<void> {
    const ok = await this.ensureLogin();
    if (!ok) return;

    const tags = ['memecoin', 'solana', 'pumpfun', 'cryptogems'];
    for (const tag of tags) {
      try {
        const feed  = this.ig.feed.tag(tag);
        const posts = await feed.items();

        for (const post of posts.slice(0, 5)) {
          const mediaId = String(post.pk ?? post.id);
          if (this.seenMediaIds.has(mediaId)) continue;
          this.seenMediaIds.add(mediaId);

          await this.ig.media.like({ mediaId, moduleInfo: { module_name: 'feed_timeline' }, d: 0 });
          await this.logActivity('like', `#${tag}`, { mediaId });
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
        }
        log.debug({ tag }, 'Instagram hashtag engagement done');
      } catch (err) {
        log.debug({ err, tag }, 'Instagram hashtag engagement failed');
        if (String(err).includes('login_required')) { this.loggedIn = false; this.loginFailed = true; break; }
      }
      await new Promise(r => setTimeout(r, 5000));
    }

    // Bound seen set
    if (this.seenMediaIds.size > 2000) {
      this.seenMediaIds = new Set([...this.seenMediaIds].slice(-1000));
    }
  }

  // ─── Follow key accounts ───────────────────────────────────────────────────

  async followCryptoAccounts(): Promise<void> {
    const ok = await this.ensureLogin();
    if (!ok) return;

    for (const username of FOLLOW_TARGETS) {
      try {
        const user = await this.ig.user.searchExact(username);
        await this.ig.friendship.create(user.pk);
        log.debug({ username }, 'Followed Instagram account');
        await this.logActivity('follow', `@${username}`, { target: username });
        await new Promise(r => setTimeout(r, 3000));
      } catch { /* already following or not found */ }
    }
  }
}
