/**
 * Rate limiter for market enrichment pipeline.
 * Prevents hammering RPC / Baozi API when processing many markets.
 */

export interface RateLimiterConfig {
  /** Max markets to process per batch */
  batchSize: number;
  /** Delay (ms) between individual market enrichments */
  perItemDelayMs: number;
  /** Delay (ms) between batches */
  interBatchDelayMs: number;
  /** Max concurrent API calls (for future parallel use) */
  maxConcurrent: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  batchSize: 5,
  perItemDelayMs: 3000,
  interBatchDelayMs: 10000,
  maxConcurrent: 1,
};

export function getRateLimiterConfig(): RateLimiterConfig {
  return {
    batchSize: parseInt(process.env.BATCH_SIZE || String(DEFAULT_CONFIG.batchSize), 10),
    perItemDelayMs: parseInt(process.env.PER_ITEM_DELAY_MS || String(DEFAULT_CONFIG.perItemDelayMs), 10),
    interBatchDelayMs: parseInt(process.env.INTER_BATCH_DELAY_MS || String(DEFAULT_CONFIG.interBatchDelayMs), 10),
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT || String(DEFAULT_CONFIG.maxConcurrent), 10),
  };
}

/**
 * Split an array into batches of the given size.
 */
export function batchArray<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
