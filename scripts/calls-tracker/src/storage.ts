import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { CallsDB, Call, CallerProfile } from "./types.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = join(__dir, "..", "calls-db.json");

export function loadDB(): CallsDB {
  if (!existsSync(DB_PATH)) {
    return { calls: [], callers: {}, lastUpdated: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(DB_PATH, "utf8")) as CallsDB;
}

export function saveDB(db: CallsDB): void {
  db.lastUpdated = new Date().toISOString();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export function addCall(db: CallsDB, call: Call): void {
  db.calls.push(call);
  if (!db.callers[call.caller]) {
    db.callers[call.caller] = {
      name: call.caller, calls: [],
      totalCalls: 0, correct: 0, wrong: 0, hitRate: 0,
      totalBet: 0, pnl: 0, streak: 0,
    };
  }
  const profile = db.callers[call.caller]!;
  profile.calls.push(call);
  profile.totalCalls++;
  profile.totalBet += call.bet;
}

export function resolveCall(db: CallsDB, callId: string, outcome: "YES" | "NO"): Call | null {
  const call = db.calls.find(c => c.id === callId);
  if (!call) return null;
  call.outcome = outcome;
  call.resolvedAt = new Date().toISOString();

  const profile = db.callers[call.caller];
  if (!profile) return call;

  const correct = call.resolution === "resolved_correct";
  call.resolution = correct ? "resolved_correct" : "resolved_wrong";

  if (correct) {
    profile.correct++;
    profile.streak = Math.max(0, profile.streak) + 1;
    profile.pnl += call.bet * 0.9;
  } else {
    profile.wrong++;
    profile.streak = Math.min(0, profile.streak) - 1;
    profile.pnl -= call.bet;
  }
  const total = profile.correct + profile.wrong;
  profile.hitRate = total > 0 ? Math.round((profile.correct / total) * 100) : 0;
  return call;
}

export function rankCallers(db: CallsDB): CallerProfile[] {
  return Object.values(db.callers)
    .sort((a, b) => b.hitRate - a.hitRate || b.totalCalls - a.totalCalls)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}
