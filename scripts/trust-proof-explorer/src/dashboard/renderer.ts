import type { Proof, ProofStats, OracleInfo } from "../api/proofs.ts";

// ANSI colors
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  white: "\x1b[97m",
};

const W = 65;

function line(char = "─", width = W): string {
  return char.repeat(width);
}

function box(label: string, value: string): string {
  return `  ${C.dim}${label.padEnd(24)}${C.reset}${value}`;
}

function bar(count: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function renderProof(proof: Proof): string {
  const tierNames: Record<number, string> = {
    1: "Trustless",
    2: "Verified",
    3: "AI Research",
  };
  const tierName = tierNames[proof.tier] ?? `Tier ${proof.tier}`;

  const lines: string[] = [];
  lines.push(`${C.cyan}${C.bold}┌${"─".repeat(W - 2)}┐${C.reset}`);
  lines.push(
    `${C.cyan}│${C.reset} ${C.bold}${proof.title.padEnd(W - 4)}${C.reset} ${C.cyan}│${C.reset}`
  );
  lines.push(`${C.cyan}├${"─".repeat(W - 2)}┤${C.reset}`);
  lines.push(
    `${C.cyan}│${C.reset}  ${C.dim}Tier ${proof.tier} (${tierName}) · ${proof.layer} · ${proof.category} · ${proof.date}${C.reset}`
  );
  lines.push(`${C.cyan}│${C.reset}  ${C.dim}Resolved by: ${proof.resolvedBy}${C.reset}`);
  lines.push(`${C.cyan}│${C.reset}`);

  for (const m of proof.markets) {
    const outcomeColor = m.outcome === "YES" ? C.green : C.red;
    lines.push(
      `${C.cyan}│${C.reset}  ${C.bold}Q: ${m.question}${C.reset}`
    );
    lines.push(
      `${C.cyan}│${C.reset}     Outcome: ${outcomeColor}${C.bold}${m.outcome}${C.reset}`
    );
    const evShort =
      m.evidence.length > 80 ? m.evidence.slice(0, 77) + "..." : m.evidence;
    lines.push(`${C.cyan}│${C.reset}     Evidence: ${C.dim}${evShort}${C.reset}`);
    if (m.sourceUrl ?? m.source) {
      lines.push(
        `${C.cyan}│${C.reset}     Source: ${C.dim}${(m.sourceUrl ?? m.source).slice(0, 60)}${C.reset}`
      );
    }
    if (m.txSignature) {
      lines.push(
        `${C.cyan}│${C.reset}     Solscan: ${C.dim}https://solscan.io/tx/${m.txSignature.slice(0, 20)}...${C.reset}`
      );
    }
    lines.push(`${C.cyan}│${C.reset}`);
  }

  lines.push(`${C.cyan}└${"─".repeat(W - 2)}┘${C.reset}`);
  return lines.join("\n");
}

export function renderStats(stats: ProofStats, oracle: OracleInfo): string {
  const lines: string[] = [];
  lines.push(`\n${C.cyan}${C.bold}=== ORACLE STATS — ${oracle.name.toUpperCase()} ===${C.reset}\n`);
  lines.push(box("Total proof batches:", String(stats.totalProofs)));
  lines.push(box("Total markets resolved:", String(stats.totalMarkets)));
  lines.push(box("Avg markets/batch:", stats.avgMarketsPerProof.toFixed(1)));
  lines.push(box("Trust Score:", `${C.green}${stats.trustScore}%${C.reset} (${stats.disputes} disputes, ${stats.overturned} overturned)`));
  lines.push(box("Date range:", `${stats.dateRange.earliest} → ${stats.dateRange.latest}`));
  lines.push(box("Network:", oracle.network));
  lines.push("");

  // By tier
  lines.push(`${C.bold}  By Tier:${C.reset}`);
  const maxTier = Math.max(...Object.values(stats.byTier));
  for (const [tier, count] of Object.entries(stats.byTier).sort()) {
    const tierNames: Record<string, string> = { "1": "Trustless", "2": "Verified", "3": "AI Research" };
    const name = tierNames[tier] ?? `Tier ${tier}`;
    lines.push(`    Tier ${tier} (${name.padEnd(11)}) ${String(count).padStart(3)}  ${C.cyan}${bar(count, maxTier)}${C.reset}`);
  }
  lines.push("");

  // By category
  lines.push(`${C.bold}  By Category:${C.reset}`);
  const maxCat = Math.max(...Object.values(stats.byCategory));
  for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
    lines.push(`    ${cat.padEnd(18)} ${String(count).padStart(3)}  ${C.cyan}${bar(count, maxCat)}${C.reset}`);
  }
  lines.push("");

  // By layer
  lines.push(`${C.bold}  By Layer:${C.reset}`);
  const maxLayer = Math.max(...Object.values(stats.byLayer));
  for (const [layer, count] of Object.entries(stats.byLayer)) {
    lines.push(`    ${layer.padEnd(18)} ${String(count).padStart(3)}  ${C.cyan}${bar(count, maxLayer)}${C.reset}`);
  }

  return lines.join("\n");
}

