import { loadStore } from "../lib/store.ts";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m" };

function bar(val: number, max: number, w = 15): string {
  const f = max > 0 ? Math.round((val / max) * w) : 0;
  return `${C.cyan}${"█".repeat(f)}${"░".repeat(w - f)}${C.reset}`;
}

function pnl(n: number): string {
  return n >= 0 ? `${C.green}+${n.toFixed(4)}${C.reset}` : `${C.red}${n.toFixed(4)}${C.reset}`;
}

const store = loadStore();
const reps = Object.values(store.callers).sort((a, b) => b.accuracy - a.accuracy);

console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════╗`);
console.log(`║          📊 CALLS TRACKER — REPUTATION DASHBOARD        ║`);
console.log(`╚══════════════════════════════════════════════════════════╝${C.reset}\n`);

if (reps.length === 0) {
  console.log(`No callers yet. Run 'bun run call' to register a prediction.\n`);
  console.log(`Example:`);
  console.log(`  bun run call -- --caller @satoshi --prediction "BTC hits 110k by March" --side YES --amount 0.5\n`);
  process.exit(0);
}

const maxAcc = Math.max(...reps.map(r => r.accuracy));
console.log(`${C.bold}  ${"Caller".padEnd(16)} ${"Acc%".padStart(5)} ${"W/L".padStart(6)} ${"PnL".padStart(9)} ${"Calls".padStart(6)} ${"Streak".padStart(7)}${C.reset}`);
console.log("  " + "─".repeat(58));

for (const rep of reps) {
  const rank = rep.accuracy === maxAcc && rep.totalCalls > 0 ? "🏆" : "  ";
  const streak = rep.streak > 0 ? `${C.green}+${rep.streak}🔥${C.reset}` : rep.streak < 0 ? `${C.red}${rep.streak}❄️${C.reset}` : `${C.dim}—${C.reset}`;
  console.log(`${rank}${rep.caller.padEnd(16)} ${String(rep.accuracy).padStart(4)}% ${`${rep.correctCalls}/${rep.wrongCalls}`.padStart(6)} ${pnl(rep.totalPnl).padEnd(9)} ${String(rep.totalCalls).padStart(6)} ${streak}`);
}

console.log(`\n${C.dim}  Total callers: ${reps.length} · Total calls: ${store.calls.length} · Last updated: ${new Date(store.lastUpdated).toLocaleString()}${C.reset}\n`);

// Open calls
const open = store.calls.filter(c => c.status !== "resolved");
if (open.length > 0) {
  console.log(`${C.yellow}${C.bold}  ⏳ Open Calls (${open.length})${C.reset}`);
  for (const c of open.slice(0, 5)) {
    console.log(`  ${C.dim}${c.caller}${C.reset} · "${c.marketQuestion.slice(0, 55)}..." · ${c.betSide} · closes ${c.closeTime}`);
  }
  console.log();
}
