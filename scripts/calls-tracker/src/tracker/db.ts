// Reputation Database — SQLite-backed call tracking and reputation scoring

import { Database } from "bun:sqlite";
import { CONFIG, type Call, type Caller } from "../config.ts";

let db: Database;

export function initDb(path?: string): Database {
  db = new Database(path || CONFIG.DB_PATH);

  db.run(`CREATE TABLE IF NOT EXISTS callers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    wallet_address TEXT,
    total_calls INTEGER DEFAULT 0,
    correct_calls INTEGER DEFAULT 0,
    total_wagered REAL DEFAULT 0,
    total_won REAL DEFAULT 0,
    total_lost REAL DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    worst_streak INTEGER DEFAULT 0,
    last_call_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL,
    prediction_text TEXT NOT NULL,
    question TEXT NOT NULL,
    category TEXT NOT NULL,
    market_type TEXT NOT NULL,
    closing_time TEXT NOT NULL,
    event_time TEXT,
    measurement_start TEXT,
    measurement_end TEXT,
    data_source TEXT NOT NULL,
    data_source_url TEXT,
    backup_source TEXT,
    bet_amount REAL NOT NULL,
    bet_side TEXT NOT NULL,
    market_pda TEXT,
    bet_tx_signature TEXT,
    share_card_url TEXT,
    resolved INTEGER DEFAULT 0,
    outcome TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (caller_id) REFERENCES callers(id)
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_calls_resolved ON calls(resolved)`);

  return db;
}

export function getDb(): Database {
  if (!db) initDb();
  return db;
}

// Caller operations

export function upsertCaller(id: string, name: string, wallet?: string): Caller {
  const existing = getDb().query("SELECT * FROM callers WHERE id = ?").get(id) as Record<string, unknown> | null;

  if (existing) {
    if (wallet) {
      getDb().run("UPDATE callers SET wallet_address = ? WHERE id = ?", [wallet, id]);
    }
    return rowToCaller(existing);
  }

  getDb().run(
    "INSERT INTO callers (id, name, wallet_address) VALUES (?, ?, ?)",
    [id, name, wallet || null],
  );

  return {
    id, name, walletAddress: wallet,
    totalCalls: 0, correctCalls: 0,
    totalWagered: 0, totalWon: 0, totalLost: 0,
    currentStreak: 0, bestStreak: 0, worstStreak: 0,
    hitRate: 0, confidenceScore: 0.5,
    createdAt: new Date(),
  };
}

