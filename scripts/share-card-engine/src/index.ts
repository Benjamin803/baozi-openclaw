import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
};

const PROOFS_API = "https://baozi.bet/api/agents/proofs";
const WALLET = "GpXHXs5KfzfXbNKcMLNbAMsJsgPsBE7y5GtwVoiuxYvH";

type EventType = "just_resolved" | "closing_soon" | "new_market";

interface ShareCard {
  marketId: string;
  eventType: EventType;
  question: string;
  caption: string;
  cardUrl: string;
  marketLink: string;
  timestamp: string;
  priority: number;
}

interface ProofMarket {
  pda: string; question: string; outcome: string;
  evidence: string; source: string; sourceUrl?: string; txSignature?: string;
}
interface Proof {
  id: number; title: string; date: string; layer: string;
  tier: number; category: string; markets: ProofMarket[];
  resolvedBy: string; createdAt: string;
}

const PROVERBS = [
  "心急吃不了热豆腐 — you can't rush hot tofu. patience.",
  "谋事在人，成事在天 — you make your bet, the market decides.",
  "慢工出细活 — slow work produces fine craft.",
  "好饭不怕晚 — good resolution doesn't fear being late.",
  "新菜上桌 — new dish on the table.",
  "凡事有度 — all things in measure.",
  "时来运转 — when the time comes, fortune turns.",
];

function randomProverb(): string {
  return PROVERBS[Math.floor(Math.random() * PROVERBS.length)];
}

function cardUrl(pda: string): string {
  return `https://baozi.bet/api/share/card?market=${pda}&wallet=${WALLET}`;
}

function marketLink(pda: string): string {
  return `https://baozi.bet/market/${pda}`;
}

function generateCard(market: ProofMarket, proof: Proof, eventType: EventType): ShareCard {
  const short = market.question.length > 60
    ? market.question.slice(0, 57) + "…"
    : market.question;

  let caption = "";
  if (eventType === "just_resolved") {
    caption = `${randomProverb()}\n\n` +
      `✅ Resolved: "${short}"\n` +
      `📋 Outcome: ${market.outcome}\n` +
      `🔍 Evidence: ${market.evidence.slice(0, 100)}\n` +
      `🏷️ ${proof.layer} · Tier ${proof.tier}\n\n` +
      `Full proof trail →`;
  } else if (eventType === "new_market") {
    caption = `${randomProverb()}\n\n` +
      `📊 "${short}"\n` +
      `🏷️ ${proof.layer}\n\n` +
      `🎲 Be the first to bet →`;
  } else {
    caption = `${randomProverb()}\n\n` +
      `⏳ Closing soon: "${short}"\n` +
      `📌 ${proof.category}\n\n` +
      `⚡ Place your bet →`;
  }

  return {
    marketId: market.pda.slice(0, 8) + "…",
    eventType,
    question: market.question,
    caption,
    cardUrl: cardUrl(market.pda),
    marketLink: marketLink(market.pda),
    timestamp: new Date().toISOString(),
    priority: eventType === "just_resolved" ? 5 : eventType === "closing_soon" ? 4 : 3,
  };
}

function formatMarkdown(card: ShareCard, proof: Proof): string {
  const icons: Record<EventType, string> = {
    just_resolved: "✅",
    closing_soon: "⏳",
    new_market: "🆕",
  };
  const labels: Record<EventType, string> = {
    just_resolved: "Resolved",
    closing_soon: "Closing Soon",
    new_market: "New market",
  };

  return [
    `# ${icons[card.eventType]} ${labels[card.eventType]}: "${card.question.slice(0, 60)}…"`,
    "",
    `**Type:** ${card.eventType}`,
    `**Priority:** ${card.priority}/5`,
    `**Market:** ${card.marketId} (${proof.category})`,
    `**Timestamp:** ${card.timestamp}`,
    "",
    "## Caption",
    "",
    card.caption,
    "",
    "## Links",
    "",
    `- Card: ${card.cardUrl}`,
    `- Market: ${card.marketLink}`,
    "",
    "## Details",
    "",
    `- layer: ${proof.layer}`,
    `- tier: ${proof.tier}`,
    `- resolvedBy: ${proof.resolvedBy}`,
  ].join("\n");
}

function saveCard(card: ShareCard, proof: Proof, idx: number) {
  const outDir = join(ROOT, "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const filename = `share-${idx}-${card.eventType}-${Date.now()}.md`;
  const content = formatMarkdown(card, proof);
  writeFileSync(join(outDir, filename), content, "utf8");
  return filename;
}

function updateMetrics(cards: ShareCard[]) {
  const metricsPath = join(ROOT, "share-card-metrics.json");
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(readFileSync(metricsPath, "utf8")); } catch {}

  const byType: Record<string, number> = {};
  for (const c of cards) byType[c.eventType] = (byType[c.eventType] ?? 0) + 1;

  const updated = {
    ...existing,
    totalPosts: ((existing.totalPosts as number) ?? 0) + cards.length,
    lastPostTime: new Date().toISOString(),
    latestRun: { cards: cards.length, byType },
  };
  writeFileSync(metricsPath, JSON.stringify(updated, null, 2), "utf8");
}

async function generate(target: "console" | "file" = "console") {
  console.log(`\n${C.cyan}${C.bold}=== SHARE CARD ENGINE ===${C.reset}`);
  console.log(`${C.dim}Fetching market data from baozi.bet...${C.reset}\n`);

  const res = await fetch(PROOFS_API);
  const data = await res.json() as { proofs: Proof[] };
  const proofs: Proof[] = data.proofs ?? [];

  const cards: ShareCard[] = [];
  let idx = 0;

  for (const proof of proofs.slice(0, 5)) {
    for (const market of proof.markets.slice(0, 2)) {
      const eventType: EventType = proof.markets.indexOf(market) === 0 ? "just_resolved" : "closing_soon";
      const card = generateCard(market, proof, eventType);
      cards.push(card);

      if (target === "console") {
        console.log(`${C.yellow}[${card.eventType.toUpperCase()}]${C.reset} ${market.question.slice(0, 50)}...`);
        console.log(`${C.dim}${card.caption.split("\n")[0]}${C.reset}`);
        console.log(`${C.cyan}Card: ${card.cardUrl.slice(0, 70)}...${C.reset}`);
        console.log();
      } else {
        const filename = saveCard(card, proof, idx);
        console.log(`${C.green}✓ Saved: ${filename}${C.reset}`);
      }
      idx++;
    }
  }

  updateMetrics(cards);
  console.log(`\n${C.green}✓ Generated ${cards.length} share cards${C.reset}`);
  return cards;
}

async function monitor() {
  console.log(`${C.cyan}Share Card Engine — Monitor Mode${C.reset}`);
  console.log(`${C.dim}Polling every 60s for notable market activity. Ctrl+C to stop.${C.reset}\n`);
  await generate("console");

  const interval = setInterval(async () => {
    console.log(`\n${C.dim}[${new Date().toLocaleTimeString()}] Checking for new activity...${C.reset}`);
    await generate("console");
  }, 60_000);

  process.on("SIGINT", () => { clearInterval(interval); process.exit(0); });
}

async function demo() {
  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════╗`);
  console.log(`║   SHARE CARD ENGINE — DEMO       ║`);
  console.log(`╚══════════════════════════════════╝${C.reset}\n`);
  await generate("file");
  console.log(`\n${C.dim}Check ./output/ for generated share card files.${C.reset}\n`);
}

const cmd = process.argv[2] ?? "demo";
switch (cmd) {
  case "monitor": await monitor(); break;
  case "generate": await generate("console"); break;
  case "demo": default: await demo(); break;
}
