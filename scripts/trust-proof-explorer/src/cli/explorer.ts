#!/usr/bin/env bun
// Trust Proof Explorer — View resolution proofs with evidence trails
//
// Usage:
//   bun run explorer                        — Show all proofs
//   bun run explorer -- --tier 2            — Filter by tier
//   bun run explorer -- --category sports   — Filter by category
//   bun run explorer -- --search "BTC"      — Search by keyword
//   bun run explorer -- --pda Fsw...        — Look up specific market

import { fetchProofs, type ProofBatch } from "../api/proofs.ts";
import { renderBatch } from "../dashboard/renderer.ts";

function parseArgs(): { tier?: number; category?: string; search?: string; pda?: string } {
  const args = process.argv.slice(2);
  let tier: number | undefined;
  let category: string | undefined;
  let search: string | undefined;
  let pda: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--tier":
      case "-t":
        tier = parseInt(args[++i]);
        break;
      case "--category":
      case "-c":
        category = args[++i];
        break;
      case "--search":
      case "-s":
        search = args[++i];
        break;
      case "--pda":
      case "-p":
        pda = args[++i];
        break;
    }
  }

  return { tier, category, search, pda };
}

async function main() {
  const { tier, category, search, pda } = parseArgs();

  console.log("=== TRUST PROOF EXPLORER ===");
  console.log("Every resolution has receipts.\n");

  const proofs = await fetchProofs();
  let filtered = proofs;

  // Apply filters
  if (tier !== undefined) {
    filtered = filtered.filter(p => p.tier === tier);
    console.log(`Filter: Tier ${tier}`);
  }
  if (category) {
    const lower = category.toLowerCase();
    filtered = filtered.filter(p => p.category.toLowerCase().includes(lower));
    console.log(`Filter: Category "${category}"`);
  }
  if (search) {
    const lower = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.markets.some(m =>
        m.question.toLowerCase().includes(lower) ||
        m.evidence.toLowerCase().includes(lower)
      )
    );
    // Also filter individual markets within matching batches
    filtered = filtered.map(p => ({
      ...p,
      markets: p.markets.filter(m =>
        m.question.toLowerCase().includes(lower) ||
        m.evidence.toLowerCase().includes(lower)
      ),
    })).filter(p => p.markets.length > 0);
    console.log(`Filter: Search "${search}"`);
  }
  if (pda) {
    filtered = filtered.map(p => ({
      ...p,
      markets: p.markets.filter(m => m.pda.startsWith(pda)),
    })).filter(p => p.markets.length > 0);
    console.log(`Filter: PDA "${pda}"`);
  }

  if (filtered.length === 0) {
    console.log("\nNo proofs match your filters.");
    return;
  }

  const totalMarkets = filtered.reduce((sum, p) => sum + p.markets.length, 0);
  console.log(`\nShowing ${totalMarkets} markets across ${filtered.length} proof batches\n`);

  for (const batch of filtered) {
    console.log(renderBatch(batch));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
