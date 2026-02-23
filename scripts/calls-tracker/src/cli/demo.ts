import { randomUUID } from "crypto";
import { loadDB, saveDB, addCall, resolveCall, rankCallers } from "../storage.ts";
import type { Call } from "../types.ts";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m" };

const DEMO_CALLS: Omit<Call, "id" | "createdAt">[] = [
  { caller: "CryptoSage", prediction: "BTC will hit $110k by March 1", question: "Will BTC exceed $110k by March 1, 2026?", closeTime: "2026-03-01T00:00:00Z", bet: 0.5 },
  { caller: "BearBot", prediction: "Ethereum will drop below $2k", question: "Will ETH drop below $2,000 by March 15?", closeTime: "2026-03-15T00:00:00Z", bet: 0.3 },
  { caller: "CryptoSage", prediction: "Seahawks will win Super Bowl", question: "Will Seattle Seahawks win Super Bowl LX?", closeTime: "2026-02-09T23:59:00Z", bet: 0.2 },
  { caller: "AlphaHunter", prediction: "Fed will cut rates in March", question: "Will the Fed cut rates at the March 2026 FOMC meeting?", closeTime: "2026-03-20T00:00:00Z", bet: 0.4 },
  { caller: "BearBot", prediction: "Arsenal will win the Premier League", question: "Will Arsenal win the 2025-26 Premier League title?", closeTime: "2026-05-24T00:00:00Z", bet: 0.1 },
  { caller: "AlphaHunter", prediction: "Gold will hit $3000", question: "Will gold (XAU) reach $3,000/oz by April 1, 2026?", closeTime: "2026-04-01T00:00:00Z", bet: 0.3 },
];

const RESOLUTIONS: Array<{ caller: string; question: string; outcome: "YES" | "NO" }> = [
  { caller: "CryptoSage", question: "Will Seattle Seahawks win Super Bowl LX?", outcome: "YES" },
  { caller: "BearBot", question: "Will ETH drop below $2,000 by March 15?", outcome: "NO" },
];

console.log(`\n${C.cyan}${C.bold}╔═════════════════════════════════════════════╗`);
console.log(`║      CALLS TRACKER — FULL DEMO              ║`);
console.log(`║  Turn predictions into reputation scores    ║`);
console.log(`╚═════════════════════════════════════════════╝${C.reset}\n`);

// Reset and build fresh demo DB
const db = loadDB();
const demoIds: Record<string, string> = {};

console.log(`${C.bold}Step 1: Recording predictions...${C.reset}\n`);
for (const c of DEMO_CALLS) {
  const call: Call = { ...c, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString() };
  demoIds[`${c.caller}-${c.question.slice(0, 20)}`] = call.id;
  addCall(db, call);
  console.log(`  ${C.dim}[${call.id}]${C.reset} ${call.caller}: "${call.prediction.slice(0, 45)}..." · ${call.bet} SOL`);
}

console.log(`\n${C.bold}Step 2: Resolving completed markets...${C.reset}\n`);
for (const r of RESOLUTIONS) {
  const call = db.calls.find(c => c.caller === r.caller && c.question.includes(r.question.slice(5, 25)));
  if (call) {
    call.resolution = r.outcome === "YES" ? "resolved_correct" : "resolved_wrong";
    call.outcome = r.outcome;
    call.resolvedAt = new Date().toISOString();
    const profile = db.callers[r.caller];
    if (profile) {
      r.outcome === "YES" ? profile.correct++ : profile.wrong++;
      const t = profile.correct + profile.wrong;
      profile.hitRate = Math.round((profile.correct / t) * 100);
      profile.pnl += r.outcome === "YES" ? call.bet * 0.9 : -call.bet;
      profile.streak = r.outcome === "YES" ? Math.max(0, profile.streak) + 1 : Math.min(0, profile.streak) - 1;
    }
    const icon = r.outcome === "YES" ? `${C.green}✓ CORRECT${C.reset}` : `${C.red}✗ WRONG${C.reset}`;
    console.log(`  ${r.caller}: "${r.question.slice(0, 40)}..." → ${icon}`);
  }
}

saveDB(db);

console.log(`\n${C.bold}Step 3: Reputation scoreboard${C.reset}\n`);
const ranked = rankCallers(db);
const hdr = `${"#".padEnd(3)} ${"Caller".padEnd(13)} ${"Hit%".padStart(5)} ${"W/L".padStart(5)} ${"PnL (SOL)".padStart(10)} ${"Open".padStart(5)}`;
console.log(`${C.cyan}${hdr}${C.reset}`);
console.log("─".repeat(48));
for (const p of ranked) {
  const rank = p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `${String(p.rank).padStart(2)}.`;
  const name = p.name.slice(0, 13).padEnd(13);
  const hit = `${p.hitRate}%`.padStart(5);
  const wl = `${p.correct}/${p.wrong}`.padStart(5);
  const pnl = p.pnl > 0 ? `${C.green}+${p.pnl.toFixed(3)}${C.reset}` : `${C.red}${p.pnl.toFixed(3)}${C.reset}`;
  const open = String(p.totalCalls - p.correct - p.wrong).padStart(5);
  console.log(`${rank} ${name} ${hit} ${wl} ${pnl.padEnd(10)} ${open}`);
}

console.log(`\n${C.dim}Demo complete. Run 'bun run dashboard' to see live tracker.${C.reset}\n`);
