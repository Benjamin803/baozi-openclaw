import { loadStore, saveStore, updateCallerRep } from "../lib/store.ts";

const C = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m" };
const args = process.argv.slice(2);
const get = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const id = get("--id") ?? args[0];
const outcome = (get("--outcome") ?? args[1])?.toUpperCase() as "YES" | "NO";

if (!id || !outcome || !["YES", "NO"].includes(outcome)) {
  console.log(`Usage: bun run resolve -- --id <call-id> --outcome YES|NO`);
  console.log(`   or: bun run resolve -- <call-id> YES`);
  process.exit(1);
}

const store = loadStore();
const call = store.calls.find(c => c.id === id || c.id.startsWith(id));

if (!call) {
  console.log(`${C.yellow}Call not found: ${id}${C.reset}`);
  process.exit(1);
}

call.outcome = outcome;
call.status = "resolved";
call.resolvedAt = new Date().toISOString();

const win = call.outcome === call.betSide;
call.pnl = win ? call.betAmount * 0.85 : -call.betAmount; // ~85% return after fees

updateCallerRep(store, call.caller);
saveStore(store);

const icon = win ? "✅" : "❌";
console.log(`\n${icon} Call resolved: "${call.marketQuestion}"`);
console.log(`  Caller: ${call.caller} · Called: ${call.betSide} · Outcome: ${outcome}`);
console.log(`  Result: ${win ? `${C.green}WIN` : `${C.red}LOSS`}${C.reset} · PnL: ${call.pnl >= 0 ? C.green + "+" : C.red}${call.pnl.toFixed(4)} SOL${C.reset}`);
console.log(`\n${C.dim}Run 'bun run dashboard' to see updated reputation${C.reset}\n`);
