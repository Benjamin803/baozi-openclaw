import { loadStore } from "../lib/store.ts";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m" };
const args = process.argv.slice(2);
const callerFilter = args[0] ?? null;

const store = loadStore();
let calls = store.calls;
if (callerFilter) calls = calls.filter(c => c.caller.includes(callerFilter));

console.log(`\n${C.cyan}${C.bold}=== CALLS TRACKER ===${C.reset}\n`);
console.log(`${C.dim}${calls.length} call(s) tracked${callerFilter ? ` for "${callerFilter}"` : ""}${C.reset}\n`);

if (calls.length === 0) {
  console.log(`No calls yet. Run 'bun run call -- --prediction "your prediction"' to add one.`);
  process.exit(0);
}

for (const call of calls.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
  const statusColor = call.status === "resolved"
    ? (call.outcome === call.betSide ? C.green : C.red)
    : C.yellow;
  const statusStr = call.status === "resolved"
    ? `${call.outcome} (${call.outcome === call.betSide ? "✅ WIN" : "❌ LOSS"})`
    : call.status.toUpperCase();

  console.log(`${C.bold}${call.caller}${C.reset} · ${new Date(call.createdAt).toLocaleDateString()}`);
  console.log(`  📊 "${call.marketQuestion}"`);
  console.log(`  Side: ${call.betSide === "YES" ? C.green : C.red}${call.betSide}${C.reset} · ${call.betAmount} SOL · Status: ${statusColor}${statusStr}${C.reset}`);
  if (call.pnl != null) console.log(`  PnL: ${call.pnl >= 0 ? C.green + "+" : C.red}${call.pnl.toFixed(4)} SOL${C.reset}`);
  console.log(`  Source: ${C.dim}${call.dataSource}${C.reset} · Closes: ${call.closeTime}`);
  if (call.marketPda) console.log(`  Market: ${C.dim}https://baozi.bet/market/${call.marketPda}${C.reset}`);
  console.log(`  ID: ${C.dim}${call.id}${C.reset}\n`);
}
