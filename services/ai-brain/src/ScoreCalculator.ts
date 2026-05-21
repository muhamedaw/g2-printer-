import type { RawSignal, AiSignal } from '@mpg2/shared';
import { DEFAULT_RISK, createLogger } from '@mpg2/shared';
import { analyzeSentiment } from './models/SentimentModel.js';
import { analyzeNarrative }  from './models/NarrativeModel.js';

const log = createLogger('score-calculator');

const W = DEFAULT_RISK.AI_WEIGHTS;
const PW = DEFAULT_RISK.PLATFORM_WEIGHTS;

export async function calculateAiScore(
  contractAddress: string,
  signals: RawSignal[],
): Promise<AiSignal | null> {
  if (signals.length === 0) return null;

  const texts = signals.map(s => s.content);

  let sentimentAvg = 0;
  let authenticityAvg = 0;
  let keywords: string[] = [];

  // Sample up to 5 signals for sentiment (LLM is slow)
  const sample = signals.slice(0, 5);
  const sentimentResults = await Promise.all(sample.map(s => analyzeSentiment(s.content).catch(() => ({
    sentiment: 0, authenticity: 0.5, keywords: [] as string[],
  }))));

  for (const r of sentimentResults) {
    sentimentAvg    += r.sentiment;
    authenticityAvg += r.authenticity;
    keywords = [...keywords, ...r.keywords];
  }
  sentimentAvg    /= sentimentResults.length;
  authenticityAvg /= sentimentResults.length;

  let narrative: { freshness: number; trendScore: number; narrative: string };
  try {
    narrative = await analyzeNarrative(texts);
  } catch {
    narrative = { freshness: 0.5, trendScore: 0.5, narrative: 'unknown' };
  }

  const platformsDetected = [...new Set(signals.map(s => s.platform))];
  const uniqueAuthors     = [...new Set(signals.map(s => s.authorUsername))];
  const avgEngagement     = signals.reduce((s, sig) => s + sig.engagementScore, 0) / signals.length;
  const influencerCount   = signals.filter(s => s.authorFollowers > 10_000).length;

  // Component scores (0-100)
  const sentimentScore     = ((sentimentAvg + 1) / 2) * 100;   // -1..1 → 0..100
  const authenticityScore  = authenticityAvg * 100;
  const trendScore         = narrative.trendScore * 100;
  const narrativeFreshness = narrative.freshness * 100;
  const engagementScore    = Math.min(avgEngagement * 2, 100);

  // Platform-weighted signal boost: each platform contributes its weight
  const platformBoostRaw = platformsDetected.reduce((sum, p) => {
    const key = p as keyof typeof PW;
    return sum + (PW[key] ?? 1.0);
  }, 0) / Math.max(platformsDetected.length, 1);

  // Multi-platform bonus: only genuine cross-platform signals earn this.
  // Doubled signals from same scraper (dexscreener, geckoterminal) have 1 unique author
  // → bonus = 0. True organic discussion (Twitter + Telegram + News) earns full bonus.
  const genuinePlatforms = uniqueAuthors.length >= 2 ? platformsDetected.length : 1;
  const multiPlatformBonus = genuinePlatforms >= 3 ? 8
    : genuinePlatforms === 2 ? 4
    : 0;

  // Base weighted score using DEFAULT_RISK.AI_WEIGHTS constants
  let finalAiScore = (
    sentimentScore     * W.sentiment         +
    authenticityScore  * W.authenticity      +
    trendScore         * W.trend             +
    narrativeFreshness * W.narrativeFreshness +
    engagementScore    * W.engagement
  );

  // Apply platform quality multiplier (0.85–1.15 range)
  finalAiScore *= (0.7 + platformBoostRaw * 0.3);

  // Add multi-platform bonus
  finalAiScore = Math.min(finalAiScore + multiPlatformBonus, 100);

  // Spam gate: if authenticity < 25, post is likely bot/shill — heavy penalty
  if (authenticityScore < 25) {
    finalAiScore *= 0.55;
  }

  log.debug({
    contractAddress,
    finalAiScore:    finalAiScore.toFixed(1),
    authenticity:    authenticityScore.toFixed(0),
    platforms:       platformsDetected.length,
    platformBoost:   platformBoostRaw.toFixed(2),
    multiBonus:      multiPlatformBonus,
  }, 'AI score calculated');

  return {
    contractAddress,
    tokenSymbol:      undefined, // enriched by trade-engine from token:{mint}:symbol cache
    sentimentScore,
    authenticityScore,
    trendScore,
    narrativeFreshness,
    finalAiScore,
    platformsDetected,
    platformCount:    platformsDetected.length,
    influencerCount,
    reasoning: `${narrative.narrative}. Keywords: ${[...new Set(keywords)].slice(0, 5).join(', ')}`,
    passedToSafety:  false,
    createdAt:       new Date(),
  };
}