export function getCaller(id: string): Caller | null {
  const row = getDb().query("SELECT * FROM callers WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToCaller(row) : null;
}

export function getAllCallers(): Caller[] {
  const rows = getDb().query(
    "SELECT * FROM callers WHERE total_calls >= ? ORDER BY correct_calls * 1.0 / CASE WHEN total_calls = 0 THEN 1 ELSE total_calls END DESC",
  ).all(0) as Record<string, unknown>[];
  return rows.map(rowToCaller);
}

export function getTopCallers(limit: number = 20): Caller[] {
  const rows = getDb().query(
    `SELECT * FROM callers WHERE total_calls >= ?
     ORDER BY correct_calls * 1.0 / CASE WHEN total_calls = 0 THEN 1 ELSE total_calls END DESC,
              total_calls DESC
     LIMIT ?`,
  ).all(CONFIG.MIN_CALLS_FOR_RANKING, limit) as Record<string, unknown>[];
  return rows.map(rowToCaller);
}

// Call operations

export function saveCall(call: Call): void {
  getDb().run(
    `INSERT OR REPLACE INTO calls (
      id, caller_id, prediction_text, question, category, market_type,
      closing_time, event_time, measurement_start, measurement_end,
      data_source, data_source_url, backup_source,
      bet_amount, bet_side, market_pda, bet_tx_signature, share_card_url,
      resolved, outcome, created_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      call.id, call.callerId, call.predictionText, call.question,
      call.category, call.marketType,
      call.closingTime.toISOString(), call.eventTime?.toISOString() || null,
      call.measurementStart?.toISOString() || null, call.measurementEnd?.toISOString() || null,
      call.dataSource, call.dataSourceUrl, call.backupSource || null,
      call.betAmount, call.betSide,
      call.marketPda || null, call.betTxSignature || null, call.shareCardUrl || null,
      call.resolved ? 1 : 0, call.outcome || null,
      call.createdAt.toISOString(), call.resolvedAt?.toISOString() || null,
    ],
  );
}

export function getCall(id: string): Call | null {
  const row = getDb().query("SELECT * FROM calls WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToCall(row) : null;
}

export function getCallerCalls(callerId: string): Call[] {
  const rows = getDb().query(
    "SELECT * FROM calls WHERE caller_id = ? ORDER BY created_at DESC",
  ).all(callerId) as Record<string, unknown>[];
  return rows.map(rowToCall);
}

export function getUnresolvedCalls(): Call[] {
  const rows = getDb().query(
    "SELECT * FROM calls WHERE resolved = 0 ORDER BY closing_time ASC",
  ).all() as Record<string, unknown>[];
  return rows.map(rowToCall);
}

export function getRecentCalls(limit: number = 20): Call[] {
  const rows = getDb().query(
    "SELECT * FROM calls ORDER BY created_at DESC LIMIT ?",
  ).all(limit) as Record<string, unknown>[];
  return rows.map(rowToCall);
}

// Resolution

export function resolveCall(callId: string, outcome: "WIN" | "LOSS" | "VOID"): void {
  const call = getCall(callId);
  if (!call) throw new Error(`Call ${callId} not found`);
  if (call.resolved) throw new Error(`Call ${callId} already resolved`);

  const now = new Date().toISOString();
  getDb().run(
    "UPDATE calls SET resolved = 1, outcome = ?, resolved_at = ? WHERE id = ?",
    [outcome, now, callId],
  );

  if (outcome === "VOID") return; // Don't update stats for voided markets

  // Update caller stats
  const caller = getCaller(call.callerId);
  if (!caller) return;

  const isWin = outcome === "WIN";
  const newStreak = isWin
    ? (caller.currentStreak >= 0 ? caller.currentStreak + 1 : 1)
    : (caller.currentStreak <= 0 ? caller.currentStreak - 1 : -1);

  getDb().run(
    `UPDATE callers SET
      total_calls = total_calls + 1,
      correct_calls = correct_calls + ?,
      total_wagered = total_wagered + ?,
      total_won = total_won + ?,
      total_lost = total_lost + ?,
      current_streak = ?,
      best_streak = MAX(best_streak, ?),
      worst_streak = MIN(worst_streak, ?),
      last_call_at = ?
    WHERE id = ?`,
    [
      isWin ? 1 : 0,
      call.betAmount,
      isWin ? call.betAmount * 2 : 0, // Simplified: 2x payout on win
      isWin ? 0 : call.betAmount,
      newStreak,
      newStreak > 0 ? newStreak : caller.bestStreak,
      newStreak < 0 ? newStreak : caller.worstStreak,
      now,
      call.callerId,
    ],
  );
}

// Stats

export function getStats(): {
  totalCallers: number;
  totalCalls: number;
  resolvedCalls: number;
  totalSolWagered: number;
  avgHitRate: number;
} {
  const stats = getDb().query(`
    SELECT
      (SELECT COUNT(*) FROM callers) as total_callers,
      (SELECT COUNT(*) FROM calls) as total_calls,
      (SELECT COUNT(*) FROM calls WHERE resolved = 1) as resolved_calls,
      (SELECT COALESCE(SUM(bet_amount), 0) FROM calls) as total_wagered,
      (SELECT CASE WHEN SUM(total_calls) = 0 THEN 0
              ELSE CAST(SUM(correct_calls) AS REAL) / SUM(total_calls)
              END FROM callers WHERE total_calls > 0) as avg_hit_rate
  `).get() as Record<string, number>;

  return {
    totalCallers: stats.total_callers || 0,
    totalCalls: stats.total_calls || 0,
    resolvedCalls: stats.resolved_calls || 0,
    totalSolWagered: stats.total_wagered || 0,
    avgHitRate: stats.avg_hit_rate || 0,
  };
}

// Helpers

function rowToCaller(row: Record<string, unknown>): Caller {
  const total = Number(row.total_calls) || 0;
  const correct = Number(row.correct_calls) || 0;
  const hitRate = total > 0 ? correct / total : 0;

  // Bayesian confidence score: weighted by number of calls
  // Score = (hitRate * n + 0.5 * prior) / (n + prior)
  const prior = CONFIG.MIN_CALLS_FOR_RANKING;
  const confidenceScore = (hitRate * total + 0.5 * prior) / (total + prior);

  return {
    id: String(row.id),
    name: String(row.name),
    walletAddress: row.wallet_address ? String(row.wallet_address) : undefined,
    totalCalls: total,
    correctCalls: correct,
    totalWagered: Number(row.total_wagered) || 0,
    totalWon: Number(row.total_won) || 0,
    totalLost: Number(row.total_lost) || 0,
    currentStreak: Number(row.current_streak) || 0,
    bestStreak: Number(row.best_streak) || 0,
    worstStreak: Number(row.worst_streak) || 0,
    hitRate,
    confidenceScore,
    lastCallAt: row.last_call_at ? new Date(String(row.last_call_at)) : undefined,
    createdAt: new Date(String(row.created_at)),
  };
}

function rowToCall(row: Record<string, unknown>): Call {
  return {
    id: String(row.id),
    callerId: String(row.caller_id),
    callerName: "", // Not stored in DB, looked up separately
    predictionText: String(row.prediction_text),
    question: String(row.question),
    category: String(row.category) as Call["category"],
    marketType: String(row.market_type) as Call["marketType"],
    closingTime: new Date(String(row.closing_time)),
    eventTime: row.event_time ? new Date(String(row.event_time)) : undefined,
    measurementStart: row.measurement_start ? new Date(String(row.measurement_start)) : undefined,
    measurementEnd: row.measurement_end ? new Date(String(row.measurement_end)) : undefined,
    dataSource: String(row.data_source),
    dataSourceUrl: String(row.data_source_url || ""),
    backupSource: row.backup_source ? String(row.backup_source) : undefined,
    betAmount: Number(row.bet_amount),
    betSide: String(row.bet_side) as "YES" | "NO",
    marketPda: row.market_pda ? String(row.market_pda) : undefined,
    betTxSignature: row.bet_tx_signature ? String(row.bet_tx_signature) : undefined,
    shareCardUrl: row.share_card_url ? String(row.share_card_url) : undefined,
    resolved: Boolean(row.resolved),
    outcome: row.outcome ? String(row.outcome) as "WIN" | "LOSS" | "VOID" : undefined,
    createdAt: new Date(String(row.created_at)),
    resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)) : undefined,
  };
}
