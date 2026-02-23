import { loadStore, saveStore, getOrCreateCaller, updateCallerRep } from "../lib/store.ts";
import type { Call } from "../lib/store.ts";
import { randomUUID } from "crypto";

const DRY_RUN = process.env.DRY_RUN === "true";
const args = process.argv.slice(2);
const get = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const C = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", dim: "\x1b[2m", red: "\x1b[31m" };

const caller = get("--caller") ?? "anonymous";
const prediction = get("--prediction") ?? args[0];
const betSide = (get("--side") ?? "YES") as "YES" | "NO";
const betAmount = parseFloat(get("--amount") ?? "0.1");
const closeTime = get("--close") ?? new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
const dataSource = get("--source") ?? "manual";

if (!prediction) {
  console.log(`${C.yellow}Usage:${C.reset}`);
  console.log(`  bun run call -- --caller @alice --prediction "BTC will hit 110k" --side YES --amount 0.5 --close 2026-03-01 --source "CoinDesk"`);
  console.log(`  DRY_RUN=true bun run call -- ...  (preview without saving)`);
  process.exit(1);
}

// Parse prediction into market question
const q = prediction.trim();
const marketQuestion = q.endsWith("?") ? q : `${q}?`;

const call: Call = {
  id: randomUUID(),
  caller,
  prediction,
  marketQuestion,
  betAmount,
  betSide,
  closeTime,
  dataSource,
  status: "open",
  createdAt: new Date().toISOString(),
};

console.log(`\n${C.cyan}${C.bold}=== NEW PREDICTION CALL ===${C.reset}\n`);
console.log(`  Caller:    ${C.bold}${caller}${C.reset}`);
console.log(`  Call:      "${prediction}"`);
console.log(`  Question:  "${marketQuestion}"`);
console.log(`  Side:      ${betSide === "YES" ? C.green : C.red}${betSide}${C.reset}`);
console.log(`  Bet:       ${betAmount} SOL`);
console.log(`  Closes:    ${closeTime}`);
console.log(`  Source:    ${dataSource}`);
console.log(`  ID:        ${call.id}`);

if (DRY_RUN) {
  console.log(`\n${C.yellow}DRY RUN — not saved${C.reset}`);
  console.log(`\n${C.dim}To create on-chain market: remove DRY_RUN=true\nRequires wallet keypair + SOL for transaction fees${C.reset}`);
  process.exit(0);
}

const store = loadStore();
getOrCreateCaller(store, caller);
store.calls.push(call);
updateCallerRep(store, caller);
saveStore(store);

console.log(`\n${C.green}✓ Call registered (ID: ${call.id})${C.reset}`);
console.log(`${C.dim}  Run 'bun run dashboard' to see reputation${C.reset}`);
console.log(`\n${C.dim}Note: On-chain market creation requires wallet keypair.`);
console.log(`Set KEYPAIR_PATH env var and ensure sufficient SOL for fees.${C.reset}`);
