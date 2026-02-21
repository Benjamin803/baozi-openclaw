#!/usr/bin/env bun
// CLI: Track callers — view or register new callers
//
// Usage:
//   bun run track                                     — List all callers
//   bun run track -- --name "CryptoKing" --wallet ABC — Register new caller
//   bun run track -- --name "CryptoKing"              — View caller details

import { initDb, upsertCaller, getAllCallers, getCaller, getCallerCalls } from "../tracker/db.ts";
import { formatReputation, calculateReputation } from "../tracker/reputation.ts";

function parseArgs(): { name?: string; wallet?: string } {
  const args = process.argv.slice(2);
  let name: string | undefined;
  let wallet: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
      case "-n":
        name = args[++i];
        break;
      case "--wallet":
      case "-w":
        wallet = args[++i];
        break;
    }
  }

  return { name, wallet };
}

async function main() {
  const { name, wallet } = parseArgs();

  initDb();

  if (name) {
    const callerId = name.toLowerCase().replace(/\s+/g, "-");

    if (wallet) {
      // Register or update
      upsertCaller(callerId, name, wallet);
      console.log(`Registered/updated caller: ${name} (${callerId})`);
      if (wallet) console.log(`Wallet: ${wallet}`);
    }

    // Show details
    const caller = getCaller(callerId);
    if (!caller) {
      console.log(`Caller "${name}" not found. Use --wallet to register.`);
      return;
    }

    console.log("=== Caller Profile ===\n");
    console.log(formatReputation(caller));

    const calls = getCallerCalls(callerId);
    if (calls.length > 0) {
      console.log(`\n--- Call History (${calls.length} total) ---`);

      // Group by category
      const byCategory = new Map<string, number>();
      for (const c of calls) {
        byCategory.set(c.category, (byCategory.get(c.category) || 0) + 1);
      }
      console.log(`  Categories: ${[...byCategory].map(([k, v]) => `${k}(${v})`).join(", ")}`);

      // Win/loss by category
      const resolved = calls.filter(c => c.resolved && c.outcome !== "VOID");
      if (resolved.length > 0) {
        const byCatOutcome = new Map<string, { wins: number; losses: number }>();
        for (const c of resolved) {
          const entry = byCatOutcome.get(c.category) || { wins: 0, losses: 0 };
          if (c.outcome === "WIN") entry.wins++;
          else entry.losses++;
          byCatOutcome.set(c.category, entry);
        }
        console.log("  By category:");
        for (const [cat, { wins, losses }] of byCatOutcome) {
          const rate = ((wins / (wins + losses)) * 100).toFixed(0);
          console.log(`    ${cat}: ${wins}W ${losses}L (${rate}%)`);
        }
      }
    }
    return;
  }

  // List all callers
  const callers = getAllCallers();
  if (callers.length === 0) {
    console.log("No callers registered yet.");
    console.log("Register: bun run track -- --name NAME --wallet SOLANA_ADDRESS");
    return;
  }

  console.log("=== All Callers ===\n");
  for (const caller of callers) {
    const rep = calculateReputation(caller);
    const pnl = caller.totalWon - caller.totalLost;
    console.log(
      `  ${caller.name.padEnd(20)} ${String(rep.score).padEnd(5)} ${rep.tier.padEnd(12)} ${String(caller.totalCalls).padEnd(3)} calls  ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} SOL`
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
