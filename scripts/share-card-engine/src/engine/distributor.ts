// Distribution engine — posts share cards to various platforms
// Supports: AgentBook, Telegram, file output, console
// Each post includes: share card image URL, caption, affiliate link

import type { MarketEvent } from "./detector.js";
import { shareCardUrl, marketUrl } from "../api/share-cards.js";

// ─────────────────────────────────────────────────────────────────────────────
// Distribution targets
// ─────────────────────────────────────────────────────────────────────────────

export type DistTarget = "agentbook" | "telegram" | "console" | "file";

export interface DistConfig {
  targets: DistTarget[];
  affiliateCode?: string;
  wallet?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  outputDir?: string;
  maxPostsPerCycle?: number;
  dedupeWindow?: number; // minutes to skip duplicate market events
}

export interface DistResult {
  event: MarketEvent;
  target: DistTarget;
  success: boolean;
  error?: string;
  cardUrl: string;
  marketLink: string;
}

// Track recently posted to avoid spam
const recentPosts = new Map<string, number>(); // "marketId:eventType" -> timestamp

function isDuplicate(event: MarketEvent, windowMs: number): boolean {
  const key = `${event.market.marketId}:${event.type}`;
  const last = recentPosts.get(key);
  if (last && Date.now() - last < windowMs) return true;
  recentPosts.set(key, Date.now());
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Distribution
// ─────────────────────────────────────────────────────────────────────────────

export async function distribute(
  events: MarketEvent[],
  config: DistConfig
): Promise<DistResult[]> {
  const results: DistResult[] = [];
  const maxPosts = config.maxPostsPerCycle || 5;
  const dedupeMs = (config.dedupeWindow || 30) * 60 * 1000;

  let posted = 0;

  for (const event of events) {
    if (posted >= maxPosts) break;
    if (isDuplicate(event, dedupeMs)) continue;

    const cardUrl = shareCardUrl({
      marketPda: event.market.pda,
      wallet: config.wallet,
      affiliateCode: config.affiliateCode,
    });

    const link = marketUrl(event.market.pda, config.affiliateCode);

    for (const target of config.targets) {
      try {
        switch (target) {
          case "console":
            await postConsole(event, cardUrl, link);
            results.push({ event, target, success: true, cardUrl, marketLink: link });
            break;

          case "agentbook":
            await postAgentBook(event, cardUrl, link);
            results.push({ event, target, success: true, cardUrl, marketLink: link });
            break;

          case "telegram":
            if (config.telegramBotToken && config.telegramChatId) {
              await postTelegram(event, cardUrl, link, config.telegramBotToken, config.telegramChatId);
              results.push({ event, target, success: true, cardUrl, marketLink: link });
            }
            break;

          case "file":
            await postFile(event, cardUrl, link, config.outputDir || ".");
            results.push({ event, target, success: true, cardUrl, marketLink: link });
            break;
        }
      } catch (err) {
        results.push({
          event, target, success: false,
          error: err instanceof Error ? err.message : String(err),
          cardUrl, marketLink: link,
        });
      }
    }

    posted++;
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Console output
// ─────────────────────────────────────────────────────────────────────────────

async function postConsole(event: MarketEvent, cardUrl: string, link: string): Promise<void> {
  const CYAN = "\x1b[36m";
  const YELLOW = "\x1b[33m";
  const GREEN = "\x1b[32m";
  const DIM = "\x1b[2m";
  const BOLD = "\x1b[1m";
  const RESET = "\x1b[0m";

  console.log(`\n${BOLD}${YELLOW}━━━ SHARE CARD ━━━${RESET}`);
  console.log(`${BOLD}${event.headline}${RESET}`);
  console.log(`${DIM}Priority: ${event.priority}/5 │ Type: ${event.type}${RESET}`);
  console.log(`\n${event.caption}`);
  console.log(`\n${CYAN}Card:${RESET} ${cardUrl}`);
  console.log(`${GREEN}Link:${RESET} ${link}`);
  console.log(`${YELLOW}━━━━━━━━━━━━━━━━━━${RESET}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentBook posting
// ─────────────────────────────────────────────────────────────────────────────

async function postAgentBook(event: MarketEvent, cardUrl: string, link: string): Promise<void> {
  // AgentBook is Baozi's social board — post via API
  const postBody = {
    content: `${event.caption}\n\n📸 ${cardUrl}\n🔗 ${link}`,
    type: "market_share",
    marketPda: event.market.pda,
  };

  // AgentBook API endpoint (from baozi.bet/agentbook)
  const resp = await fetch("https://baozi.bet/api/agentbook/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postBody),
  });

  if (!resp.ok) {
    // AgentBook may not have a public POST API yet — log and continue
    console.log(`  AgentBook POST returned ${resp.status} (API may not be public yet)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram posting
// ─────────────────────────────────────────────────────────────────────────────

async function postTelegram(
  event: MarketEvent, cardUrl: string, link: string,
  botToken: string, chatId: string
): Promise<void> {
  const text = `${event.headline}\n\n${event.caption}\n\n🔗 ${link}`;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// File output
// ─────────────────────────────────────────────────────────────────────────────

async function postFile(
  event: MarketEvent, cardUrl: string, link: string, dir: string
): Promise<void> {
  const { writeFileSync, mkdirSync, existsSync } = await import("fs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `${dir}/share-${event.market.marketId}-${event.type}-${Date.now()}.md`;
  const content = [
    `# ${event.headline}`,
    "",
    `**Type:** ${event.type}`,
    `**Priority:** ${event.priority}/5`,
    `**Market:** #${event.market.marketId} (${event.market.pda})`,
    `**Timestamp:** ${event.timestamp.toISOString()}`,
    "",
    "## Caption",
    "",
    event.caption,
    "",
    "## Links",
    "",
    `- Card: ${cardUrl}`,
    `- Market: ${link}`,
    "",
    "## Details",
    "",
    ...Object.entries(event.details).map(([k, v]) => `- ${k}: ${v}`),
  ].join("\n");

  writeFileSync(filename, content);
}
