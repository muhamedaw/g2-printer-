import { Ollama } from 'ollama';
import { createLogger } from '@mpg2/shared';

const log = createLogger('ollama-client');

const DEFAULT_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.2:3b';
const OLLAMA_HOST   = process.env['OLLAMA_HOST']  ?? 'http://localhost:11434';

const ollama = new Ollama({ host: OLLAMA_HOST });

export interface GenerateOptions {
  model?: string;
  system?: string;
  temperature?: number;
}

export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  try {
    const req = {
      model,
      prompt,
      options: { temperature: opts.temperature ?? 0.1 },
      ...(opts.system ? { system: opts.system } : {}),
    };
    const res = await ollama.generate(req);
    return res.response.trim();
  } catch (err) {
    log.warn({ err, model }, 'Ollama generate failed');
    throw err;
  }
}

export async function isAvailable(): Promise<boolean> {
  try {
    await ollama.list();
    return true;
  } catch {
    return false;
  }
}
