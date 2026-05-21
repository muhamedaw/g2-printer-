import { createLogger } from '@mpg2/shared';

const log = createLogger('mint-checker');
const SOLANA_RPC = process.env['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';

export interface MintCheckResult {
  mintAuthorityRevoked:   boolean;
  freezeAuthorityRevoked: boolean;
  passed:                 boolean;
  rejectionReason?:       string;
}

export async function checkMintAuthority(tokenMint: string): Promise<MintCheckResult> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [tokenMint, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return fallback();
    const data = await res.json() as {
      result?: { value?: { data?: { parsed?: { info?: {
        mintAuthority: string | null;
        freezeAuthority: string | null;
      } } } } }
    };
    const info = data.result?.value?.data?.parsed?.info;
    if (!info) return fallback();

    const mintRevoked   = info.mintAuthority   === null;
    const freezeRevoked = info.freezeAuthority === null;
    const passed = mintRevoked; // freeze revoked is nice-to-have

    return {
      mintAuthorityRevoked:   mintRevoked,
      freezeAuthorityRevoked: freezeRevoked,
      passed,
      ...(!passed ? { rejectionReason: 'Mint authority not revoked — dev can mint more tokens' } : {}),
    };
  } catch (err) {
    log.warn({ err, tokenMint }, 'Mint check failed — fallback');
    return fallback();
  }
}

function fallback(): MintCheckResult {
  // RPC unavailable — fail open so one flaky RPC call doesn't halt all trading.
  // rugcheck + honeypot checks still run as safety net.
  return { mintAuthorityRevoked: false, freezeAuthorityRevoked: false, passed: true };
}
