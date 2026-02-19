#!/usr/bin/env bun
// Share Card Viral Engine — Every Bet Becomes a Billboard
// Monitors Baozi prediction markets for notable activity,
// generates share cards, and distributes them across platforms.

import {
  cmdDemo,
  cmdMonitor,
  cmdScan,
  cmdGenerate,
  cmdMetrics,
} from "./cli/commands.js";

const HELP = `
Share Card Viral Engine — Every Bet Becomes a Billboard

Usage:
  bun run src/index.ts [command] [options]

Commands:
  demo               Scan markets and preview all detected events
  monitor [interval]  Continuous monitoring (default: 60s)
  scan [targets...]   One-shot scan + distribute (targets: console, agentbook, telegram, file)
  generate <pda>     Generate share card for a specific market PDA
  metrics            Show engagement tracking metrics

Environment:
  AFFILIATE_CODE     Your Baozi affiliate/referral code
  WALLET             Your wallet address (shown on share cards)
  HELIUS_RPC_URL     Helius RPC (recommended)
  SOLANA_RPC_URL     Custom Solana RPC endpoint
  TELEGRAM_BOT_TOKEN Bot token for Telegram distribution
  TELEGRAM_CHAT_ID   Chat ID for Telegram distribution

Examples:
  bun run src/index.ts demo
  bun run src/index.ts monitor 30
  bun run src/index.ts scan console file
  bun run src/index.ts generate FswLya9oMFDPoFAFJziL4YT3v1sHn61g5kHvW3KLc527 card.png
  bun run src/index.ts metrics
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "demo":
    case undefined:
      await cmdDemo();
      break;
    case "monitor":
    case "watch":
      await cmdMonitor(args[0] ? parseInt(args[0], 10) : 60);
      break;
    case "scan":
      await cmdScan(args.length > 0 ? args : ["console"]);
      break;
    case "generate":
    case "gen":
      await cmdGenerate(args[0], args[1]);
      break;
    case "metrics":
    case "stats":
      await cmdMetrics();
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
