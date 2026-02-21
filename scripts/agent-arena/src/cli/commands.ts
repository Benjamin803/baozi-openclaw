// CLI command handlers — arena, leaderboard, agent, watch, export

import { fetchAllArenaData } from "../api/solana.js";
import { buildArenaReport } from "../api/arena.js";
import {
  renderFullDashboard,
  renderLeaderboard,
  renderAgentDetail,
  renderMarketArena,
} from "../dashboard/renderer.js";
import { generateHtml } from "../dashboard/html.js";
import { writeFileSync } from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// arena — full dashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdArena(): Promise<void> {
  console.log("Fetching on-chain data from Solana mainnet...\n");
  const data = await fetchAllArenaData();
  const report = buildArenaReport(data);
  console.log(renderFullDashboard(report));
}

// ─────────────────────────────────────────────────────────────────────────────
// leaderboard — just the leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdLeaderboard(): Promise<void> {
  console.log("Fetching on-chain data...\n");
  const data = await fetchAllArenaData();
  const report = buildArenaReport(data);
  console.log(renderLeaderboard(report));
}

// ─────────────────────────────────────────────────────────────────────────────
// agent <wallet> — detail view for a single agent
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdAgent(wallet: string): Promise<void> {
  if (!wallet) {
    console.error("Usage: agent-arena agent <WALLET_ADDRESS>");
    process.exit(1);
  }

  console.log("Fetching on-chain data...\n");
  const data = await fetchAllArenaData();
  const report = buildArenaReport(data);

  const agent = report.leaderboard.find(
    (a) => a.wallet === wallet || a.name.toLowerCase() === wallet.toLowerCase()
  );

  if (!agent) {
    console.error(`Agent not found: ${wallet}`);
    console.log(
      "\nKnown agents:\n" +
        report.leaderboard.map((a) => `  ${a.name} (${a.wallet})`).join("\n")
    );
    process.exit(1);
  }

  console.log(renderAgentDetail(agent));
}

// ─────────────────────────────────────────────────────────────────────────────
// market <marketId> — single market arena view
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdMarket(marketId: string): Promise<void> {
  if (!marketId) {
    console.error("Usage: agent-arena market <MARKET_ID>");
    process.exit(1);
  }

  console.log("Fetching on-chain data...\n");
  const data = await fetchAllArenaData();
  const report = buildArenaReport(data);

  const all = [...report.activeMarkets, ...report.resolvedMarkets];
  const market = all.find((m) => m.marketId === marketId || m.pda === marketId);

  if (!market) {
    console.error(`Market not found: ${marketId}`);
    console.log(
      "\nActive markets:\n" +
        report.activeMarkets
          .map((m) => `  #${m.marketId}: ${m.question.slice(0, 60)}`)
          .join("\n")
    );
    process.exit(1);
  }

  console.log(renderMarketArena(market));
}

// ─────────────────────────────────────────────────────────────────────────────
// watch — auto-refresh loop
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdWatch(intervalSec = 30): Promise<void> {
  console.log(`Agent Arena — watching every ${intervalSec}s (Ctrl+C to stop)\n`);

  const refresh = async () => {
    try {
      const data = await fetchAllArenaData();
      const report = buildArenaReport(data);

      // Clear screen
      process.stdout.write("\x1b[2J\x1b[H");
      console.log(renderFullDashboard(report));
      console.log(`\n  Next refresh in ${intervalSec}s...`);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  await refresh();
  setInterval(refresh, intervalSec * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// export — generate HTML file
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdExport(
  outputPath = "agent-arena.html"
): Promise<void> {
  console.log("Fetching on-chain data...\n");
  const data = await fetchAllArenaData();
  const report = buildArenaReport(data);

  const html = generateHtml(report);
  writeFileSync(outputPath, html);
  console.log(`Exported to ${outputPath}`);

  // Also output JSON
  const jsonPath = outputPath.replace(/\.html$/, ".json");
  const jsonReport = {
    ...report,
    leaderboard: report.leaderboard.map((a) => ({
      ...a,
      activeMarkets: a.activeMarkets.length,
      resolvedMarkets: a.resolvedMarkets.length,
    })),
  };
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`Exported to ${jsonPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// stats — quick summary
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdStats(): Promise<void> {
  console.log("Fetching on-chain data...\n");
  const data = await fetchAllArenaData();
  const report = buildArenaReport(data);

  console.log(`Agent Arena Stats`);
  console.log(`─────────────────`);
  console.log(`Agents:          ${report.totalAgents}`);
  console.log(`Markets:         ${report.totalMarkets}`);
  console.log(`  Active:        ${report.activeMarkets.length}`);
  console.log(`  Resolved:      ${report.resolvedMarkets.length}`);
  console.log(`Total Volume:    ${report.totalVolume.toFixed(4)} SOL`);
  console.log(`Top Agent:       ${report.leaderboard[0]?.name || "N/A"} (${report.leaderboard[0]?.pnl.toFixed(4) || 0} SOL P&L)`);
  console.log(`Fetched:         ${report.fetchedAt}`);

  console.log(`\nBooleans: ${data.markets.length} | Race: ${data.raceMarkets.length}`);
  console.log(`Positions: ${data.positions.length} bool + ${data.racePositions.length} race`);
  console.log(`Profiles: ${data.profiles.size}`);
}
