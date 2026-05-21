import { generate } from '../ollama/OllamaClient.js';
import { groqAnalyze } from '../groq/GroqClient.js';

const SYSTEM = `You are a crypto sentiment analyst. Given social media text about a cryptocurrency token,
output ONLY a JSON object with this exact shape:
{"sentiment": <number -1 to 1>, "authenticity": <number 0 to 1>, "keywords": [<string>, ...]}
- sentiment: -1 = very bearish, 0 = neutral, 1 = very bullish
- authenticity: 0 = obvious shill/spam, 1 = genuine organic post
- keywords: up to 5 key phrases extracted
Output ONLY valid JSON, no explanation.`;

export interface SentimentResult {
  sentiment:    number;
  authenticity: number;
  keywords:     string[];
}

// ─── Keyword heuristic (Ollama fallback) ──────────────────────────────────────

const BULL_TERMS = [
  'moon', 'pump', '100x', '1000x', 'gem', 'launch', 'bullish', 'breakout',
  'ath', 'rocket', 'rally', 'buy', 'hold', 'early', 'alpha', 'fire',
  'strong', 'massive', 'huge', 'hidden gem', 'undervalued', 'just launched',
  'new token', 'potential', 'mooning', 'printing', 'run',
];

const BEAR_TERMS = [
  'dump', 'rug', 'scam', 'dead', 'bearish', 'crash', 'exit',
  'avoid', 'dangerous', 'ponzi', 'honeypot', 'fake', 'rugpull',
];

const SPAM_RE = [
  /guaranteed/i, /dm me/i, /free tokens/i, /airdrop/i,
  /100\s*%\s*sure/i, /risk[\s-]free/i, /can't miss/i, /cannot miss/i,
];

function heuristicSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const bullCount = BULL_TERMS.filter(t => lower.includes(t)).length;
  const bearCount = BEAR_TERMS.filter(t => lower.includes(t)).length;
  const isSpam    = SPAM_RE.some(r => r.test(text));

  // Strong bull: 4+ terms → sentiment ≈ 1.0; bear terms doubly penalise
  const sentiment    = isSpam
    ? -0.3
    : Math.min(1, Math.max(-1, (bullCount - bearCount * 2) / 4));

  const authenticity = isSpam ? 0.15
    : bearCount > 0              ? 0.35
    : Math.min(0.88, 0.5 + bullCount * 0.1);

  const keywords = [
    ...BULL_TERMS.filter(t => lower.includes(t)),
    ...BEAR_TERMS.filter(t => lower.includes(t)),
  ].slice(0, 5);

  return { sentiment, authenticity, keywords };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  const truncated = text.slice(0, 500);

  // Tier 1: Groq (fast ~200ms, free tier)
  const groqResult = await groqAnalyze(truncated);
  if (groqResult) return groqResult;

  // Tier 2: Ollama (local LLM)
  try {
    const raw = await generate(truncated, { system: SYSTEM, temperature: 0.05 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? raw) as SentimentResult;
    return {
      sentiment:    clamp(Number(parsed.sentiment)    || 0,   -1, 1),
      authenticity: clamp(Number(parsed.authenticity) || 0.5,  0, 1),
      keywords:     Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
    };
  } catch {
    // Tier 3: keyword heuristics (always available)
    return heuristicSentiment(truncated);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
