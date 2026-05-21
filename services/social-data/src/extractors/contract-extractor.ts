// Solana base58 address: 32-44 chars, excludes 0/O/I/l
const SOLANA_ADDR_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

// Known non-token addresses to filter out (wallets, programs, etc.)
const BLOCKLIST = new Set([
  '11111111111111111111111111111111',                    // System program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',       // Token program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bZ',      // ATA program
  'So11111111111111111111111111111111111111112',          // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',      // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',       // USDT
]);

export function extractContracts(text: string): string[] {
  const matches = text.matchAll(SOLANA_ADDR_RE);
  const found = new Set<string>();

  for (const [, addr] of matches) {
    if (!addr) continue;
    if (BLOCKLIST.has(addr)) continue;
    // Heuristic: token mints are usually ≥40 chars (avoid wallet addresses)
    if (addr.length < 40) continue;
    found.add(addr);
  }

  return [...found];
}

export function extractAllContracts(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const text of texts) {
    for (const addr of extractContracts(text)) {
      freq.set(addr, (freq.get(addr) ?? 0) + 1);
    }
  }
  return freq;
}
