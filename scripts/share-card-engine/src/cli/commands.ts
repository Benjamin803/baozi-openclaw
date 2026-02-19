// CLI commands — demo, monitor, scan, metrics

import { fetchMarkets, type MarketState } from "../api/markets.js";
import { detectEvents, type MarketEvent } from "../engine/detector.js";
import { distribute, type DistConfig } from "../engine/distributor.js";
import {
  loadMetrics,
  saveMetrics,
  recordPost,
  printMetricsSummary,
} from "../engine/metrics.js";
import { shareCardUrl, marketUrl, downloadShareCard } from "../api/share-cards.js";

const AFFILIATE_CODE = process.env.AFFILIATE_CODE || "";
const WALLET = process.env.WALLET || "";

// ─────────────────────────────────────────────────────────────────────────────
// demo — scan for events and show what would be posted
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdDemo(): Promise<void> {
  console.log("Share Card Viral Engine — Demo Mode\n");
  console.log("Fetching market data from Solana mainnet...\n");

  const state = await fetchMarkets();
  console.log(
    `Found ${state.booleans.length} boolean + ${state.races.length} race markets\n`
  );

  const events = detectEvents(state);
  console.log(`Detected ${events.length} notable events:\n`);

  for (const event of events) {
    const cardUrl = shareCardUrl({
      marketPda: event.market.pda,
      affiliateCode: AFFILIATE_CODE,
      wallet: WALLET,
    });
    const link = marketUrl(event.market.pda, AFFILIATE_CODE);

    console.log(`${"━".repeat(70)}`);
    console.log(`[${event.type}] Priority ${event.priority}/5`);
    console.log(`${event.headline}`);
    console.log(`\n${event.caption}`);
    console.log(`\nCard: ${cardUrl}`);
    console.log(`Link: ${link}`);
    console.log(
      `Details: ${Object.entries(event.details).map(([k, v]) => `${k}=${v}`).join(", ")}`
    );
  }

  console.log(`\n${"━".repeat(70)}`);
  console.log(`Total: ${events.length} events detected from ${state.booleans.length + state.races.length} markets`);
}

// ─────────────────────────────────────────────────────────────────────────────
// monitor — continuous monitoring loop
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdMonitor(intervalSec = 60): Promise<void> {
  console.log(`Share Card Viral Engine — Monitoring (every ${intervalSec}s)\n`);

  const config: DistConfig = {
    targets: ["console"],
    affiliateCode: AFFILIATE_CODE,
    wallet: WALLET,
    maxPostsPerCycle: 3,
    dedupeWindow: 30,
  };

  let prevState: MarketState | undefined;
  const metrics = loadMetrics();

  const cycle = async () => {
    try {
      const state = await fetchMarkets();
      const events = detectEvents(state, prevState);

      if (events.length > 0) {
        console.log(
          `\n[${new Date().toISOString()}] ${events.length} events detected`
        );

        const results = await distribute(events, config);

        for (const r of results) {
          if (r.success) {
            recordPost(metrics, {
              timestamp: new Date().toISOString(),
              marketId: r.event.market.marketId,
              eventType: r.event.type,
              target: r.target,
              cardUrl: r.cardUrl,
              marketLink: r.marketLink,
              affiliateCode: AFFILIATE_CODE,
            });
          }
        }

        saveMetrics(metrics);
      } else {
        process.stdout.write(".");
      }

      prevState = state;
    } catch (err) {
      console.error("Cycle error:", err);
    }
  };

  await cycle();
  setInterval(cycle, intervalSec * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// scan — one-shot scan, post to configured targets
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdScan(targets: string[] = ["console"]): Promise<void> {
  console.log("Share Card Viral Engine — Single Scan\n");

  const config: DistConfig = {
    targets: targets as DistConfig["targets"],
    affiliateCode: AFFILIATE_CODE,
    wallet: WALLET,
    maxPostsPerCycle: 10,
    dedupeWindow: 5,
  };

  const state = await fetchMarkets();
  const events = detectEvents(state);

  console.log(
    `${state.booleans.length + state.races.length} markets, ${events.length} events\n`
  );

  if (events.length === 0) {
    console.log("No notable events detected.");
    return;
  }

  const results = await distribute(events, config);
  const metrics = loadMetrics();

  for (const r of results) {
    if (r.success) {
      recordPost(metrics, {
        timestamp: new Date().toISOString(),
        marketId: r.event.market.marketId,
        eventType: r.event.type,
        target: r.target,
        cardUrl: r.cardUrl,
        marketLink: r.marketLink,
        affiliateCode: AFFILIATE_CODE,
      });
    }
  }

  saveMetrics(metrics);

  const ok = results.filter((r) => r.success).length;
  console.log(`\nDistributed ${ok}/${results.length} share cards`);
}

// ─────────────────────────────────────────────────────────────────────────────
// generate — generate share card for a specific market
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdGenerate(marketPda: string, output?: string): Promise<void> {
  if (!marketPda) {
    console.error("Usage: share-card-engine generate <MARKET_PDA> [output.png]");
    process.exit(1);
  }

  const cardUrl = shareCardUrl({
    marketPda,
    wallet: WALLET,
    affiliateCode: AFFILIATE_CODE,
  });

  console.log(`Share card URL: ${cardUrl}`);
  console.log(`Market link: ${marketUrl(marketPda, AFFILIATE_CODE)}`);

  if (output) {
    const ok = await downloadShareCard(
      { marketPda, wallet: WALLET, affiliateCode: AFFILIATE_CODE },
      output
    );
    console.log(ok ? `Downloaded to ${output}` : "Download failed");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// metrics — show engagement metrics
// ─────────────────────────────────────────────────────────────────────────────

export async function cmdMetrics(): Promise<void> {
  const metrics = loadMetrics();
  printMetricsSummary(metrics);
}
