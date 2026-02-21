// Terminal dashboard renderer — box-drawing characters, color codes, formatted tables
// Renders both the arena view (per-market agent positions) and leaderboard

import type { ArenaReport, AgentStats, AgentMarketPosition } from "../api/arena.js";
import type { MarketArenaView } from "../api/arena.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";
const BG_DARK = "\x1b[40m";

// ─────────────────────────────────────────────────────────────────────────────
// Box drawing
// ─────────────────────────────────────────────────────────────────────────────

function box(title: string, content: string, width = 72): string {
  const top = `┌${"─".repeat(width - 2)}┐`;
  const bottom = `└${"─".repeat(width - 2)}┘`;
  const titleLine = `│ ${BOLD}${CYAN}${title.padEnd(width - 4)}${RESET} │`;
  const sep = `├${"─".repeat(width - 2)}┤`;

  const lines = content.split("\n").map((line) => {
    // Strip ANSI for length calc
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, width - 4 - stripped.length);
    return `│ ${line}${" ".repeat(padding)} │`;
  });

  return [top, titleLine, sep, ...lines, bottom].join("\n");
}

function divider(width = 72): string {
  return `${"─".repeat(width)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PnL coloring
// ─────────────────────────────────────────────────────────────────────────────

function pnlColor(pnl: number): string {
  if (pnl > 0) return `${GREEN}+${pnl.toFixed(4)}${RESET}`;
  if (pnl < 0) return `${RED}${pnl.toFixed(4)}${RESET}`;
  return `${DIM}0.0000${RESET}`;
}

function pnlSign(pnl: number): string {
  if (pnl > 0) return `+${pnl.toFixed(4)}`;
  return pnl.toFixed(4);
}

function streakStr(streak: number): string {
  if (streak > 0) return `${GREEN}🔥${streak}W${RESET}`;
  if (streak < 0) return `${RED}❄${Math.abs(streak)}L${RESET}`;
  return `${DIM}—${RESET}`;
}

function sideColor(side: string): string {
  if (side === "Yes") return `${GREEN}YES${RESET}`;
  if (side === "No") return `${RED}NO${RESET}`;
  if (side === "Both") return `${YELLOW}BOTH${RESET}`;
  return `${MAGENTA}${side}${RESET}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "Active":
      return `${GREEN}● LIVE${RESET}`;
    case "Closed":
      return `${YELLOW}◉ CLOSED${RESET}`;
    case "Resolved":
      return `${CYAN}✓ RESOLVED${RESET}`;
    case "Voided":
      return `${RED}✗ VOIDED${RESET}`;
    default:
      return status;
  }
}

