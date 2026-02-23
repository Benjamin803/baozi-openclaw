export type MarketType = "A" | "B";
export type CallStatus = "open" | "resolved_correct" | "resolved_wrong" | "expired";

export interface Call {
  id: string;
  caller: string;
  prediction: string;
  question: string;
  marketPda?: string;
  closeTime: string;
  eventTime?: string;
  bet: number;
  outcome?: "YES" | "NO";
  resolution?: CallStatus;
  shareCard?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CallerProfile {
  name: string;
  wallet?: string;
  calls: Call[];
  totalCalls: number;
  correct: number;
  wrong: number;
  hitRate: number;
  totalBet: number;
  pnl: number;
  streak: number;
  rank?: number;
}

export interface CallsDB {
  calls: Call[];
  callers: Record<string, CallerProfile>;
  lastUpdated: string;
}
