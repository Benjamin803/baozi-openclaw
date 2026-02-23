import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const STORE_PATH = join(process.cwd(), "calls-tracker-data.json");

export interface Call {
  id: string;
  caller: string;
  prediction: string;
  marketQuestion: string;
  marketPda?: string;
  betAmount: number;
  betSide: "YES" | "NO";
  closeTime: string;
  eventTime?: string;
  dataSource: string;
  status: "open" | "resolved" | "pending";
  outcome?: "YES" | "NO";
  createdAt: string;
  resolvedAt?: string;
  pnl?: number;
}

export interface CallerRep {
  caller: string;
  totalCalls: number;
  correctCalls: number;
  wrongCalls: number;
  pendingCalls: number;
  accuracy: number;
  totalBetAmount: number;
  totalPnl: number;
  streak: number;
  lastCallAt?: string;
}

export interface Store {
  calls: Call[];
  callers: Record<string, CallerRep>;
  lastUpdated: string;
}

export function loadStore(): Store {
  if (!existsSync(STORE_PATH)) {
    return { calls: [], callers: {}, lastUpdated: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
}

export function saveStore(store: Store) {
  store.lastUpdated = new Date().toISOString();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getOrCreateCaller(store: Store, caller: string): CallerRep {
  if (!store.callers[caller]) {
    store.callers[caller] = {
      caller, totalCalls: 0, correctCalls: 0, wrongCalls: 0,
      pendingCalls: 0, accuracy: 0, totalBetAmount: 0, totalPnl: 0, streak: 0,
    };
  }
  return store.callers[caller];
}

export function updateCallerRep(store: Store, caller: string) {
  const calls = store.calls.filter(c => c.caller === caller);
  const rep = getOrCreateCaller(store, caller);
  rep.totalCalls = calls.length;
  rep.correctCalls = calls.filter(c => c.status === "resolved" && c.outcome === c.betSide).length;
  rep.wrongCalls = calls.filter(c => c.status === "resolved" && c.outcome !== c.betSide).length;
  rep.pendingCalls = calls.filter(c => c.status !== "resolved").length;
  rep.accuracy = rep.totalCalls > 0
    ? Math.round((rep.correctCalls / (rep.correctCalls + rep.wrongCalls || 1)) * 100)
    : 0;
  rep.totalBetAmount = calls.reduce((s, c) => s + c.betAmount, 0);
  rep.totalPnl = calls.reduce((s, c) => s + (c.pnl ?? 0), 0);
  const resolved = calls.filter(c => c.status === "resolved").sort((a, b) =>
    (a.resolvedAt ?? "").localeCompare(b.resolvedAt ?? ""));
  let streak = 0;
  for (let i = resolved.length - 1; i >= 0; i--) {
    const c = resolved[i];
    const win = c.outcome === c.betSide;
    if (i === resolved.length - 1) { streak = win ? 1 : -1; continue; }
    if ((streak > 0) === win) streak += win ? 1 : -1;
    else break;
  }
  rep.streak = streak;
}
