#!/usr/bin/env bun
// Oracle Stats — Display oracle performance metrics
//
// Usage: bun run stats

import { fetchProofs, calculateStats } from "../api/proofs.ts";
import { renderStats, renderComparison } from "../dashboard/renderer.ts";

async function main() {
  console.log("=== TRUST PROOF EXPLORER — Oracle Stats ===\n");

  const proofs = await fetchProofs();
  const stats = calculateStats(proofs);

  console.log(renderStats(stats));
  console.log(renderComparison());
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