function winBadge(isWinner: boolean | null): string {
  if (isWinner === true) return `${GREEN}✓ WIN${RESET}`;
  if (isWinner === false) return `${RED}✗ LOSS${RESET}`;
  return `${DIM}…${RESET}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function progressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `${GREEN}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export function renderLeaderboard(report: ArenaReport): string {
  const lines: string[] = [];

  lines.push(
    `${BOLD}${YELLOW}  AGENT ARENA — Leaderboard${RESET}  ${DIM}(${report.fetchedAt})${RESET}`
  );
  lines.push(
    `  ${report.totalAgents} agents │ ${report.totalMarkets} markets │ ${report.totalVolume.toFixed(2)} SOL total volume`
  );
  lines.push("");

  // Table header
  lines.push(
    `  ${BOLD}#   Agent               Wagered    P&L       Acc.   W/L    Streak  Open${RESET}`
  );
  lines.push(`  ${"─".repeat(76)}`);

  for (let i = 0; i < report.leaderboard.length; i++) {
    const a = report.leaderboard[i];
    const rank = `${i + 1}`.padStart(2);
    const nameStr = truncate(a.name, 18).padEnd(18);
    const wagered = `${a.totalWagered.toFixed(2)} SOL`.padStart(10);
    const pnl = pnlColor(a.pnl).padStart(20); // ANSI padding
    const acc = `${a.accuracy.toFixed(0)}%`.padStart(5);
    const wl = `${a.wins}/${a.losses}`.padStart(5);
    const streak = streakStr(a.streak);
    const open = `${a.openPositions}`.padStart(4);

    // Stripped for alignment
    const pnlStripped = pnlSign(a.pnl).padStart(9);
    const streakStripped =
      a.streak > 0
        ? `🔥${a.streak}W`.padStart(6)
        : a.streak < 0
          ? `❄${Math.abs(a.streak)}L`.padStart(6)
          : "—".padStart(6);

    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";

    lines.push(
      `  ${medal}${rank} ${nameStr} ${wagered}  ${pnlColor(a.pnl)}  ${acc}  ${wl}  ${streakStr(a.streak)}  ${open}`
    );
  }

  return box("AGENT ARENA — LEADERBOARD", lines.join("\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Market Arena View
// ─────────────────────────────────────────────────────────────────────────────

export function renderMarketArena(market: MarketArenaView): string {
  const lines: string[] = [];

  const q = truncate(market.question, 60);
  lines.push(`${BOLD}${q}${RESET}`);
  lines.push(
    `${statusBadge(market.status)}  Pool: ${BOLD}${market.totalPoolSol.toFixed(2)} SOL${RESET}  ID: ${DIM}${market.marketId}${RESET}`
  );

  if (market.type === "boolean") {
    const yp = market.yesPercent || 50;
    const np = market.noPercent || 50;
    lines.push(
      `${GREEN}YES ${yp.toFixed(1)}%${RESET} ${progressBar(yp, 30)} ${RED}${np.toFixed(1)}% NO${RESET}`
    );
    if (market.winningOutcome) {
      lines.push(
        `Winner: ${market.winningOutcome === "Yes" ? GREEN : RED}${BOLD}${market.winningOutcome}${RESET}`
      );
    }
  } else if (market.type === "race" && market.outcomes) {
    for (let i = 0; i < market.outcomes.length; i++) {
      const o = market.outcomes[i];
      const isWinner = market.winnerIndex === i;
      const prefix = isWinner ? `${GREEN}★${RESET}` : " ";
      const label = truncate(o.label, 20).padEnd(20);
      lines.push(
        `${prefix} ${label} ${o.pool.toFixed(2)} SOL (${o.percent.toFixed(1)}%) ${progressBar(o.percent, 15)}`
      );
    }
  }

  lines.push("");
  lines.push(`${BOLD}  Agent               Side      Bet         P&L        Result${RESET}`);
  lines.push(`  ${"─".repeat(64)}`);

  for (const a of market.agents) {
    const name = truncate(a.name, 18).padEnd(18);
    const side = sideColor(a.side).padEnd(18); // ANSI padding
    const bet = `${a.amountSol.toFixed(4)} SOL`.padStart(11);
    const pnl = pnlColor(a.pnlSol);
    const result = winBadge(a.isWinner);

    lines.push(`  ${name} ${sideColor(a.side)}  ${bet}  ${pnlColor(a.pnlSol)}  ${winBadge(a.isWinner)}`);
  }

  return box(`Market #${market.marketId}`, lines.join("\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Arena Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function renderFullDashboard(report: ArenaReport): string {
  const sections: string[] = [];

  // Header
  sections.push(`\n${BOLD}${YELLOW}╔════════════════════════════════════════════════════════════════════════╗${RESET}`);
  sections.push(`${BOLD}${YELLOW}║              AGENT ARENA — Live Competition Dashboard                ║${RESET}`);
  sections.push(`${BOLD}${YELLOW}╚════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  sections.push(
    `  ${BOLD}${report.totalAgents}${RESET} agents  │  ${BOLD}${report.totalMarkets}${RESET} markets  │  ${BOLD}${report.totalVolume.toFixed(2)}${RESET} SOL volume  │  ${DIM}${report.fetchedAt}${RESET}\n`
  );

  // Leaderboard
  sections.push(renderLeaderboard(report));

  // Active markets
  if (report.activeMarkets.length > 0) {
    sections.push(`\n${BOLD}${GREEN}═══ LIVE MARKETS (${report.activeMarkets.length}) ═══${RESET}\n`);
    for (const m of report.activeMarkets.slice(0, 10)) {
      sections.push(renderMarketArena(m));
      sections.push("");
    }
  }

  // Recent resolved markets
  if (report.resolvedMarkets.length > 0) {
    sections.push(
      `\n${BOLD}${CYAN}═══ RECENTLY RESOLVED (${report.resolvedMarkets.length}) ═══${RESET}\n`
    );
    for (const m of report.resolvedMarkets.slice(0, 5)) {
      sections.push(renderMarketArena(m));
      sections.push("");
    }
  }

  // Footer
  sections.push(`${DIM}Powered by Baozi prediction markets (FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ)${RESET}`);
  sections.push(`${DIM}Data fetched directly from Solana mainnet via RPC${RESET}\n`);

  return sections.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Detail View
// ─────────────────────────────────────────────────────────────────────────────

export function renderAgentDetail(agent: AgentStats): string {
  const lines: string[] = [];

  lines.push(`${BOLD}Agent: ${agent.name}${RESET}`);
  lines.push(`Wallet: ${DIM}${agent.wallet}${RESET}`);
  lines.push("");

  lines.push(`  Wagered:  ${BOLD}${agent.totalWagered.toFixed(4)} SOL${RESET}`);
  lines.push(`  Won:      ${GREEN}${agent.totalWon.toFixed(4)} SOL${RESET}`);
  lines.push(`  Lost:     ${RED}${agent.totalLost.toFixed(4)} SOL${RESET}`);
  lines.push(`  P&L:      ${pnlColor(agent.pnl)}`);
  lines.push(`  Accuracy: ${agent.accuracy.toFixed(1)}% (${agent.wins}W / ${agent.losses}L)`);
  lines.push(`  Streak:   ${streakStr(agent.streak)}`);
  lines.push(`  Open:     ${agent.openPositions} positions`);
  lines.push("");

  if (agent.activeMarkets.length > 0) {
    lines.push(`${BOLD}Active Positions:${RESET}`);
    for (const m of agent.activeMarkets) {
      const q = truncate(m.question, 40);
      lines.push(
        `  ${sideColor(m.side)} ${m.amountSol.toFixed(4)} SOL on "${q}" (${m.odds.toFixed(1)}% implied)`
      );
    }
    lines.push("");
  }

  if (agent.resolvedMarkets.length > 0) {
    lines.push(`${BOLD}Resolved Positions:${RESET}`);
    for (const m of agent.resolvedMarkets) {
      const q = truncate(m.question, 40);
      lines.push(
        `  ${winBadge(m.isWinner)} ${pnlColor(m.pnlSol)} on "${q}"`
      );
    }
  }

  return box(`Agent Detail: ${agent.name}`, lines.join("\n"));
}
