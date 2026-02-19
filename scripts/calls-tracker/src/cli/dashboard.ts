#!/usr/bin/env bun
// CLI: Display reputation dashboard
//
// Usage:
//   bun run dashboard                    — Full leaderboard
//   bun run dashboard -- --caller NAME   — Single caller details
//   bun run dashboard -- --stats         — Global stats

import { initDb, getAllCallers, getCaller, getCallerCalls, getStats, getRecentCalls } from "../tracker/db.ts";
import { formatReputation, generateLeaderboard, calculateReputation, timeWeightedAccuracy } from "../tracker/reputation.ts";

function parseArgs(): { caller?: string; stats?: boolean } {
  const args = process.argv.slice(2);
  let caller: string | undefined;
  let stats = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--caller":
      case "-c":
        caller = args[++i];
        break;
      case "--stats":
      case "-s":
        stats = true;
        break;
    }
  }

  return { caller, stats };
}

function formatCallRow(call: ReturnType<typeof getRecentCalls>[0]): string {
  const status = call.resolved
    ? (call.outcome === "WIN" ? "W" : call.outcome === "LOSS" ? "L" : "V")
    : "?";
  const date = call.createdAt.toISOString().slice(0, 10);
  const question = call.question.length > 50 ? call.question.slice(0, 47) + "..." : call.question;
  const pda = call.marketPda ? call.marketPda.slice(0, 8) + "..." : "pending";

  return `  [${status}] ${date} | ${call.betAmount.toFixed(2)} SOL ${call.betSide} | ${pda} | ${question}`;
}

async function main() {
  const { caller, stats } = parseArgs();

  initDb();

  if (stats) {
    const s = getStats();
    console.log("=== CALLS TRACKER — Global Stats ===\n");
    console.log(`  Callers:        ${s.totalCallers}`);
    console.log(`  Total calls:    ${s.totalCalls}`);
    console.log(`  Resolved:       ${s.resolvedCalls}`);
    console.log(`  SOL wagered:    ${s.totalSolWagered.toFixed(2)}`);
    console.log(`  Avg hit rate:   ${(s.avgHitRate * 100).toFixed(1)}%`);
    console.log();

    // Recent calls
    const recent = getRecentCalls(10);
    if (recent.length > 0) {
      console.log("--- Recent Calls ---");
      for (const call of recent) {
        console.log(formatCallRow(call));
      }
    }
    return;
  }

  if (caller) {
    const callerId = caller.toLowerCase().replace(/\s+/g, "-");
    const callerObj = getCaller(callerId);
    if (!callerObj) {
      console.error(`Caller "${caller}" not found`);
      process.exit(1);
    }

    console.log("=== CALLS TRACKER — Caller Profile ===\n");
    console.log(formatReputation(callerObj));
    console.log();

    const rep = calculateReputation(callerObj);
    console.log("--- Score Breakdown ---");
    console.log(`  Raw hit rate:      ${(rep.details.rawHitRate * 100).toFixed(1)}%`);
    console.log(`  Bayesian score:    ${(rep.details.bayesianScore * 100).toFixed(1)}%`);
    console.log(`  Streak bonus:      ${rep.details.streakBonus >= 0 ? "+" : ""}${(rep.details.streakBonus * 100).toFixed(1)}%`);
    console.log(`  Volume bonus:      +${(rep.details.volumeBonus * 100).toFixed(1)}%`);
    console.log(`  Profit factor:     ${rep.details.profitFactor >= 0 ? "+" : ""}${rep.details.profitFactor.toFixed(2)}x`);
    console.log();

    const twa = timeWeightedAccuracy(callerId);
    console.log(`  Time-weighted acc: ${(twa * 100).toFixed(1)}% (recent calls weighted higher)`);
    console.log();

    // Call history
    const calls = getCallerCalls(callerId);
    if (calls.length > 0) {
      console.log("--- Call History ---");
      for (const call of calls.slice(0, 20)) {
        console.log(formatCallRow(call));
      }
      if (calls.length > 20) {
        console.log(`  ... and ${calls.length - 20} more`);
      }
    }
    return;
  }

  // Default: leaderboard
  const allCallers = getAllCallers();
  console.log(generateLeaderboard(allCallers));

  if (allCallers.length > 0) {
    console.log();
    const s = getStats();
    console.log(`Global: ${s.totalCalls} calls, ${s.totalSolWagered.toFixed(2)} SOL wagered, ${(s.avgHitRate * 100).toFixed(1)}% avg hit rate`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
