import { randomUUID } from "crypto";
import { loadDB, saveDB, addCall } from "../storage.ts";
import type { Call } from "../types.ts";

const DRY_RUN = process.env.DRY_RUN === "true";
const C = { reset: "\x1b[0m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", dim: "\x1b[2m", bold: "\x1b[1m" };

const args = process.argv.slice(2);
const get = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const caller = get("--caller") ?? "anonymous";
const prediction = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--caller" && args[args.indexOf(a) - 1] !== "--bet" && args[args.indexOf(a) - 1] !== "--close") ?? "No prediction provided";
const bet = parseFloat(get("--bet") ?? "0.1");
const closeTime = get("--close") ?? new Date(Date.now() + 7 * 86400000).toISOString();

// Generate a structured question from the free-form prediction
function structureQuestion(text: string): string {
  if (text.toLowerCase().startsWith("will ")) return text.endsWith("?") ? text : text + "?";
  if (text.includes(" will ")) return `Will ${text.split(" will ")[1]}?`;
  return `Will the following occur: ${text}?`;
}

const call: Call = {
  id: randomUUID().slice(0, 8),
  caller,
  prediction,
  question: structureQuestion(prediction),
  closeTime,
  bet,
  createdAt: new Date().toISOString(),
  shareCard: `https://baozi.bet/api/share/card?market=NEW_${Date.now()}`,
};

console.log(`\n${C.cyan}${C.bold}=== CALLS TRACKER — NEW CALL ===${C.reset}\n`);
console.log(`${C.dim}Caller:${C.reset}     ${caller}`);
console.log(`${C.dim}Prediction:${C.reset} ${prediction}`);
console.log(`${C.dim}Question:${C.reset}   ${call.question}`);
console.log(`${C.dim}Close time:${C.reset} ${closeTime}`);
console.log(`${C.dim}Bet:${C.reset}        ${bet} SOL`);
console.log(`${C.dim}Call ID:${C.reset}    ${call.id}`);

if (DRY_RUN) {
  console.log(`\n${C.yellow}[DRY RUN] Call not saved. Would create Lab market on Baozi.${C.reset}`);
  console.log(`${C.dim}Run without DRY_RUN=true to persist.${C.reset}\n`);
} else {
  const db = loadDB();
  addCall(db, call);
  saveDB(db);
  console.log(`\n${C.green}✓ Call recorded (ID: ${call.id})${C.reset}`);
  console.log(`${C.dim}Track it: bun run track -- --id ${call.id}${C.reset}\n`);
}
