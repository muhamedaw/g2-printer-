import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createLogger, DEFAULT_RISK, SOLANA } from '@mpg2/shared';
import type { BuySignal, Trade, Position } from '@mpg2/shared';
import type { WalletManager } from './WalletManager.js';
import { getQuote, buildSwapTx, estimatePriceImpact } from './JupiterClient.js';

const log = createLogger('live-executor');

const RPC_URL   = process.env['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';
const JITO_URL  = process.env['JITO_BLOCK_ENGINE'] ?? 'https://mainnet.block-engine.jito.wtf';

export class LiveExecutor {
  private connection: Connection;

  constructor(private readonly walletManager: WalletManager) {
    this.connection = new Connection(RPC_URL, 'confirmed');
  }

  async buy(
    signal: BuySignal,
    encryptedKey: string,
    currentPrice: number,
    solPriceUsd: number = 150,
  ): Promise<{ trade: Trade; position: Position; txSignature: string }> {
    const keypair = this.loadKeypair(encryptedKey);
    const pubkey  = keypair.publicKey.toBase58();

    // Convert USD position size → SOL → lamports using the actual SOL price
    const solNeeded  = signal.positionSizeUsd / solPriceUsd;
    const lamports   = Math.floor(solNeeded * LAMPORTS_PER_SOL);

    // Check balance
    const balanceLamports = await this.connection.getBalance(keypair.publicKey);
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    const requiredSol = solNeeded + DEFAULT_RISK.JITO_TIP_SOL + 0.01; // add fee buffer

    if (balanceSol < requiredSol) {
      throw new Error(`Insufficient SOL: ${balanceSol.toFixed(4)} < ${requiredSol.toFixed(4)}`);
    }

    // Price impact check
    const impact = await estimatePriceImpact(signal.contractAddress, lamports);
    if (impact > DEFAULT_RISK.MAX_PRICE_IMPACT_PCT * 100) {
      throw new Error(`Price impact too high: ${impact.toFixed(2)}%`);
    }

    // Get quote: SOL → token (1% max slippage — OpenClaw critical fix)
    const slippageBps = Number(process.env['MAX_SLIPPAGE_BPS'] ?? 100); // default 1%
    const quote = await getQuote(
      SOLANA.MINTS.SOL,
      signal.contractAddress,
      lamports,
      slippageBps,
    );

    // Reject if Jupiter itself reports high price impact
    const quoteImpact = parseFloat(quote.priceImpactPct ?? '0');
    if (quoteImpact > slippageBps / 100) {
      throw new Error(`Jupiter price impact ${quoteImpact.toFixed(2)}% exceeds limit`);
    }

    // PROMPT 89: Dynamic Jito tip — higher during peak trading hours (more competition for block space)
    const utcHour = new Date().getUTCHours();
    const isPeakHour = (utcHour >= 13 && utcHour < 18) || (utcHour >= 20);
    const jitoTipSol = isPeakHour ? DEFAULT_RISK.JITO_TIP_SOL * 2 : DEFAULT_RISK.JITO_TIP_SOL;
    const jitoTipLamports = Math.floor(jitoTipSol * LAMPORTS_PER_SOL);
    const swapTx = await buildSwapTx(quote, pubkey, jitoTipLamports);

    // Sign and send
    const txSignature = await this.signAndSend(keypair, swapTx.swapTransaction);

    // pump.fun tokens have 6 decimals; Jupiter returns raw integer amount
    const outTokens  = parseInt(quote.outAmount) / 1e6;
    const solSpent   = lamports / LAMPORTS_PER_SOL;
    const usdSpent   = solSpent * solPriceUsd;
    const entryPrice = outTokens > 0 ? usdSpent / outTokens : currentPrice;

    const trade: Trade = {
      userId:          signal.userId,
      contractAddress: signal.contractAddress,
      tokenSymbol:     signal.tokenSymbol ?? undefined,
      tradeType:       'BUY',
      isPaperTrade:    false,
      source:          signal.source ?? null,
      entryPrice,
      quantityTokens:  outTokens,
      solAmount:       solSpent,
      usdAmount:       usdSpent,
      finalScore:      signal.finalScore,
      txSignature,
      jitoTipSOL:      DEFAULT_RISK.JITO_TIP_SOL,
      createdAt:       new Date(),
    };

    const position: Position = {
      userId:             signal.userId,
      contractAddress:    signal.contractAddress,
      tokenSymbol:        signal.tokenSymbol ?? undefined,
      source:             signal.source ?? undefined,
      entryPrice,
      highestPriceSeen:   entryPrice,
      quantityRemaining:  outTokens,
      usdInvested:        usdSpent,
      tp1Executed:        false,
      tp2Executed:        false,
      tp3Executed:        false,
      trailingStopActive: false,
      finalScore:         signal.finalScore,
      isPaperTrade:       false,
      openedAt:           new Date(),
      updatedAt:          new Date(),
    };

    log.info({
      userId:    signal.userId,
      contract:  signal.contractAddress,
      usd:       signal.positionSizeUsd.toFixed(2),
      tx:        txSignature,
    }, 'Live BUY executed');

    return { trade, position, txSignature };
  }

  async sell(
    position: Position,
    encryptedKey: string,
    currentPrice: number,
    sellPct: number,
    tradeType: Trade['tradeType'],
    solPriceUsd: number = 150,
  ): Promise<Trade & { txSignature: string }> {
    const keypair = this.loadKeypair(encryptedKey);
    const pubkey  = keypair.publicKey.toBase58();

    const qtyToSell  = position.quantityRemaining * sellPct;
    const tokenUnits = Math.floor(qtyToSell * 1e6); // token → smallest unit (6 decimals)

    // Jupiter quote: token → SOL (1% max slippage)
    const slippageBps = Number(process.env['MAX_SLIPPAGE_BPS'] ?? 100);
    const quote = await getQuote(
      position.contractAddress,
      SOLANA.MINTS.SOL,
      tokenUnits,
      slippageBps,
    );

    const utcHourSell = new Date().getUTCHours();
    const isPeakSell  = (utcHourSell >= 13 && utcHourSell < 18) || (utcHourSell >= 20);
    const jitoTipSolSell = isPeakSell ? DEFAULT_RISK.JITO_TIP_SOL * 2 : DEFAULT_RISK.JITO_TIP_SOL;
    const jitoTipLamports = Math.floor(jitoTipSolSell * LAMPORTS_PER_SOL);
    const swapTx = await buildSwapTx(quote, pubkey, jitoTipLamports);
    const txSignature = await this.signAndSend(keypair, swapTx.swapTransaction);

    const solReceived = parseInt(quote.outAmount) / LAMPORTS_PER_SOL;
    const usdReceived = solReceived * solPriceUsd; // SOL × SOL/USD price
    const usdInvested = position.usdInvested * sellPct;
    const pnlUsd      = usdReceived - usdInvested;
    const pnlPct      = usdInvested > 0 ? pnlUsd / usdInvested : 0;

    const trade: Trade = {
      userId:          position.userId,
      contractAddress: position.contractAddress,
      tokenSymbol:     position.tokenSymbol ?? undefined,
      tradeType,
      isPaperTrade:    false,
      source:          position.source ?? undefined,
      entryPrice:      position.entryPrice,
      exitPrice:       currentPrice,
      quantityTokens:  qtyToSell,
      solAmount:       solReceived,
      usdAmount:       usdReceived,
      pnlUsd,
      pnlPct,
      finalScore:      position.finalScore,
      txSignature,
      jitoTipSOL:      DEFAULT_RISK.JITO_TIP_SOL,
      createdAt:       new Date(),
    };

    log.info({
      userId:   position.userId,
      contract: position.contractAddress,
      type:     tradeType,
      pnlPct:   (pnlPct * 100).toFixed(1),
      tx:       txSignature,
    }, 'Live SELL executed');

    return { ...trade, txSignature };
  }

  private loadKeypair(encryptedKey: string): Keypair {
    const raw = this.walletManager.getDecryptedKey(encryptedKey);
    return Keypair.fromSecretKey(bs58.decode(raw));
  }

  private async signAndSend(keypair: Keypair, txBase64: string): Promise<string> {
    const txBuf = Buffer.from(txBase64, 'base64');
    const tx    = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight:       false,
      maxRetries:          3,
      preflightCommitment: 'confirmed',
    });

    // Confirm with timeout
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    return sig;
  }
}
