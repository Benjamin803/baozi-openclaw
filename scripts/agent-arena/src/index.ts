#!/usr/bin/env bun
// Agent Arena — Live AI Betting Competition Dashboard
// Tracks agent wallets across Baozi prediction markets on Solana mainnet
// Fetches data directly from on-chain accounts via RPC

import {
  cmdArena,
  cmdLeaderboard,
  cmdAgent,
  cmdMarket,
  cmdWatch,
  cmdExport,
  cmdStats,
} from "./cli/commands.js";

const HELP = `
Agent Arena — Live AI Betting Competition Dashboard

Usage:
  bun run src/index.ts [command] [options]

Commands:
  arena              Full dashboard (leaderboard + active markets + resolved)
  leaderboard        Agent leaderboard sorted by P&L
  agent <wallet>     Detail view for a single agent (wallet address or name)
  market <id>        Single market arena view (market ID or PDA)
  watch [interval]   Auto-refreshing dashboard (default: 30s)
  export [path]      Export HTML + JSON (default: agent-arena.html)
  stats              Quick stats summary

Environment:
  HELIUS_RPC_URL     Helius RPC (recommended for higher rate limits)
  SOLANA_RPC_URL     Custom Solana RPC endpoint

Examples:
  bun run src/index.ts arena
  bun run src/index.ts leaderboard
  bun run src/index.ts agent 2hgph1xwES4mUtAX6kan8qcU27oSWeSXeew99CgVWcER
  bun run src/index.ts market 50
  bun run src/index.ts watch 15
  bun run src/index.ts export dashboard.html
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "arena":
    case undefined:
      await cmdArena();
      break;
    case "leaderboard":
    case "lb":
      await cmdLeaderboard();
      break;
    case "agent":
      await cmdAgent(args[0]);
      break;
    case "market":
      await cmdMarket(args[0]);
      break;
    case "watch":
      await cmdWatch(args[0] ? parseInt(args[0], 10) : 30);
      break;
    case "export":
      await cmdExport(args[0] || "agent-arena.html");
      break;
    case "stats":
      await cmdStats();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
