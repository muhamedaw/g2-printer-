import { CircuitBreaker } from '@mpg2/shared';
import { SOLANA } from '@mpg2/shared';

const BASE = 'https://quote-api.jup.ag/v6';
const breaker = new CircuitBreaker('jupiter', 5, 60_000);

export async function getQuote(inputMint: string, outputMint: string, amountLamports: number) {
  return breaker.execute(async () => {
    const url = `${BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=500`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
    return res.json();
  });
}

// Honeypot check: simulate a sell of a small amount back to USDC
// If Jupiter returns no routes, the token likely cannot be sold (honeypot)
export async function isHoneypot(tokenMint: string): Promise<boolean> {
  try {
    const quote = await getQuote(tokenMint, SOLANA.MINTS.USDC, 1_000_000);
    return !quote || (quote as any).error != null;
  } catch {
    return true; // assume honeypot if check fails
  }
}
