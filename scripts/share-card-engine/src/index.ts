import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m",
};

const PROVERBS = [
  "新菜上桌 — new dish on the table",
  "心急吃不了热豆腐 — you can't rush hot tofu",
  "慢工出细活 — slow work produces fine craft",
  "谋事在人，成事在天 — you make your bet, the market decides",
  "好饭不怕晚 — good resolution doesn't fear being late",
  "一口吃不成胖子 — one bite won't make you fat",
  "量力而行 — know your limits before you bet",
];

interface Market {
  id: number;
  question: string;
  pda: string;
  yesPercent?: number;
  noPercent?: number;
  pool?: number;
  closingTime?: string;
  layer?: string;
  resolved?: boolean;
  outcome?: string;
}

type EventType = "new_market" | "closing_soon" | "just_resolved" | "large_bet";

interface ShareCard {
  marketId: number;
  eventType: EventType;
  caption: string;
  cardUrl: string;
  marketLink: string;
  timestamp: string;
  priority: number;
}

interface Metrics {
  totalPosts: number;
  postsByType: Record<string, number>;
  postsByTarget: Record<string, number>;
  marketsCovered: number;
  lastPostTime: string;
  history: Array<{
    timestamp: string;
    marketId: number;
    eventType: string;
    target: string;
    cardUrl: string;
    marketLink: string;
  }>;
}

const WALLET = "GpXHXs5KfzfXbNKcMLNbAMsJsgPsBE7y5GtwVoiuxYvH";
const AFFILIATE = "";

function cardUrl(pda: string): string {
  return `https://baozi.bet/api/share/card?market=${pda}&wallet=${WALLET}${AFFILIATE ? `&ref=${AFFILIATE}` : ""}`;
}
function marketLink(pda: string): string {
  return `https://baozi.bet/market/${pda}`;
}
function randomProverb(): string {
  return PROVERBS[Math.floor(Math.random() * PROVERBS.length)];
}

function generateCaption(market: Market, eventType: EventType): string {
  const proverb = randomProverb();
  const odds = market.yesPercent != null
    ? `YES: ${market.yesPercent}% | NO: ${market.noPercent ?? 100 - market.yesPercent}%`
    : "odds loading...";
  const pool = market.pool ? `Pool: ${market.pool.toFixed(2)} SOL` : "";
  const link = marketLink(market.pda);

  switch (eventType) {
    case "new_market":
      return [
        `${proverb}`,
        ``,
        `📊 ${market.question}`,
        market.closingTime ? `⏰ Closes: ${market.closingTime}` : "",
        market.layer ? `🏷️ ${market.layer}` : "",
        ``,
        `🎲 Be the first to bet →`,
        `${link}`,
      ].filter(Boolean).join("\n");

    case "closing_soon":
      return [
        `⏰ closing soon — ${proverb}`,
        ``,
        `📊 ${market.question}`,
        `${odds}${pool ? ` | ${pool}` : ""}`,
        market.closingTime ? `🔔 Closes: ${market.closingTime}` : "",
        ``,
        `Last chance to bet →`,
        `${link}`,
      ].filter(Boolean).join("\n");

    case "just_resolved":
      return [
        `✅ resolved — ${proverb}`,
        ``,
        `📊 ${market.question}`,
        market.outcome ? `Outcome: ${market.outcome === "YES" ? "✅ YES" : "❌ NO"}` : "",
        ``,
        `See the proof →`,
        `${link}`,
      ].filter(Boolean).join("\n");

    case "large_bet":
      return [
        `🐋 big bet alert — ${proverb}`,
        ``,
        `📊 ${market.question}`,
        `${odds}${pool ? ` | ${pool}` : ""}`,
        ``,
        `Follow the whale →`,
        `${link}`,
      ].filter(Boolean).join("\n");
  }
}

function buildShareCard(market: Market, eventType: EventType): ShareCard {
  const priorities: Record<EventType, number> = {
    just_resolved: 5, large_bet: 4, closing_soon: 3, new_market: 2,
  };
  return {
    marketId: market.id,
    eventType,
    caption: generateCaption(market, eventType),
    cardUrl: cardUrl(market.pda),
    marketLink: marketLink(market.pda),
    timestamp: new Date().toISOString(),
    priority: priorities[eventType],
  };
}

function loadMetrics(): Metrics {
  try {
    return JSON.parse(readFileSync(join(ROOT, "share-card-metrics.json"), "utf8")) as Metrics;
  } catch {
    return { totalPosts: 0, postsByType: {}, postsByTarget: {}, marketsCovered: 0, lastPostTime: "", history: [] };
  }
}

function saveMetrics(m: Metrics) {
  writeFileSync(join(ROOT, "share-card-metrics.json"), JSON.stringify(m, null, 2));
}

function printCard(card: ShareCard) {
  console.log(`\n${C.cyan}┌─────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.cyan}│${C.reset} ${C.bold}${card.eventType.toUpperCase().replace("_", " ")}${C.reset} · Market #${card.marketId} · Priority ${card.priority}/5`);
  console.log(`${C.cyan}├─────────────────────────────────────────────────┤${C.reset}`);
  card.caption.split("\n").forEach(line => {
    console.log(`${C.cyan}│${C.reset} ${line}`);
  });
  console.log(`${C.cyan}├─────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.cyan}│${C.reset} ${C.dim}Card: ${card.cardUrl.slice(0, 50)}...${C.reset}`);
  console.log(`${C.cyan}└─────────────────────────────────────────────────┘${C.reset}`);
}

