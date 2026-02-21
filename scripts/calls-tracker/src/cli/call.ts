#!/usr/bin/env bun
// CLI: Make a new call (prediction → market → bet → share card)
//
// Usage:
//   bun run call -- --caller "CryptoKing" --prediction "BTC will hit $110k by March 1"
//   bun run call -- --caller "SportsGuru" --prediction "Lakers will beat Celtics" --bet 0.5
//   DRY_RUN=true bun run call -- --caller "Test" --prediction "ETH above $4000 by April"

import { createCall } from "../parser/prediction.ts";
import { validateCall } from "../market/validator.ts";
import { createMarket, placeBet, buildShareCardUrl } from "../market/creator.ts";
import { initDb, upsertCaller, saveCall } from "../tracker/db.ts";
import { formatReputation } from "../tracker/reputation.ts";

function parseArgs(): { caller: string; prediction: string; bet?: number; wallet?: string } {
  const args = process.argv.slice(2);
  let caller = "";
  let prediction = "";
  let bet: number | undefined;
  let wallet: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--caller":
      case "-c":
        caller = args[++i];
        break;
      case "--prediction":
      case "-p":
        prediction = args[++i];
        break;
      case "--bet":
      case "-b":
        bet = parseFloat(args[++i]);
        break;
      case "--wallet":
      case "-w":
        wallet = args[++i];
        break;
      default:
        // Treat remaining as prediction text if no flag
        if (!prediction && !args[i].startsWith("-")) {
          prediction = args[i];
        }
    }
  }

  if (!caller || !prediction) {
    console.error("Usage: bun run call -- --caller NAME --prediction TEXT [--bet SOL] [--wallet ADDR]");
    console.error("");
    console.error("Examples:");
    console.error('  bun run call -- -c "CryptoKing" -p "BTC will hit $110k by March 1"');
    console.error('  bun run call -- -c "SportsGuru" -p "Lakers beat Celtics in Game 7" -b 0.5');
    console.error('  DRY_RUN=true bun run call -- -c "Test" -p "ETH above $4000 by April"');
    process.exit(1);
  }

  return { caller, prediction, bet, wallet };
}

async function main() {
  const { caller, prediction, bet, wallet } = parseArgs();

  console.log("=== CALLS TRACKER — New Call ===\n");

  // Initialize DB
  initDb();

  // Ensure caller exists
  const callerId = caller.toLowerCase().replace(/\s+/g, "-");
  const callerObj = upsertCaller(callerId, caller, wallet);

  // Parse prediction into structured call
  const call = createCall(prediction, caller, callerId, bet);
  console.log(`Caller:     ${caller} (${callerId})`);
  console.log(`Raw:        "${prediction}"`);
  console.log(`Parsed:     ${call.question}`);
  console.log(`Category:   ${call.category}`);
  console.log(`Type:       ${call.marketType}`);
  console.log(`Closes:     ${call.closingTime.toISOString()}`);
  if (call.eventTime) console.log(`Event:      ${call.eventTime.toISOString()}`);
  if (call.measurementStart) console.log(`Measurement: ${call.measurementStart.toISOString()} → ${call.measurementEnd?.toISOString()}`);
  console.log(`Data src:   ${call.dataSource} (${call.dataSourceUrl})`);
  console.log(`Bet:        ${call.betAmount} SOL on ${call.betSide}`);
  console.log();

  // Validate
  console.log("--- Validation ---");
  const validation = await validateCall(call);

  for (const v of validation.violations) {
    const icon = v.severity === "critical" ? "X" : v.severity === "warning" ? "!" : "i";
    console.log(`  [${icon}] ${v.rule}: ${v.message}`);
  }

  if (!validation.approved) {
    console.log("\nCall REJECTED — fix violations and retry.");
    process.exit(1);
  }

  console.log("\nCall APPROVED!");
  console.log();

  // Create market
  console.log("--- Market Creation ---");
  const result = await createMarket(call);
  if (result) {
    call.marketPda = result.marketPda;
    call.shareCardUrl = result.shareCardUrl;
    console.log(`Market PDA: ${result.marketPda}`);
    console.log(`TX:         ${result.txSignature}`);
    console.log(`Share card: ${result.shareCardUrl}`);

    // Place bet
    console.log();
    console.log("--- Placing Bet ---");
    const betResult = await placeBet(call);
    if (betResult) {
      call.betTxSignature = betResult.txSignature;
      console.log(`Bet TX:     ${betResult.txSignature}`);
      console.log(`Amount:     ${betResult.amount} SOL on ${betResult.side}`);
    }
  } else {
    console.log("Market creation skipped (no wallet or error)");
    // Still generate a share card URL placeholder
    call.shareCardUrl = buildShareCardUrl(`pending_${call.id}`);
  }

  // Save to DB
  saveCall(call);
  console.log();
  console.log("--- Saved ---");
  console.log(`Call ID: ${call.id}`);

  // Show caller's current reputation
  const updatedCaller = { ...callerObj, totalCalls: callerObj.totalCalls + 1 };
  console.log();
  console.log(formatReputation(updatedCaller));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
