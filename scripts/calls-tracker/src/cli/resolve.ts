#!/usr/bin/env bun
// CLI: Resolve calls (check outcomes and update reputation)
//
// Usage:
//   bun run resolve                           — Show unresolved calls
//   bun run resolve -- --id CALL_ID --outcome WIN
//   bun run resolve -- --id CALL_ID --outcome LOSS
//   bun run resolve -- --id CALL_ID --outcome VOID

import { initDb, getUnresolvedCalls, getCall, resolveCall, getCaller } from "../tracker/db.ts";
import { formatReputation } from "../tracker/reputation.ts";

function parseArgs(): { id?: string; outcome?: "WIN" | "LOSS" | "VOID" } {
  const args = process.argv.slice(2);
  let id: string | undefined;
  let outcome: "WIN" | "LOSS" | "VOID" | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--id":
        id = args[++i];
        break;
      case "--outcome":
      case "-o":
        const val = args[++i]?.toUpperCase();
        if (val === "WIN" || val === "LOSS" || val === "VOID") {
          outcome = val;
        } else {
          console.error("Outcome must be WIN, LOSS, or VOID");
          process.exit(1);
        }
        break;
    }
  }

  return { id, outcome };
}

async function main() {
  const { id, outcome } = parseArgs();

  initDb();

  if (id && outcome) {
    // Resolve a specific call
    const call = getCall(id);
    if (!call) {
      console.error(`Call ${id} not found`);
      process.exit(1);
    }
    if (call.resolved) {
      console.error(`Call ${id} already resolved as ${call.outcome}`);
      process.exit(1);
    }

    console.log(`Resolving call ${id}:`);
    console.log(`  Question: ${call.question}`);
    console.log(`  Bet: ${call.betAmount} SOL on ${call.betSide}`);
    console.log(`  Outcome: ${outcome}`);

    resolveCall(id, outcome);
    console.log("\nResolved!");

    // Show updated caller reputation
    const caller = getCaller(call.callerId);
    if (caller) {
      console.log();
      console.log(formatReputation(caller));
    }
    return;
  }

  // Show unresolved calls
  const unresolved = getUnresolvedCalls();
  if (unresolved.length === 0) {
    console.log("No unresolved calls.");
    return;
  }

  console.log(`=== Unresolved Calls (${unresolved.length}) ===\n`);

  const now = new Date();
  for (const call of unresolved) {
    const isPastClose = call.closingTime < now;
    const isPastEvent = call.eventTime ? call.eventTime < now : false;
    const status = isPastEvent ? "READY" : isPastClose ? "CLOSED" : "OPEN";

    console.log(`  [${status}] ${call.id} — ${call.question.slice(0, 60)}${call.question.length > 60 ? "..." : ""}`);
    console.log(`          Caller: ${call.callerId} | ${call.betAmount} SOL ${call.betSide}`);
    console.log(`          Closes: ${call.closingTime.toISOString().slice(0, 16)}`);
    if (call.eventTime) console.log(`          Event:  ${call.eventTime.toISOString().slice(0, 16)}`);
    if (call.marketPda) console.log(`          Market: ${call.marketPda}`);
    console.log();
  }

  console.log("To resolve: bun run resolve -- --id CALL_ID --outcome WIN|LOSS|VOID");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
