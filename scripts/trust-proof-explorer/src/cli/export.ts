import { fetchProofs, computeStats } from "../api/proofs.ts";
import { generateHTML } from "../dashboard/renderer.ts";
import { writeFileSync } from "fs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const asMarkdown = args.includes("--markdown");

const { proofs, oracle } = await fetchProofs();
const stats = computeStats(proofs);

if (asJson) {
  console.log(JSON.stringify({ proofs, stats, oracle }, null, 2));
  process.exit(0);
}

if (asMarkdown) {
  const lines: string[] = [
    "# Trust Proof Explorer Report",
    "",
    `**Oracle:** ${oracle.name} · ${oracle.network}`,
    `**Program:** \`${oracle.program}\``,
    `**Total markets resolved:** ${stats.totalMarkets}`,
    `**Trust score:** ${stats.trustScore}% (${stats.disputes} disputes)`,
    `**Date range:** ${stats.dateRange.earliest} → ${stats.dateRange.latest}`,
    "",
    "---",
    "",
    "## Resolution Proofs",
    "",
  ];

  for (const proof of proofs) {
    lines.push(`### ${proof.title}`);
    lines.push(`**Date:** ${proof.date} · **Layer:** ${proof.layer} · **Tier:** ${proof.tier} · **Category:** ${proof.category}`);
    lines.push(`**Resolved by:** ${proof.resolvedBy}`);
    lines.push("");

    for (const m of proof.markets) {
      lines.push(`**Q:** ${m.question}`);
      lines.push(`**Outcome:** ${m.outcome}`);
      lines.push(`**Evidence:** ${m.evidence}`);
      if (m.sourceUrl ?? m.source) lines.push(`**Source:** ${m.sourceUrl ?? m.source}`);
      if (m.txSignature) lines.push(`**Solscan:** https://solscan.io/tx/${m.txSignature}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  lines.push("## Trust Comparison");
  lines.push("");
  lines.push("| Feature | Baozi | Polymarket | Kalshi |");
  lines.push("|---|---|---|---|");
  lines.push("| Evidence stored | IPFS + On-chain ✅ | None ❌ | None ❌ |");
  lines.push("| Proof public | YES — full trail ✅ | NO ❌ | NO ❌ |");
  lines.push("| Multisig | Squads (2-of-2) ✅ | UMA vote ⚠️ | Centralized ❌ |");
  lines.push("| On-chain TX | Visible ✅ | Visible ✅ | Partial ⚠️ |");
  lines.push("| Dispute window | 6 hours ✅ | 2 hours ⚠️ | None ❌ |");
  lines.push("| Transparency | **FULL ✅** | PARTIAL ⚠️ | MINIMAL ❌ |");

  console.log(lines.join("\n"));
  process.exit(0);
}

// Default: generate HTML file
const html = generateHTML(proofs, stats, oracle);
const outPath = "trust-proof-explorer.html";
writeFileSync(outPath, html, "utf8");
console.log(`\x1b[32m✓ HTML dashboard exported to: ${outPath}\x1b[0m`);
console.log(`\x1b[2mOpen it in your browser: open ${outPath}\x1b[0m`);
