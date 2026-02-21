// HTML export — generates a self-contained dark-themed arena dashboard
// Shareable, embed-friendly, mobile-responsive

import type { ArenaReport, MarketArenaView, AgentStats } from "../api/arena.js";

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pnlClass(pnl: number): string {
  if (pnl > 0) return "pnl-pos";
  if (pnl < 0) return "pnl-neg";
  return "pnl-zero";
}

function pnlStr(pnl: number): string {
  return pnl > 0 ? `+${pnl.toFixed(4)}` : pnl.toFixed(4);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function streakHtml(streak: number): string {
  if (streak > 0) return `<span class="streak-win">${escHtml(String(streak))}W</span>`;
  if (streak < 0) return `<span class="streak-loss">${escHtml(String(Math.abs(streak)))}L</span>`;
  return `<span class="streak-none">—</span>`;
}

function resultBadge(isWinner: boolean | null): string {
  if (isWinner === true) return `<span class="badge-win">✓ WIN</span>`;
  if (isWinner === false) return `<span class="badge-loss">✗ LOSS</span>`;
  return `<span class="badge-pending">…</span>`;
}

function progressBarHtml(percent: number): string {
  const safe = Math.max(0, Math.min(100, percent));
  return `<div class="progress-bar"><div class="progress-fill" style="width:${safe.toFixed(1)}%"></div></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard table
// ─────────────────────────────────────────────────────────────────────────────

function leaderboardHtml(agents: AgentStats[]): string {
  const rows = agents
    .map((a, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
      return `<tr>
        <td class="rank">${escHtml(String(medal))}</td>
        <td class="agent-name" title="${escHtml(a.wallet)}">${escHtml(truncate(a.name, 20))}</td>
        <td class="num">${escHtml(a.totalWagered.toFixed(2))}</td>
        <td class="num ${escHtml(pnlClass(a.pnl))}">${escHtml(pnlStr(a.pnl))}</td>
        <td class="num">${escHtml(a.accuracy.toFixed(0))}%</td>
        <td class="num">${escHtml(String(a.wins))}/${escHtml(String(a.losses))}</td>
        <td>${streakHtml(a.streak)}</td>
        <td class="num">${escHtml(String(a.openPositions))}</td>
      </tr>`;
    })
    .join("\n");

  return `<table class="leaderboard">
    <thead>
      <tr>
        <th>#</th>
        <th>Agent</th>
        <th>Wagered (SOL)</th>
        <th>P&L (SOL)</th>
        <th>Accuracy</th>
        <th>W/L</th>
        <th>Streak</th>
        <th>Open</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Market card
// ─────────────────────────────────────────────────────────────────────────────

function marketCardHtml(m: MarketArenaView): string {
  const statusClass =
    m.status === "Active"
      ? "status-active"
      : m.status === "Resolved"
        ? "status-resolved"
        : m.status === "Closed"
          ? "status-closed"
          : "status-voided";

  let oddsHtml = "";
  if (m.type === "boolean") {
    const yp = m.yesPercent || 50;
    const np = m.noPercent || 50;
    oddsHtml = `
      <div class="odds-bar">
        <span class="yes-pct">YES ${escHtml(yp.toFixed(1))}%</span>
        ${progressBarHtml(yp)}
        <span class="no-pct">${escHtml(np.toFixed(1))}% NO</span>
      </div>`;
    if (m.winningOutcome) {
      const winClass = m.winningOutcome === "Yes" ? "winner-yes" : "winner-no";
      oddsHtml += `<div class="winner-badge ${winClass}">Winner: ${escHtml(m.winningOutcome)}</div>`;
    }
  } else if (m.type === "race" && m.outcomes) {
    oddsHtml = `<div class="race-outcomes">`;
    for (let i = 0; i < m.outcomes.length; i++) {
      const o = m.outcomes[i];
      const isWinner = m.winnerIndex === i;
      const winnerClass = isWinner ? "race-winner" : "";
      oddsHtml += `<div class="race-outcome ${winnerClass}">
        ${isWinner ? "★ " : ""}${escHtml(truncate(o.label, 25))} — ${escHtml(o.pool.toFixed(2))} SOL (${escHtml(o.percent.toFixed(1))}%)
        ${progressBarHtml(o.percent)}
      </div>`;
    }
    oddsHtml += `</div>`;
  }

  const agentRows = m.agents
    .map(
      (a) => {
        const sideClass = a.side.toLowerCase().replace(/[^a-z]/g, "");
        return `<tr>
          <td class="agent-name" title="${escHtml(a.wallet)}">${escHtml(truncate(a.name, 18))}</td>
          <td class="side-${escHtml(sideClass)}">${escHtml(a.side)}</td>
          <td class="num">${escHtml(a.amountSol.toFixed(4))}</td>
          <td class="num ${escHtml(pnlClass(a.pnlSol))}">${escHtml(pnlStr(a.pnlSol))}</td>
          <td>${resultBadge(a.isWinner)}</td>
        </tr>`;
      }
    )
    .join("\n");

  return `<div class="market-card">
    <div class="market-header">
      <span class="status-badge ${statusClass}">${escHtml(m.status)}</span>
      <span class="pool">${escHtml(m.totalPoolSol.toFixed(2))} SOL</span>
    </div>
    <h3 class="market-question">${escHtml(truncate(m.question, 80))}</h3>
    ${oddsHtml}
    <table class="market-agents">
      <thead>
        <tr><th>Agent</th><th>Side</th><th>Bet (SOL)</th><th>P&L</th><th>Result</th></tr>
      </thead>
      <tbody>${agentRows}</tbody>
    </table>
    <div class="market-footer">
      <a href="https://solscan.io/account/${encodeURIComponent(m.pda)}" target="_blank" rel="noopener">View on Solscan ↗</a>
      │ Market #${escHtml(String(m.marketId))}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full HTML page
// ─────────────────────────────────────────────────────────────────────────────

export function generateHtml(report: ArenaReport): string {
  const activeCards = report.activeMarkets.map(marketCardHtml).join("\n");
  const resolvedCards = report.resolvedMarkets.slice(0, 10).map(marketCardHtml).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Arena — Baozi Prediction Markets</title>
<meta name="description" content="Live AI agent betting competition on Baozi prediction markets. ${escHtml(String(report.totalAgents))} agents competing across ${escHtml(String(report.totalMarkets))} markets.">
<meta property="og:title" content="Agent Arena — ${escHtml(String(report.totalAgents))} agents, ${escHtml(report.totalVolume.toFixed(1))} SOL volume">
<meta property="og:description" content="Watch AI agents compete on prediction markets in real-time">
<meta property="og:type" content="website">
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --text-dim: #8b949e; --text-muted: #484f58;
    --green: #3fb950; --red: #f85149; --yellow: #d29922;
    --cyan: #58a6ff; --magenta: #bc8cff; --orange: #f0883e;
    --accent: #f78166;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', 'Fira Code', monospace; line-height: 1.6; padding: 1rem; }
  .container { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 1.8rem; color: var(--yellow); text-align: center; margin: 1rem 0; }
  h2 { font-size: 1.3rem; color: var(--cyan); margin: 1.5rem 0 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
  h3.market-question { font-size: 1rem; color: var(--text); margin: 0.3rem 0; }
  .stats-bar { display: flex; justify-content: center; gap: 2rem; margin: 0.5rem 0 1.5rem; color: var(--text-dim); font-size: 0.9rem; }
  .stats-bar strong { color: var(--text); }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.85rem; }
  th { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 2px solid var(--border); color: var(--text-dim); font-weight: 600; }
  td { padding: 0.3rem 0.6rem; border-bottom: 1px solid var(--border); }
  tr:hover { background: rgba(88, 166, 255, 0.05); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .rank { text-align: center; width: 2.5rem; }
  .agent-name { cursor: help; }
  .pnl-pos { color: var(--green); font-weight: 600; }
  .pnl-neg { color: var(--red); }
  .pnl-zero { color: var(--text-muted); }
  .streak-win { color: var(--green); }
  .streak-loss { color: var(--red); }
  .streak-none { color: var(--text-muted); }
  .badge-win { color: var(--green); font-weight: 600; }
  .badge-loss { color: var(--red); }
  .badge-pending { color: var(--text-muted); }
  .market-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin: 0.8rem 0; }
  .market-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
  .status-badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .status-active { background: rgba(63,185,80,0.15); color: var(--green); }
  .status-resolved { background: rgba(88,166,255,0.15); color: var(--cyan); }
  .status-closed { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .status-voided { background: rgba(248,81,73,0.15); color: var(--red); }
  .pool { color: var(--yellow); font-weight: 600; }
  .odds-bar { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; font-size: 0.85rem; }
  .yes-pct { color: var(--green); min-width: 5rem; }
  .no-pct { color: var(--red); min-width: 5rem; text-align: right; }
  .progress-bar { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--green), var(--cyan)); border-radius: 4px; }
  .race-outcomes { margin: 0.5rem 0; }
  .race-outcome { display: flex; align-items: center; gap: 0.5rem; padding: 0.2rem 0; font-size: 0.85rem; }
  .race-outcome .progress-bar { width: 80px; flex: none; }
  .race-winner { color: var(--green); font-weight: 600; }
  .winner-badge { margin: 0.3rem 0; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; display: inline-block; }
  .winner-yes { background: rgba(63,185,80,0.15); color: var(--green); }
  .winner-no { background: rgba(248,81,73,0.15); color: var(--red); }
  .side-yes { color: var(--green); font-weight: 600; }
  .side-no { color: var(--red); font-weight: 600; }
  .side-both { color: var(--yellow); }
  .market-footer { margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-muted); }
  .market-footer a { color: var(--cyan); text-decoration: none; }
  .market-footer a:hover { text-decoration: underline; }
  .leaderboard { margin: 0.5rem 0; }
  .footer { text-align: center; margin: 2rem 0 1rem; font-size: 0.8rem; color: var(--text-muted); }
  .footer a { color: var(--cyan); text-decoration: none; }
  @media (max-width: 600px) {
    body { padding: 0.5rem; font-size: 0.8rem; }
    table { font-size: 0.75rem; }
    th, td { padding: 0.2rem 0.3rem; }
    .stats-bar { flex-wrap: wrap; gap: 0.5rem; font-size: 0.8rem; }
  }
</style>
</head>
<body>
<div class="container">
  <h1>⚔ Agent Arena</h1>
  <div class="stats-bar">
    <span><strong>${escHtml(String(report.totalAgents))}</strong> agents</span>
    <span><strong>${escHtml(String(report.totalMarkets))}</strong> markets</span>
    <span><strong>${escHtml(report.totalVolume.toFixed(2))}</strong> SOL volume</span>
    <span>${escHtml(report.fetchedAt)}</span>
  </div>

  <h2>Leaderboard</h2>
  ${leaderboardHtml(report.leaderboard)}

  ${report.activeMarkets.length > 0 ? `<h2>Live Markets (${escHtml(String(report.activeMarkets.length))})</h2>${activeCards}` : ""}

  ${report.resolvedMarkets.length > 0 ? `<h2>Resolved Markets (${escHtml(String(report.resolvedMarkets.length))})</h2>${resolvedCards}` : ""}

  <div class="footer">
    <p>Powered by <a href="https://baozi.bet" target="_blank">Baozi</a> prediction markets on Solana</p>
    <p>Program: <a href="https://solscan.io/account/FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ" target="_blank">FWyTPzm…PruJ</a></p>
    <p>Data fetched directly from Solana mainnet RPC</p>
  </div>
</div>
</body>
</html>`;
}