export function renderComparison(): string {
  const lines: string[] = [];
  lines.push(`\n${C.cyan}${C.bold}=== TRUST COMPARISON ===${C.reset}\n`);

  const headers = ["Feature", "Baozi", "Polymarket", "Kalshi"];
  const rows = [
    ["Evidence stored", "IPFS + On-chain ✅", "None ❌", "None ❌"],
    ["Proof public", "YES — full trail ✅", "NO ❌", "NO ❌"],
    ["Multisig", "Squads (2-of-2) ✅", "UMA vote ⚠️", "Centralized ❌"],
    ["On-chain TX", "Visible ✅", "Visible ✅", "Partial ⚠️"],
    ["Dispute window", "6 hours ✅", "2 hours ⚠️", "None ❌"],
    ["Resolution time", "3min–24h ✅", "Variable", "Variable"],
    ["Transparency", `${C.green}FULL ✅${C.reset}`, "PARTIAL ⚠️", "MINIMAL ❌"],
  ];

  const colW = [20, 22, 14, 12];
  const divider = `  ${colW.map((w) => "─".repeat(w)).join("┼")}`;

  lines.push(
    "  " + headers.map((h, i) => h.padEnd(colW[i])).join("│")
  );
  lines.push(divider);
  for (const row of rows) {
    lines.push("  " + row.map((cell, i) => cell.padEnd(colW[i])).join("│"));
  }

  return lines.join("\n");
}

