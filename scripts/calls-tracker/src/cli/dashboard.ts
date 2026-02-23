import { loadDB, rankCallers } from "../storage.ts";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m" };

const db = loadDB();
const ranked = rankCallers(db);
const openCalls = db.calls.filter(c => !c.resolvedAt).length;
const resolvedCalls = db.calls.filter(c => c.resolvedAt).length;

console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════╗`);
console.log(`║         📊 CALLS TRACKER — REPUTATION BOARD         ║`);
console.log(`╚══════════════════════════════════════════════════════╝${C.reset}\n`);
console.log(`${C.dim}Total calls: ${db.calls.length} · Open: ${openCalls} · Resolved: ${resolvedCalls} · Callers: ${ranked.length}${C.reset}\n`);

if (ranked.length === 0) {
  console.log(`${C.dim}No calls yet. Run: bun run call -- "BTC will hit $110k by March" --caller your-name${C.reset}\n`);
  process.exit(0);
}

const header = `${"#".padEnd(3)} ${"Caller".padEnd(16)} ${"Hit%".padStart(5)} ${"W/L".padStart(5)} ${"PnL".padStart(8)} ${"Calls".padStart(6)} ${"Streak".padStart(7)}`;
console.log(`${C.cyan}${header}${C.reset}`);
console.log("─".repeat(55));

for (const p of ranked) {
  const rank = p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `${String(p.rank).padStart(2)}.`;
  const name = p.name.slice(0, 16).padEnd(16);
  const hit = `${p.hitRate}%`.padStart(5);
  const wl = `${p.correct}/${p.wrong}`.padStart(5);
  const pnlVal = p.pnl > 0 ? `${C.green}+${p.pnl.toFixed(2)}${C.reset}` : p.pnl < 0 ? `${C.red}${p.pnl.toFixed(2)}${C.reset}` : `${C.dim}0.00${C.reset}`;
  const calls = String(p.totalCalls).padStart(6);
  const streak = p.streak > 0 ? `${C.green}+${p.streak}🔥${C.reset}` : p.streak < 0 ? `${C.red}${p.streak}❄️${C.reset}` : `${C.dim}—${C.reset}`;
  console.log(`${rank} ${name} ${hit} ${wl} ${pnlVal.padEnd(8)} ${calls} ${streak}`);
}

// Recent calls
if (db.calls.length > 0) {
  console.log(`\n${C.cyan}${C.bold}Recent Calls:${C.reset}`);
  for (const call of db.calls.slice(-5).reverse()) {
    const status = call.resolvedAt
      ? (call.resolution === "resolved_correct" ? `${C.green}✓ CORRECT${C.reset}` : `${C.red}✗ WRONG${C.reset}`)
      : `${C.yellow}⏳ OPEN${C.reset}`;
    console.log(`  [${call.id}] ${call.question.slice(0, 50)}... ${status}`);
  }
}
console.log();
