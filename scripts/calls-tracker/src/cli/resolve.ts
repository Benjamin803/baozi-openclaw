import { loadDB, saveDB, resolveCall } from "../storage.ts";

const C = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", yellow: "\x1b[33m" };

const args = process.argv.slice(2);
const id = args[args.indexOf("--id") + 1] ?? null;
const outcome = (args[args.indexOf("--outcome") + 1] ?? "").toUpperCase() as "YES" | "NO";

if (!id || !["YES", "NO"].includes(outcome)) {
  console.log(`${C.yellow}Usage: bun run resolve -- --id <callId> --outcome YES|NO${C.reset}`);
  process.exit(1);
}

const db = loadDB();
const updated = resolveCall(db, id, outcome);

if (!updated) {
  console.log(`${C.red}Call ID "${id}" not found.${C.reset}`);
  process.exit(1);
}

saveDB(db);
const correct = updated.resolution === "resolved_correct";
console.log(`\n${C.bold}Call ${id} resolved${C.reset}`);
console.log(`  Outcome: ${outcome}`);
console.log(`  Result:  ${correct ? `${C.green}✓ CORRECT${C.reset}` : `${C.red}✗ WRONG${C.reset}`}`);
console.log(`\n${C.dim}Updated reputation. Run 'bun run dashboard' to see standings.${C.reset}\n`);
