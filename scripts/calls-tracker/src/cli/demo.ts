#!/usr/bin/env bun
// Demo: Create 5 example calls, simulate resolutions, show dashboard
//
// Usage: bun run demo
// This generates the proof required by the bounty acceptance criteria

import { createCall } from "../parser/prediction.ts";
import { validateCall } from "../market/validator.ts";
import { buildShareCardUrl } from "../market/creator.ts";
import { initDb, upsertCaller, saveCall, resolveCall, getTopCallers, getStats, getRecentCalls } from "../tracker/db.ts";
import { generateLeaderboard, formatReputation, calculateReputation } from "../tracker/reputation.ts";

const DEMO_CALLS = [
  {
    caller: "CryptoKing",
    prediction: "BTC will hit $110k by March 15",
    bet: 0.5,
    outcome: "WIN" as const,
  },
  {
    caller: "CryptoKing",
    prediction: "ETH will exceed $4000 by end of Q1",
    bet: 0.3,
    outcome: "WIN" as const,
  },
  {
    caller: "CryptoKing",
    prediction: "SOL will reach $300 by March 1",
    bet: 0.2,
    outcome: "LOSS" as const,
  },
  {
    caller: "SportsGuru",
    prediction: "Lakers will beat Celtics in Game 7",
    bet: 1.0,
    outcome: "WIN" as const,
  },
  {
    caller: "SportsGuru",
    prediction: "Chiefs will win the Super Bowl",
    bet: 0.5,
    outcome: "LOSS" as const,
  },
  {
    caller: "MacroTrader",
    prediction: "NVDA will drop below $700 by April",
    bet: 0.8,
    outcome: "LOSS" as const,
  },
  {
    caller: "MacroTrader",
    prediction: "Bitcoin dominance above 60% by March",
    bet: 0.4,
    outcome: "WIN" as const,
  },
  {
    caller: "MacroTrader",
    prediction: "Interest rates will be cut this quarter",
    bet: 0.6,
    outcome: "WIN" as const,
  },
];

async function main() {
  console.log("=== CALLS TRACKER — Demo ===\n");
  console.log("Creating example calls and simulating resolutions...\n");

  // Use a fresh demo DB
  const db = initDb("./calls-tracker-demo.db");

  // Register callers
  upsertCaller("cryptoking", "CryptoKing", "CKwallet123...abc");
  upsertCaller("sportsguru", "SportsGuru", "SGwallet456...def");
  upsertCaller("macrotrader", "MacroTrader", "MTwallet789...ghi");

  let callNum = 0;
  for (const demo of DEMO_CALLS) {
    callNum++;
    console.log(`--- Call #${callNum}: ${demo.caller} ---`);

    // Create call
    const call = createCall(demo.prediction, demo.caller, undefined, demo.bet);
    console.log(`  Raw:      "${demo.prediction}"`);
    console.log(`  Parsed:   ${call.question}`);
    console.log(`  Category: ${call.category} | Type: ${call.marketType}`);
    console.log(`  Bet:      ${call.betAmount} SOL on ${call.betSide}`);

    // Validate
    const validation = await validateCall(call);
    if (validation.approved) {
      console.log(`  Status:   APPROVED`);
    } else {
      console.log(`  Status:   REJECTED (${validation.violations.length} violations)`);
      for (const v of validation.violations) {
        console.log(`    [${v.severity}] ${v.message}`);
      }
    }

    // Simulate market creation (dry run)
    call.marketPda = `Demo${callNum}PDA_${call.id}`;
    call.betTxSignature = `demo_bet_tx_${call.id}`;
    call.shareCardUrl = buildShareCardUrl(call.marketPda);
    console.log(`  Share:    ${call.shareCardUrl}`);

    saveCall(call);

    // Resolve
    resolveCall(call.id, demo.outcome);
    console.log(`  Outcome:  ${demo.outcome}`);
    console.log();
  }

  // Show results
  console.log("\n" + "=".repeat(85));
  console.log("=== FINAL RESULTS ===");
  console.log("=".repeat(85) + "\n");

  // Leaderboard
  const callers = getTopCallers(20);
  console.log(generateLeaderboard(callers));

  // Individual profiles
  console.log("\n--- Individual Profiles ---\n");
  for (const caller of callers) {
    console.log(formatReputation(caller));
    const rep = calculateReputation(caller);
    console.log(`   Confidence: Bayesian=${(rep.details.bayesianScore * 100).toFixed(1)}%, Streak=${rep.details.streakBonus >= 0 ? "+" : ""}${(rep.details.streakBonus * 100).toFixed(1)}%, Volume=+${(rep.details.volumeBonus * 100).toFixed(1)}%`);
    console.log();
  }

  // Global stats
  const stats = getStats();
  console.log("--- Global Stats ---");
  console.log(`  Total callers:  ${stats.totalCallers}`);
  console.log(`  Total calls:    ${stats.totalCalls}`);
  console.log(`  Resolved:       ${stats.resolvedCalls}`);
  console.log(`  SOL wagered:    ${stats.totalSolWagered.toFixed(2)}`);
  console.log(`  Avg hit rate:   ${(stats.avgHitRate * 100).toFixed(1)}%`);

  // Recent calls
  console.log("\n--- All Calls ---");
  const recent = getRecentCalls(20);
  for (const call of recent) {
    const status = call.outcome === "WIN" ? "W" : call.outcome === "LOSS" ? "L" : "?";
    console.log(`  [${status}] ${call.callerId.padEnd(15)} ${call.betAmount.toFixed(1)} SOL ${call.betSide.padEnd(3)} | ${call.question.slice(0, 55)}`);
  }

  console.log("\n=== Demo Complete ===");
  console.log("Run 'bun run dashboard' for live leaderboard");
  console.log("Run 'bun run call -- -c NAME -p PREDICTION' to make real calls");

  // Clean up demo DB
  try { require("fs").unlinkSync("./calls-tracker-demo.db"); } catch {}
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
