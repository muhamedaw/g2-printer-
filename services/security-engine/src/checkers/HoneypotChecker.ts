import { CircuitBreaker, createLogger, SOLANA } from '@mpg2/shared';

const log = createLogger('honeypot-checker');
const JUPITER_BASE = 'https://quote-api.jup.ag/v6';
const breaker = new CircuitBreaker('honeypot', 5, 60_000);

export async function isHoneypot(tokenMint: string): Promise<boolean> {
  return breaker.execute(async () => {
    const url = `${JUPITER_BASE}/quote?inputMint=${tokenMint}&outputMint=${SOLANA.MINTS.USDC}&amount=1000000&slippageBps=1000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    // Network/server errors → fail open (don't block token on API issues)
    if (!res.ok) return false;
    const data = await res.json() as { error?: string; outAmount?: string };
    // Jupiter explicitly says no route → real honeypot indicator
    if (data.error?.toLowerCase().includes('no route') || data.error?.toLowerCase().includes('could not find')) {
      log.debug({ tokenMint, error: data.error }, 'Jupiter: no route found — likely honeypot');
      return true;
    }
    const outAmount = Number(data.outAmount ?? 0);
    return outAmount === 0;
  }).catch(() => {
    // Circuit open or network failure → fail open (don't penalise token for API downtime)
    log.debug({ tokenMint }, 'Honeypot check unavailable — passing token');
    return false;
  });
}
