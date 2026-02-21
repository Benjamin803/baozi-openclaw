#!/usr/bin/env bun
// Calls Tracker — Turn tweets into markets, build reputation on-chain
//
// Usage:
//   bun run src/index.ts call --caller NAME --prediction TEXT [--bet SOL]
//   bun run src/index.ts dashboard [--caller NAME] [--stats]
//   bun run src/index.ts resolve [--id CALL_ID --outcome WIN|LOSS|VOID]
//   bun run src/index.ts track [--name NAME --wallet ADDR]
//   bun run src/index.ts demo

import { CONFIG } from "./config.ts";

const command = process.argv[2];

async function main() {
  console.log(`Calls Tracker v1.0.0 ${CONFIG.DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log();

  switch (command) {
    case "call":
      // Shift args so sub-CLI sees them correctly
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/call.ts");
      break;
    case "dashboard":
    case "board":
    case "lb":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/dashboard.ts");
      break;
    case "resolve":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/resolve.ts");
      break;
    case "track":
    case "callers":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/track.ts");
      break;
    case "demo":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/demo.ts");
      break;
    case "live":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/live.ts");
      break;
    default:
      console.log("Commands:");
      console.log("  call       — Make a new prediction call");
      console.log("  dashboard  — View reputation leaderboard");
      console.log("  resolve    — Check and resolve outcomes");
      console.log("  track      — Manage callers");
      console.log("  demo       — Run demo with example calls");
      console.log("  live       — Create REAL markets on mainnet from parsed predictions");
      console.log();
      console.log("Examples:");
      console.log('  bun run src/index.ts call --caller "CryptoKing" --prediction "BTC $110k by March"');
      console.log('  bun run src/index.ts dashboard --caller "CryptoKing"');
      console.log('  bun run src/index.ts resolve --id abc123 --outcome WIN');
      console.log('  bun run src/index.ts demo');
      break;
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
