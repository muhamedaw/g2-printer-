import Groq from 'groq-sdk';
import { createLogger } from '@mpg2/shared';

const log = createLogger('groq-client');

let client: Groq | null = null;

function getClient(): Groq | null {
  if (client) return client;
  const key = process.env['GROQ_API_KEY'];
  if (!key) return null;
  client = new Groq({ apiKey: key });
  return client;
}

const SYSTEM = `You are a crypto sentiment analyst. Given social media text about a cryptocurrency token,
output ONLY a JSON object with this exact shape:
{"sentiment": <number -1 to 1>, "authenticity": <number 0 to 1>, "keywords": [<string>, ...]}
- sentiment: -1 = very bearish, 0 = neutral, 1 = very bullish
- authenticity: 0 = obvious shill/spam, 1 = genuine organic post
- keywords: up to 5 key phrases extracted
Output ONLY valid JSON, no explanation.`;

export interface GroqSentimentResult {
  sentiment:    number;
  authenticity: number;
  keywords:     string[];
}

export async function groqAnalyze(text: string): Promise<GroqSentimentResult | null> {
  const c = getClient();
  if (!c) return null;

  try {
    const completion = await c.chat.completions.create({
      model:       'llama-3.1-8b-instant',
      messages:    [
        { role: 'system',  content: SYSTEM },
        { role: 'user',    content: text.slice(0, 500) },
      ],
      temperature:  0.05,
      max_tokens:   120,
    });

    const raw = completion.choices[0]?.message.content ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as GroqSentimentResult;
    return {
      sentiment:    Math.min(1, Math.max(-1, Number(parsed.sentiment)    || 0)),
      authenticity: Math.min(1, Math.max( 0, Number(parsed.authenticity) || 0.5)),
      keywords:     Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
    };
  } catch (err) {
    log.debug({ err }, 'Groq analyze failed — falling back');
    return null;
  }
}

export function isGroqAvailable(): boolean {
  return !!process.env['GROQ_API_KEY'];
}
