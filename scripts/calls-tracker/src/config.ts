// Calls Tracker — Configuration

export const CONFIG = {
  // Baozi API
  BAOZI_API: "https://baozi.bet/api",
  BAOZI_PROGRAM_ID: "FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ",
  BAOZI_VALIDATE_URL: "https://baozi.bet/api/markets/validate",
  BAOZI_SHARE_CARD_URL: "https://baozi.bet/api/share/card",

  // Solana
  RPC_URL: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",

  // Market creation defaults
  MIN_HOURS_BEFORE_EVENT: 24, // Type A: close >= 24h before event
  DEFAULT_CLOSE_BUFFER_HOURS: 48, // Default close time before event
  MAX_DAYS_UNTIL_CLOSE: 14,
  LAB_CREATION_FEE_SOL: 0.01,
  DEFAULT_BET_SOL: 0.1, // Skin in the game
  MAX_CREATOR_FEE_BPS: 200,

  // Reputation
  MIN_CALLS_FOR_RANKING: 3,
  CONFIDENCE_DECAY_FACTOR: 0.95, // Older calls matter less
  STREAK_BONUS_MULTIPLIER: 1.1,

  // Valid categories (Baozi standard)
  CATEGORIES: [
    "crypto", "sports", "music", "streaming",
    "economic", "weather", "elections", "technology",
  ] as const,

  // Data sources for resolution
  DATA_SOURCES: {
    crypto: { name: "CoinGecko", url: "https://www.coingecko.com" },
    sports: { name: "ESPN", url: "https://www.espn.com" },
    economic: { name: "FRED", url: "https://fred.stlouisfed.org" },
    weather: { name: "NOAA", url: "https://www.weather.gov" },
    streaming: { name: "Netflix Top 10", url: "https://top10.netflix.com" },
    music: { name: "Billboard", url: "https://www.billboard.com" },
    elections: { name: "Associated Press", url: "https://apnews.com" },
    technology: { name: "GitHub Trending", url: "https://github.com/trending" },
  } as Record<string, { name: string; url: string }>,

  // Mode
  DRY_RUN: process.env.DRY_RUN === "true",

  // DB
  DB_PATH: process.env.DB_PATH || "./calls-tracker.db",
} as const;

export type Category = typeof CONFIG.CATEGORIES[number];

// A "call" = a public prediction that becomes a market
export interface Call {
  id: string;
  callerId: string;
  callerName: string;
  predictionText: string; // Raw text: "BTC will hit $110k by March 1"
  question: string; // Structured: "Will BTC exceed $110,000 by March 1, 2026?"
  category: Category;
  marketType: "typeA" | "typeB";
  closingTime: Date;
  eventTime?: Date;
  measurementStart?: Date;
  measurementEnd?: Date;
  dataSource: string;
  dataSourceUrl: string;
  backupSource?: string;
  betAmount: number; // SOL wagered on own call
  betSide: "YES" | "NO";
  marketPda?: string;
  betTxSignature?: string;
  shareCardUrl?: string;
  resolved: boolean;
  outcome?: "WIN" | "LOSS" | "VOID";
  createdAt: Date;
  resolvedAt?: Date;
}

export interface Caller {
  id: string;
  name: string;
  walletAddress?: string;
  totalCalls: number;
  correctCalls: number;
  totalWagered: number; // SOL
  totalWon: number; // SOL
  totalLost: number; // SOL
  currentStreak: number; // Positive = win streak, negative = loss streak
  bestStreak: number;
  worstStreak: number;
  hitRate: number; // 0-1
  confidenceScore: number; // Bayesian-weighted score
  lastCallAt?: Date;
  createdAt: Date;
}

export interface ValidationResult {
  approved: boolean;
  violations: Array<{
    severity: "critical" | "warning" | "info";
    rule: string;
    message: string;
  }>;
}
