// Engagement metrics tracker — logs posts and tracks referral attribution
// Stores data in a local SQLite-compatible JSON file

import { existsSync, readFileSync, writeFileSync } from "fs";

export interface PostMetric {
  timestamp: string;
  marketId: string;
  eventType: string;
  target: string;
  cardUrl: string;
  marketLink: string;
  affiliateCode?: string;
}

export interface EngineMetrics {
  totalPosts: number;
  postsByType: Record<string, number>;
  postsByTarget: Record<string, number>;
  marketsCovered: number;
  lastPostTime: string | null;
  history: PostMetric[];
}

const METRICS_FILE = "share-card-metrics.json";

export function loadMetrics(dir = "."): EngineMetrics {
  const path = `${dir}/${METRICS_FILE}`;
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return {
    totalPosts: 0,
    postsByType: {},
    postsByTarget: {},
    marketsCovered: 0,
    lastPostTime: null,
    history: [],
  };
}

export function saveMetrics(metrics: EngineMetrics, dir = "."): void {
  writeFileSync(`${dir}/${METRICS_FILE}`, JSON.stringify(metrics, null, 2));
}

export function recordPost(
  metrics: EngineMetrics,
  post: PostMetric
): void {
  metrics.totalPosts++;
  metrics.postsByType[post.eventType] = (metrics.postsByType[post.eventType] || 0) + 1;
  metrics.postsByTarget[post.target] = (metrics.postsByTarget[post.target] || 0) + 1;
  metrics.lastPostTime = post.timestamp;

  // Keep last 500 posts
  metrics.history.push(post);
  if (metrics.history.length > 500) {
    metrics.history = metrics.history.slice(-500);
  }

  // Count unique markets
  const uniqueMarkets = new Set(metrics.history.map((h) => h.marketId));
  metrics.marketsCovered = uniqueMarkets.size;
}

export function printMetricsSummary(metrics: EngineMetrics): void {
  console.log("\n📊 Share Card Engine Metrics");
  console.log("═══════════════════════════");
  console.log(`Total posts:      ${metrics.totalPosts}`);
  console.log(`Markets covered:  ${metrics.marketsCovered}`);
  console.log(`Last post:        ${metrics.lastPostTime || "never"}`);
  console.log("\nBy event type:");
  for (const [type, count] of Object.entries(metrics.postsByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }
  console.log("\nBy target:");
  for (const [target, count] of Object.entries(metrics.postsByTarget).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${target.padEnd(20)} ${count}`);
  }
}