export function generateHTML(proofs: Proof[], stats: ProofStats, oracle: OracleInfo): string {
  const tierNames: Record<number, string> = { 1: "Trustless", 2: "Verified", 3: "AI Research" };

  const proofCards = proofs
    .map((proof) => {
      const markets = proof.markets
        .map(
          (m) => `
        <div class="market">
          <div class="question">${escHtml(m.question)}</div>
          <div class="outcome ${m.outcome === "YES" ? "yes" : "no"}">${m.outcome}</div>
          <div class="evidence">${escHtml(m.evidence)}</div>
          <div class="links">
            ${m.sourceUrl ? `<a href="${m.sourceUrl}" target="_blank">Source ↗</a>` : ""}
            ${m.txSignature ? `<a href="https://solscan.io/tx/${m.txSignature}" target="_blank">Solscan ↗</a>` : ""}
          </div>
        </div>`
        )
        .join("");

      return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${escHtml(proof.title)}</div>
          <div class="card-meta">
            <span class="badge tier">${tierNames[proof.tier] ?? `Tier ${proof.tier}`}</span>
            <span class="badge layer">${proof.layer}</span>
            <span class="badge cat">${proof.category}</span>
            <span class="date">${proof.date}</span>
          </div>
        </div>
        <div class="markets">${markets}</div>
        <div class="resolved-by">Resolved by: ${escHtml(proof.resolvedBy)}</div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trust Proof Explorer — Baozi</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --accent: #58a6ff; --green: #3fb950; --red: #f85149;
    --text: #c9d1d9; --muted: #8b949e; --yellow: #d29922;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',monospace; padding: 24px; }
  h1 { color: var(--accent); font-size: 1.8rem; margin-bottom: 4px; }
  .subtitle { color: var(--muted); margin-bottom: 32px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-value { font-size: 2rem; font-weight: 700; color: var(--accent); }
  .stat-label { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
  .section-title { font-size: 1.2rem; font-weight: 600; margin: 32px 0 16px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .cards { display: grid; gap: 20px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .card-title { font-weight: 600; font-size: 1.05rem; margin-bottom: 8px; }
  .card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
  .badge.tier { background: #1f3a5f; color: var(--accent); }
  .badge.layer { background: #1b2a1b; color: var(--green); }
  .badge.cat { background: #2d2000; color: var(--yellow); }
  .date { color: var(--muted); font-size: 0.8rem; margin-left: auto; }
  .markets { padding: 16px 20px; display: grid; gap: 16px; }
  .market { border-left: 3px solid var(--border); padding-left: 12px; }
  .question { font-weight: 500; margin-bottom: 6px; }
  .outcome { display: inline-block; padding: 2px 10px; border-radius: 4px; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; }
  .outcome.yes { background: #1b3a1b; color: var(--green); }
  .outcome.no { background: #3a1b1b; color: var(--red); }
  .evidence { color: var(--muted); font-size: 0.88rem; margin-bottom: 6px; line-height: 1.5; }
  .links { display: flex; gap: 12px; }
  .links a { color: var(--accent); font-size: 0.82rem; text-decoration: none; }
  .links a:hover { text-decoration: underline; }
  .resolved-by { padding: 10px 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.82rem; }
  .compare-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .compare-table th { background: var(--surface); color: var(--accent); padding: 10px 14px; text-align: left; border: 1px solid var(--border); }
  .compare-table td { padding: 10px 14px; border: 1px solid var(--border); font-size: 0.9rem; }
  .compare-table tr:nth-child(even) td { background: #0d1117; }
  footer { margin-top: 48px; text-align: center; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<h1>🔍 Trust Proof Explorer</h1>
<p class="subtitle">${oracle.name} — Every resolution has receipts. · ${oracle.network}</p>

<div class="stats-grid">
  <div class="stat-card"><div class="stat-value">${stats.totalMarkets}</div><div class="stat-label">Markets Resolved</div></div>
  <div class="stat-card"><div class="stat-value">${stats.totalProofs}</div><div class="stat-label">Proof Batches</div></div>
  <div class="stat-card"><div class="stat-value" style="color:var(--green)">${stats.trustScore}%</div><div class="stat-label">Trust Score</div></div>
  <div class="stat-card"><div class="stat-value">${stats.disputes}</div><div class="stat-label">Disputes Filed</div></div>
  <div class="stat-card"><div class="stat-value">${stats.dateRange.earliest}</div><div class="stat-label">First Resolution</div></div>
  <div class="stat-card"><div class="stat-value">${stats.dateRange.latest}</div><div class="stat-label">Latest Resolution</div></div>
</div>

<div class="section-title">Resolution Proofs</div>
<div class="cards">${proofCards}</div>

<div class="section-title">Baozi vs The Rest</div>
<table class="compare-table">
  <thead><tr><th>Feature</th><th>Baozi</th><th>Polymarket</th><th>Kalshi</th></tr></thead>
  <tbody>
    <tr><td>Evidence stored</td><td>IPFS + On-chain ✅</td><td>None ❌</td><td>None ❌</td></tr>
    <tr><td>Proof public</td><td>YES — full trail ✅</td><td>NO ❌</td><td>NO ❌</td></tr>
    <tr><td>Multisig</td><td>Squads (2-of-2) ✅</td><td>UMA vote ⚠️</td><td>Centralized ❌</td></tr>
    <tr><td>On-chain TX</td><td>Visible ✅</td><td>Visible ✅</td><td>Partial ⚠️</td></tr>
    <tr><td>Dispute window</td><td>6 hours ✅</td><td>2 hours ⚠️</td><td>None ❌</td></tr>
    <tr><td>Transparency</td><td><strong>FULL ✅</strong></td><td>PARTIAL ⚠️</td><td>MINIMAL ❌</td></tr>
  </tbody>
</table>

<footer>Generated by Trust Proof Explorer · Program: ${oracle.program} · <a href="https://baozi.bet" style="color:var(--accent)">baozi.bet</a></footer>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
