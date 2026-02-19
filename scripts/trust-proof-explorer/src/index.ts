#!/usr/bin/env bun
// Trust Proof Explorer — Verifiable oracle transparency dashboard
//
// Usage:
//   bun run src/index.ts explorer [--tier N] [--category CAT] [--search TEXT] [--pda PDA]
//   bun run src/index.ts stats
//   bun run src/index.ts export [--html|--json|--markdown] [-o FILE]
//   bun run src/index.ts demo

const command = process.argv[2];

async function main() {
  switch (command) {
    case "explorer":
    case "explore":
    case "proofs":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/explorer.ts");
      break;
    case "stats":
    case "oracle":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/stats.ts");
      break;
    case "export":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/export.ts");
      break;
    case "demo":
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import("./cli/demo.ts");
      break;
    default:
      console.log("Trust Proof Explorer v1.0.0");
      console.log("Every resolution has receipts.\n");
      console.log("Commands:");
      console.log("  explorer  — Browse resolution proofs with filters");
      console.log("  stats     — Oracle performance metrics");
      console.log("  export    — Generate HTML dashboard / JSON / Markdown");
      console.log("  demo      — Full showcase with live data");
      console.log();
      console.log("Examples:");
      console.log("  bun run src/index.ts explorer --search BTC");
      console.log("  bun run src/index.ts stats");
      console.log("  bun run src/index.ts export --html -o dashboard.html");
      break;
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
