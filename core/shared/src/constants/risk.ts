export const DEFAULT_RISK = {
  CAPITAL_TOTAL_USD: 1000,
  MAX_POSITION_PCT: 0.03,
  MAX_OPEN_POSITIONS: 5,
  RESERVE_CAPITAL_PCT: 0.20,

  MIN_SCORE_TO_BUY: 85,
  MIN_LIQUIDITY_USD: 10_000,
  MAX_LIQUIDITY_USD: 2_000_000,
  MIN_HOLDERS: 100,
  MIN_TOKEN_AGE_MINUTES: 60,
  MAX_TOKEN_AGE_HOURS: 4,
  MIN_BUY_SELL_RATIO: 0.55,
  MAX_PRICE_IMPACT_PCT: 0.05,

  STOP_LOSS_PCT: -0.20,
  TP1_MULTIPLIER: 1.5,  TP1_SELL_PCT: 0.30,
  TP2_MULTIPLIER: 3.0,  TP2_SELL_PCT: 0.30,
  TP3_MULTIPLIER: 6.0,  TP3_SELL_PCT: 0.30,
  MOONBAG_PCT: 0.10,
  TRAILING_STOP_FROM_PEAK: 0.15,

  DAILY_LOSS_LIMIT_PCT: 0.10,
  WEEKLY_LOSS_LIMIT_PCT: 0.20,
  MAX_CONSECUTIVE_LOSSES: 5,
  MAX_SLIPPAGE_PCT: 0.15,
  JITO_TIP_SOL: 0.001,

  PUMP_SCAN_MS: 3_000,
  PRICE_CHECK_MS: 30_000,
  WALLET_SCAN_MS: 1_000,
  SOCIAL_SCAN_MS: 60_000,
  SAFETY_CACHE_MINUTES: 15,

  PLATFORM_WEIGHTS: {
    news: 1.4, twitter: 1.2, telegram: 1.1, reddit: 1.0,
  },

  INFLUENCER_TIERS: [
    { minFollowers: 1_000_000, weight: 3.0 },
    { minFollowers: 100_000,   weight: 2.0 },
    { minFollowers: 10_000,    weight: 1.5 },
    { minFollowers: 0,         weight: 1.0 },
  ],

  AI_WEIGHTS: {
    sentiment:         0.25,  // ↓ noisy with 3B LLM — less trust
    authenticity:      0.35,  // ↑ best signal of real organic interest
    trend:             0.20,  // unchanged
    narrativeFreshness: 0.10, // ↓ easily gamed ("new token" keywords always present)
    engagement:        0.10,  // explicit weight for signal count / avg engagement
  },

  REGIME_MIN_SCORE: {
    EXTREME_BULL: 60,
    BULL: 68,
    SIDEWAYS: 72,
    BEAR: 80,
    EXTREME_BEAR: 999,
  },
} as const;

export const REGIME_MIN_SCORE = DEFAULT_RISK.REGIME_MIN_SCORE;
