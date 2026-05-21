import { createLogger, CircuitBreaker, SOLANA } from '@mpg2/shared';

const log = createLogger('jupiter-client');
const BASE = 'https://quote-api.jup.ag/v6';
const breaker = new CircuitBreaker('jupiter-live', 5, 60_000);

export interface QuoteResponse {
  inputMint:        string;
  outputMint:       string;
  inAmount:         string;
  outAmount:        string;
  priceImpactPct:   string;
  slippageBps:      number;
  routePlan:        unknown[];
  otherAmountThreshold: string;
}

export interface SwapTransaction {
  swapTransaction:         string; // base64 versioned tx
  lastValidBlockHeight:    number;
}

export async function getQuote(
  inputMint:      string,
  outputMint:     string,
  amountLamports: number,
  slippageBps = 500,
): Promise<QuoteResponse> {
  return breaker.execute(async () => {
    const url = `${BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}&onlyDirectRoutes=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Jupiter quote ${res.status}`);
    const data = await res.json() as QuoteResponse & { error?: string };
    if (data.error) throw new Error(`Jupiter: ${data.error}`);
    return data;
  });
}

export async function buildSwapTx(
  quote:           QuoteResponse,
  userPublicKey:   string,
  jitoTipLamports: number,
): Promise<SwapTransaction> {
  return breaker.execute(async () => {
    const res = await fetch(`${BASE}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse:      quote,
        userPublicKey,
        wrapAndUnwrapSol:   true,
        prioritizationFeeLamports: jitoTipLamports,
        dynamicComputeUnitLimit: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Jupiter swap build ${res.status}`);
    return res.json() as Promise<SwapTransaction>;
  });
}

export async function estimatePriceImpact(
  tokenMint:      string,
  amountLamports: number,
): Promise<number> {
  try {
    const quote = await getQuote(tokenMint, SOLANA.MINTS.USDC, amountLamports);
    return parseFloat(quote.priceImpactPct);
  } catch {
    log.warn({ tokenMint }, 'Price impact estimate failed');
    return 1; // assume 1% if unavailable
  }
}