// Demo markets drawn from share-card samples in the repo
const DEMO_MARKETS: Market[] = [
  { id: 89, pda: "CJzs1rCuKfXnDyEWdzhenpgBbzSrAr9B5gK5uoW9fme", question: "Will Strategy (MSTR) hold over 750K BTC before Mar 31, 2026?", layer: "Lab", closingTime: "2026-03-28 00:00 UTC", eventType: undefined } as Market & { eventType: undefined },
  { id: 83, pda: "F5HFk5zWZZ5GfEEuLSHTz3aaqqgiAAJD4hdRF16F8syB", question: "Will Seattle Seahawks win Super Bowl LX?", resolved: true, outcome: "YES" } as Market,
  { id: 31, pda: "7pYbqwrjNxFQ4tHSRnHqwjHSaeLkJSAk7FGx1rxAP6tq", question: "Will BTC hit $110k by March 1, 2026?", yesPercent: 58, pool: 32.4, closingTime: "2026-03-01 00:00 UTC", layer: "Official" } as Market,
  { id: 37, pda: "9oiL41VuFskGkd3EPiLiVPoKJhUzKQViJz9CbxDS22BK", question: "Will ETH flip BTC in market cap by Q2 2026?", yesPercent: 12, pool: 8.7, closingTime: "2026-04-01 00:00 UTC", layer: "Lab" } as Market,
];

const cmd = process.argv[2] ?? "demo";

switch (cmd) {
  case "monitor": {
    console.log(`${C.cyan}${C.bold}Share Card Engine — Monitor Mode${C.reset}`);
    console.log(`${C.dim}Scanning for market events... (demo mode — no live API key)\n${C.reset}`);
    const events: Array<[Market, EventType]> = [
      [DEMO_MARKETS[0], "new_market"],
      [DEMO_MARKETS[2], "closing_soon"],
      [DEMO_MARKETS[3], "closing_soon"],
      [DEMO_MARKETS[1], "just_resolved"],
    ];
    const metrics = loadMetrics();
    for (const [market, eventType] of events) {
      const card = buildShareCard(market, eventType);
      printCard(card);
      metrics.totalPosts++;
      metrics.postsByType[eventType] = (metrics.postsByType[eventType] ?? 0) + 1;
      metrics.postsByTarget["console"] = (metrics.postsByTarget["console"] ?? 0) + 1;
      metrics.lastPostTime = card.timestamp;
      metrics.history.push({ timestamp: card.timestamp, marketId: card.marketId, eventType: card.eventType, target: "console", cardUrl: card.cardUrl, marketLink: card.marketLink });
    }
    metrics.marketsCovered = new Set(metrics.history.map(h => h.marketId)).size;
    saveMetrics(metrics);
    console.log(`\n${C.green}✓ Generated ${events.length} share cards · Metrics saved${C.reset}`);
    break;
  }

  case "generate": {
    const pda = process.argv[3];
    const eventType = (process.argv[4] as EventType) ?? "new_market";
    if (!pda) {
      console.log(`Usage: bun run generate -- <pda> [event_type]`);
      console.log(`Event types: new_market | closing_soon | just_resolved | large_bet`);
      process.exit(1);
    }
    const market: Market = { id: 0, pda, question: "Market question (provide via API)", layer: "Unknown" };
    const card = buildShareCard(market, eventType);
    printCard(card);
    break;
  }

  case "demo":
  default: {
    console.log(`${C.yellow}${C.bold}╔═══════════════════════════════════════════════════╗`);
    console.log(`║        📢 SHARE CARD ENGINE — FULL DEMO          ║`);
    console.log(`╚═══════════════════════════════════════════════════╝${C.reset}\n`);
    console.log(`${C.dim}Generating share cards for all event types...\n${C.reset}`);

    const demos: Array<[Market, EventType]> = [
      [DEMO_MARKETS[0], "new_market"],
      [DEMO_MARKETS[2], "closing_soon"],
      [DEMO_MARKETS[1], "just_resolved"],
      [DEMO_MARKETS[3], "large_bet"],
    ];

    const metrics = loadMetrics();
    const outDir = join(process.cwd(), "share-cards-output");
    try { mkdirSync(outDir, { recursive: true }); } catch {}

    for (const [market, eventType] of demos) {
      const card = buildShareCard(market, eventType);
      printCard(card);
      // Write to file
      const filename = `share-${market.id}-${eventType}-${Date.now()}.md`;
      const md = [
        `# ${eventType.replace("_", " ")}: "${market.question.slice(0, 60)}..."`,
        ``,
        `**Type:** ${eventType}`,
        `**Priority:** ${card.priority}/5`,
        `**Market:** #${market.id} (${market.pda})`,
        `**Timestamp:** ${card.timestamp}`,
        ``,
        `## Caption`,
        ``,
        card.caption,
        ``,
        `## Links`,
        ``,
        `- Card: ${card.cardUrl}`,
        `- Market: ${card.marketLink}`,
      ].join("\n");
      writeFileSync(join(outDir, filename), md);
      metrics.totalPosts++;
      metrics.postsByType[eventType] = (metrics.postsByType[eventType] ?? 0) + 1;
      metrics.postsByTarget["file"] = (metrics.postsByTarget["file"] ?? 0) + 1;
      metrics.lastPostTime = card.timestamp;
      metrics.history.push({ timestamp: card.timestamp, marketId: card.marketId, eventType: card.eventType, target: "file", cardUrl: card.cardUrl, marketLink: card.marketLink });
    }

    metrics.marketsCovered = new Set(metrics.history.map(h => h.marketId)).size;
    saveMetrics(metrics);

    console.log(`\n${C.green}✓ ${demos.length} share cards generated${C.reset}`);
    console.log(`${C.dim}  Files saved to: share-cards-output/`);
    console.log(`  Metrics: ${metrics.totalPosts} total posts across ${metrics.marketsCovered} markets${C.reset}`);
    break;
  }
}
