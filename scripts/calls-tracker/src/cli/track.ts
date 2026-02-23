import { loadDB } from "../storage.ts";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m" };

const args = process.argv.slice(2);
const id = args[args.indexOf("--id") + 1] ?? null;
const caller = args[args.indexOf("--caller") + 1] ?? null;

const db = loadDB();

const calls = id
  ? db.calls.filter(c => c.id === id)
  : caller
  ? db.calls.filter(c => c.caller === caller)
  : db.calls;

console.log(`\n${C.cyan}${C.bold}=== CALLS TRACKER ===${C.reset}`);
console.log(`${C.dim}Showing ${calls.length} call(s)${C.reset}\n`);

if (calls.length === 0) {
  console.log(`${C.dim}No calls found. Try: bun run call -- "Your prediction" --caller yourname${C.reset}\n`);
  process.exit(0);
}

for (const call of calls) {
  const status = call.resolvedAt
    ? call.resolution === "resolved_correct"
      ? `${C.green}✓ CORRECT${C.reset}`
      : `${C.red}✗ WRONG${C.reset}`
    : `${C.yellow}⏳ OPEN${C.reset}`;

  console.log(`${C.bold}[${call.id}]${C.reset} ${status}`);
  console.log(`  ${C.dim}Caller:${C.reset}  ${call.caller}`);
  console.log(`  ${C.dim}Call:${C.reset}    ${call.prediction}`);
  console.log(`  ${C.dim}Question:${C.reset} ${call.question}`);
  console.log(`  ${C.dim}Bet:${C.reset}     ${call.bet} SOL · Close: ${call.closeTime.slice(0, 10)}`);
  if (call.outcome) console.log(`  ${C.dim}Outcome:${C.reset} ${call.outcome}`);
  console.log();
}
