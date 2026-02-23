import { fetchProofs, computeStats } from "../api/proofs.ts";
import { renderProof, renderStats, renderComparison, generateHTML } from "../dashboard/renderer.ts";
import { writeFileSync } from "fs";

console.log("\x1b[36m\x1b[1m");
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║        TRUST PROOF EXPLORER — FULL DEMO                     ║");
console.log("║        Every resolution has receipts.                        ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log("\x1b[0m");

console.log("\x1b[2mFetching live data from baozi.bet...\x1b[0m\n");
const { proofs, oracle } = await fetchProofs();
const stats = computeStats(proofs);

console.log(`\x1b[32m✓ Fetched ${proofs.length} proof batches, ${stats.totalMarkets} resolved markets\x1b[0m\n`);

// Stats
console.log(renderStats(stats, oracle));

// Show first 3 proofs
console.log("\n\x1b[36m\x1b[1m=== SAMPLE RESOLUTION PROOFS ===\x1b[0m\n");
for (const proof of proofs.slice(0, 3)) {
  console.log(renderProof(proof));
  console.log();
}

if (proofs.length > 3) {
  console.log(`\x1b[2m... and ${proofs.length - 3} more proof batches. Run 'bun run explorer' to browse all.\x1b[0m\n`);
}

// Comparison
console.log(renderComparison());

// Export HTML
const html = generateHTML(proofs, stats, oracle);
const outPath = "trust-proof-explorer.html";
writeFileSync(outPath, html, "utf8");

console.log(`\n\x1b[32m✓ HTML dashboard exported → ${outPath}\x1b[0m`);
console.log("\x1b[2mOpen in browser: open trust-proof-explorer.html\x1b[0m\n");
