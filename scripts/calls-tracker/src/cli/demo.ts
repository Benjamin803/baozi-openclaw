import { loadStore, saveStore, getOrCreateCaller, updateCallerRep } from "../lib/store.ts";
import type { Call } from "../lib/store.ts";
import { randomUUID } from "crypto";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m" };

console.log(`${C.cyan}${C.bold}`);
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║       📊 CALLS TRACKER — FULL DEMO                      ║");
console.log("║       Turn predictions into on-chain reputation          ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log(`${C.reset}`);

const store = loadStore();

// Seed demo data
const demoCalls: Omit<Call, "id" | "createdAt">[] = [
  { caller: "@satoshi_calls", prediction: "BTC will hit $110k by March 1", marketQuestion: "Will BTC exceed $110k by March 1, 2026?", betSide: "YES", betAmount: 0.5, closeTime: "2026-03-01", dataSource: "On-chain analysis", status: "resolved", outcome: "NO", resolvedAt: new Date(Date.now() - 86400000 * 5).toISOString(), pnl: -0.5 },
  { caller: "@satoshi_calls", prediction: "Seahawks win Super Bowl LX", marketQuestion: "Will Seattle Seahawks win Super Bowl LX?", betSide: "YES", betAmount: 0.3, closeTime: "2026-02-15", dataSource: "ESPN stats", status: "resolved", outcome: "YES", resolvedAt: new Date(Date.now() - 86400000 * 7).toISOString(), pnl: 0.255 },
  { caller: "@satoshi_calls", prediction: "Toyota wins Daytona 500", marketQuestion: "Will a Toyota driver win the 2026 Daytona 500?", betSide: "YES", betAmount: 0.2, closeTime: "2026-02-19", dataSource: "NASCAR history", status: "resolved", outcome: "YES", resolvedAt: new Date(Date.now() - 86400000 * 3).toISOString(), pnl: 0.17 },
  { caller: "@crypto_oracle", prediction: "ETH will NOT flip BTC in Q2", marketQuestion: "Will ETH flip BTC in market cap by Q2 2026?", betSide: "NO", betAmount: 1.0, closeTime: "2026-04-01", dataSource: "Market cap analysis", status: "open", pnl: undefined, outcome: undefined, resolvedAt: undefined },
  { caller: "@crypto_oracle", prediction: "FaZe wins Six Invitational", marketQuestion: "Will FaZe Clan win Six Invitational 2026?", betSide: "YES", betAmount: 0.4, closeTime: "2026-02-19", dataSource: "Esports stats", status: "resolved", outcome: "YES", resolvedAt: new Date(Date.now() - 86400000 * 2).toISOString(), pnl: 0.34 },
  { caller: "@contrarian_bets", prediction: "BNP wins Bangladesh election", marketQuestion: "Will BNP win majority in Bangladesh election?", betSide: "YES", betAmount: 0.15, closeTime: "2026-02-15", dataSource: "Al Jazeera", status: "resolved", outcome: "YES", resolvedAt: new Date(Date.now() - 86400000 * 6).toISOString(), pnl: 0.127 },
  { caller: "@contrarian_bets", prediction: "Voter turnout under 60%", marketQuestion: "Will voter turnout exceed 60% in Bangladesh election?", betSide: "NO", betAmount: 0.1, closeTime: "2026-02-15", dataSource: "Historical data", status: "resolved", outcome: "NO", resolvedAt: new Date(Date.now() - 86400000 * 6).toISOString(), pnl: 0.085 },
];

// Clear and reseed for demo
store.calls = [];
store.callers = {};

for (const c of demoCalls) {
  const call: Call = { ...c, id: randomUUID(), createdAt: new Date(Date.now() - Math.random() * 86400000 * 10).toISOString() };
  const caller = call.caller;
  getOrCreateCaller(store, caller);
  store.calls.push(call);
}

for (const caller of Object.keys(store.callers)) {
  updateCallerRep(store, caller);
}

saveStore(store);
console.log(`${C.green}✓ Seeded ${demoCalls.length} demo calls for 3 callers${C.reset}\n`);

// Show reputation table
const reps = Object.values(store.callers).sort((a, b) => b.accuracy - a.accuracy);

console.log(`${C.bold}REPUTATION LEADERBOARD${C.reset}\n`);
console.log(`  ${"Caller".padEnd(18)} ${"Acc%".padStart(5)} ${"W/L".padStart(5)} ${"PnL SOL".padStart(10)} ${"Calls".padStart(6)} ${"Streak".padStart(7)}`);
console.log("  " + "─".repeat(55));

for (const rep of reps) {
  const streak = rep.streak > 0 ? `${C.green}+${rep.streak}🔥${C.reset}` : rep.streak < 0 ? `${C.red}${rep.streak}❄️${C.reset}` : `${C.dim}—${C.reset}`;
  const pnlStr = rep.totalPnl >= 0 ? `${C.green}+${rep.totalPnl.toFixed(3)}${C.reset}` : `${C.red}${rep.totalPnl.toFixed(3)}${C.reset}`;
  console.log(`  ${rep.caller.padEnd(18)} ${String(rep.accuracy).padStart(4)}% ${`${rep.correctCalls}/${rep.wrongCalls}`.padStart(5)} ${pnlStr.padEnd(10)} ${String(rep.totalCalls).padStart(6)} ${streak}`);
}

console.log(`\n${C.dim}Example call submission:${C.reset}`);
console.log(`  bun run call -- --caller @you --prediction "BTC hits 120k by April" --side YES --amount 0.5 --source "Technical analysis"`);
console.log(`\n${C.dim}Resolve a call:${C.reset}`);
console.log(`  bun run resolve -- --id <call-id> --outcome YES\n`);
