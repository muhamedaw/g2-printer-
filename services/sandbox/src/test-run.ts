// Quick smoke test — no Telegram needed
// Run: pnpm --filter @mpg2/sandbox dev:test
import { DexScreenerClient } from './api/DexScreenerClient.js';
import { RugCheckClient } from './api/RugCheckClient.js';
import { QuickScorer } from './scoring/QuickScorer.js';
import { createLogger } from '@mpg2/shared';

const log = createLogger('sandbox-test');

async function main() {
  log.info('Testing DexScreener API...');
  const dex = new DexScreenerClient();
  const tokens = await dex.getNewPairs(5);
  log.info({ count: tokens.length }, 'Got tokens from DexScreener');

  if (tokens.length === 0) {
    log.warn('No tokens returned — check API');
    return;
  }

  log.info('Testing RugCheck API...');
  const rugCheck = new RugCheckClient();
  const enriched = await rugCheck.enrich(tokens.slice(0, 2));

  log.info('Scoring tokens...');
  const scorer = new QuickScorer();
  for (const token of enriched) {
    const score = scorer.score(token);
    log.info({
      symbol: token.symbol,
      price: token.priceUsd,
      liquidity: token.liquidityUsd,
      score: score.total,
      reasoning: score.reasoning,
    }, 'Token scored');
  }

  log.info('All APIs working!');
}

main().catch(console.error);
