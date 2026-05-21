import { CircuitBreaker, createLogger } from '@mpg2/shared';

const log = createLogger('goplus-checker');
const BASE = 'https://api.gopluslabs.io/api/v1';
const breaker = new CircuitBreaker('goplus', 5, 120_000);

export interface GoPlusResult {
  passed:           boolean;
  isHoneypot:       boolean;
  sellTax:          number;
  creatorPercent:   number;
  rejectionReason?: string;
}

interface GoPlusTokenInfo {
  is_honeypot?:     string;
  cannot_buy?:      string;
  cannot_sell_all?: string;
  sell_tax?:        string;
  buy_tax?:         string;
  creator_percent?: string;
}

export async function checkGoPlus(mint: string, isPumpToken: boolean): Promise<GoPlusResult> {
  return breaker.execute(async () => {
    const url = `${BASE}/solana/token_security?contract_addresses=${mint}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });

    if (!res.ok) return passThrough();

    const data = await res.json() as { code: number; result?: Record<string, GoPlusTokenInfo> };
    if (data.code !== 1 || !data.result) return passThrough();

    // GoPlus returns the key in lowercase
    const info: GoPlusTokenInfo | undefined =
      data.result[mint] ?? data.result[mint.toLowerCase()];
    if (!info) return passThrough(); // not indexed yet — fail open

    const isHoneypot    = info.is_honeypot === '1' || info.cannot_buy === '1' || info.cannot_sell_all === '1';
    const sellTax       = parseFloat(info.sell_tax ?? '0');
    const creatorPct    = parseFloat(info.creator_percent ?? '0') * 100;

    const reasons: string[] = [];
    if (isHoneypot)                          reasons.push('GoPlus: token cannot be sold (honeypot)');
    if (sellTax > 10)                        reasons.push(`GoPlus: sell tax ${sellTax.toFixed(1)}% > 10%`);
    if (!isPumpToken && creatorPct > 25)     reasons.push(`GoPlus: creator holds ${creatorPct.toFixed(1)}%`);

    const result: GoPlusResult = {
      passed:         reasons.length === 0,
      isHoneypot,
      sellTax,
      creatorPercent: creatorPct,
      ...(reasons.length > 0 ? { rejectionReason: reasons[0] } : {}),
    };

    if (!result.passed) {
      log.info({ mint: mint.slice(0, 8), reason: result.rejectionReason }, 'GoPlus rejected token');
    }

    return result;
  }).catch(() => passThrough());
}

function passThrough(): GoPlusResult {
  return { passed: true, isHoneypot: false, sellTax: 0, creatorPercent: 0 };
}
