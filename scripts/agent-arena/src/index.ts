import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", magenta: "\x1b[35m", white: "\x1b[97m",
};

interface AgentStat {
  wallet: string; name: string;
  totalWagered: number; totalWon: number; totalLost: number; pnl: number;
  openPositions: number; resolvedPositions: number;
  accuracy: number; wins: number; losses: number; streak: number;
  activeMarkets: number; resolvedMarkets: number;
}

interface ArenaData {
  leaderboard: AgentStat[];
  markets?: unknown[];
  generatedAt?: string;
}

function loadData(): ArenaData {
  try {
    const raw = readFileSync(join(ROOT, "agent-arena.json"), "utf8");
    return JSON.parse(raw) as ArenaData;
  } catch {
    return { leaderboard: [] };
  }
}

function pnlColor(pnl: number): string {
  if (pnl > 0) return `${C.green}+${pnl.toFixed(4)}${C.reset}`;
  if (pnl < 0) return `${C.red}${pnl.toFixed(4)}${C.reset}`;
  return `${C.dim}0.0000${C.reset}`;
}

function streakStr(s: number): string {
  if (s > 0) return `${C.green}+${s}🔥${C.reset}`;
  if (s < 0) return `${C.red}${s}❄️${C.reset}`;
  return `${C.dim}—${C.reset}`;
}

function renderLeaderboard(data: ArenaData) {
  const agents = [...data.leaderboard].sort((a, b) => b.pnl - a.pnl);
  const totalVolume = agents.reduce((s, a) => s + a.totalWagered, 0);
  const totalAgents = agents.length;

  console.log(`\n${C.yellow}${C.bold}╔════════════════════════════════════════════════════════╗`);
  console.log(`║              🤖 AGENT ARENA — LEADERBOARD              ║`);
  console.log(`╚════════════════════════════════════════════════════════╝${C.reset}\n`);
  console.log(`${C.dim}Agents: ${totalAgents} · Total Volume: ${totalVolume.toFixed(4)} SOL · Live from baozi.bet${C.reset}\n`);

  const hdr = `${"#".padEnd(3)} ${"Agent".padEnd(14)} ${"PnL (SOL)".padStart(12)} ${"Acc%".padStart(6)} ${"W/L".padStart(5)} ${"Streak".padStart(8)} ${"Open".padStart(5)}`;
  console.log(`${C.cyan}${hdr}${C.reset}`);
  console.log("─".repeat(58));

  agents.slice(0, 20).forEach((a, i) => {
    const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${String(i + 1).padStart(2)}.`;
    const name = a.name.padEnd(14);
    const pnl = pnlColor(a.pnl).padEnd(12);
    const acc = `${a.accuracy}%`.padStart(6);
    const wl = `${a.wins}/${a.losses}`.padStart(5);
    const streak = streakStr(a.streak);
    const open = String(a.openPositions).padStart(5);
    console.log(`${rank} ${name} ${pnl} ${acc} ${wl} ${streak} ${open}`);
  });

  if (agents.length > 20) {
    console.log(`${C.dim}\n  ... and ${agents.length - 20} more agents${C.reset}`);
  }
  console.log();
}

function renderArena(data: ArenaData) {
  renderLeaderboard(data);
  const agents = data.leaderboard;
  const topAgent = [...agents].sort((a, b) => b.pnl - a.pnl)[0];
  const mostActive = [...agents].sort((a, b) => b.openPositions - a.openPositions)[0];

  console.log(`${C.cyan}${C.bold}=== ARENA HIGHLIGHTS ===${C.reset}\n`);
  if (topAgent) {
    console.log(`  🏆 Top performer:  ${C.green}${topAgent.name}${C.reset} · PnL: ${pnlColor(topAgent.pnl)} · Accuracy: ${topAgent.accuracy}%`);
  }
  if (mostActive) {
    console.log(`  🔥 Most active:    ${C.yellow}${mostActive.name}${C.reset} · ${mostActive.openPositions} open positions`);
  }
  const winning = agents.filter(a => a.pnl > 0).length;
  const losing = agents.filter(a => a.pnl < 0).length;
  console.log(`\n  📊 ${C.green}${winning} agents profitable${C.reset} · ${C.red}${losing} in the red${C.reset} · ${agents.length - winning - losing} flat`);
  console.log();
}

function exportArena(data: ArenaData) {
  const htmlPath = join(ROOT, "agent-arena.html");
  const ts = new Date().toISOString();
  let html: string;
  try {
    html = readFileSync(htmlPath, "utf8");
  } catch {
    html = `<!-- No HTML template found. Generated at ${ts} -->\n${JSON.stringify(data, null, 2)}`;
  }
  const outPath = join(process.cwd(), "agent-arena-export.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`${C.green}✓ Exported arena dashboard → agent-arena-export.html${C.reset}`);
  console.log(`${C.dim}  Open in browser: open agent-arena-export.html${C.reset}`);
}

function watchArena(data: ArenaData) {
  console.log(`${C.cyan}Agent Arena — Live Watch Mode${C.reset}`);
  console.log(`${C.dim}(Polling every 30s. Press Ctrl+C to stop.)${C.reset}\n`);
  renderArena(data);

  let tick = 0;
  const interval = setInterval(() => {
    tick++;
    const freshData = loadData();
    console.clear();
    console.log(`${C.dim}Refresh #${tick} · ${new Date().toLocaleTimeString()}${C.reset}`);
    renderArena(freshData);
  }, 30_000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log(`\n${C.dim}Watch stopped.${C.reset}`);
    process.exit(0);
  });
}

const cmd = process.argv[2] ?? "arena";
const data = loadData();

switch (cmd) {
  case "leaderboard": renderLeaderboard(data); break;
  case "watch": watchArena(data); break;
  case "export": exportArena(data); break;
  case "arena": default: renderArena(data); break;
}
