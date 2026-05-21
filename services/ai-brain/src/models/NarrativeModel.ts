import { generate } from '../ollama/OllamaClient.js';

const SYSTEM = `You are a crypto narrative analyst. Given a list of recent posts about a token,
identify the dominant narrative and how fresh/novel it is.
Output ONLY a JSON object:
{"narrative": "<1-sentence summary>", "freshness": <0-1>, "trendScore": <0-1>}
- freshness: 1 = brand new narrative nobody has heard, 0 = totally recycled/old narrative
- trendScore: 1 = rapidly gaining attention, 0 = dying/stale
Output ONLY valid JSON.`;

export interface NarrativeResult {
  narrative:  string;
  freshness:  number;
  trendScore: number;
}

// ─── Heuristic fallback (no Ollama) ──────────────────────────────────────────

const NARRATIVE_BULL = [
  'moon', 'pump', 'gem', 'launch', 'bullish', 'breakout', 'ath', 'rocket',
  'rally', 'early', 'alpha', 'fire', 'massive', 'huge', 'potential', 'mooning',
];

const NARRATIVE_SIGNALS = [
  'pump.fun', 'new token', 'just launched', 'low cap', 'microcap',
  'degen', 'solana', 'meme', 'memecoin',
];

function heuristicNarrative(texts: string[]): NarrativeResult {
  const combined    = texts.join(' ').toLowerCase();
  const bullHits    = NARRATIVE_BULL.filter(t => combined.includes(t));
  const signalHits  = NARRATIVE_SIGNALS.filter(t => combined.includes(t));

  // More texts + more unique bull terms = more trending
  const trendScore = clamp(0.35 + (texts.length * 0.08) + (bullHits.length / 20), 0, 0.97);
  // More diverse signal terms = fresher narrative
  const freshness  = clamp(0.40 + (signalHits.length * 0.08) + (bullHits.length / 15), 0, 0.95);

  const topTerms = [...new Set([...bullHits, ...signalHits])].slice(0, 3).join(', ');
  const narrative = topTerms
    ? `Bullish momentum detected: ${topTerms}`
    : 'Market activity across multiple platforms';

  return { narrative, freshness, trendScore };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeNarrative(texts: string[]): Promise<NarrativeResult> {
  const combined = texts.slice(0, 10).join('\n---\n').slice(0, 1500);

  try {
    const raw = await generate(combined, { system: SYSTEM, temperature: 0.1 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? raw) as NarrativeResult;
    return {
      narrative:  String(parsed.narrative ?? 'unknown'),
      freshness:  clamp(Number(parsed.freshness)  || 0.5, 0, 1),
      trendScore: clamp(Number(parsed.trendScore) || 0.5, 0, 1),
    };
  } catch {
    // Ollama unavailable — derive trend from text volume and keyword density
    return heuristicNarrative(texts);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
