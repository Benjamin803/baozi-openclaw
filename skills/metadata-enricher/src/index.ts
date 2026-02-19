import cron from 'node-cron';
import { BaoziAPI, Market } from './baozi-api';
import { enrichMarket, MarketMetadata } from './enricher';
import { signMessage } from './signer';
import { config } from './config';
import { getRateLimiterConfig, batchArray, sleep as rateSleep } from './rate-limiter';
import { checkGuardrails, formatFactualReport, sanitizeForOpenMarket } from './guardrails';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(__dirname, '..', 'enricher.log');
const STATE_FILE = path.join(__dirname, '..', 'analyzed-markets.json');

function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadAnalyzedMarkets(): Set<string> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return new Set(data);
    }
  } catch (e) {
    console.error('Error loading state:', e);
  }
  return new Set();
}

function saveAnalyzedMarkets(analyzed: Set<string>) {
  fs.writeFileSync(STATE_FILE, JSON.stringify([...analyzed], null, 2));
}

const api = new BaoziAPI();
let analyzedMarkets = loadAnalyzedMarkets();
let postCount = 0;
let commentCount = 0;

const POST_COOLDOWN_MS = 30 * 60 * 1000;
const COMMENT_COOLDOWN_MS = 60 * 60 * 1000;
let lastPostTime = 0;
let lastCommentTime = 0;

function formatEnrichmentPost(market: Market, metadata: MarketMetadata): string {
  // Guardrail check: open markets get factual-only reports
  if (market.isBettingOpen) {
    const factual = formatFactualReport(
      { ...market, publicKey: market.publicKey },
      { qualityScore: metadata.qualityScore, tags: metadata.tags, timingType: metadata.timingType, timingValid: metadata.timingValid }
    );
    log(`  🛡️ Guardrail: open market -> factual-only report`);
    return factual;
  }

  // Closed/resolved markets get full analysis
  const emoji = metadata.qualityScore >= 80 ? '🟢' : metadata.qualityScore >= 60 ? '🟡' : '🔴';
  let post = `${emoji} Market Quality Report\n\n`;
  post += `"${market.question}"\n\n`;
  post += `Category: ${metadata.category}\n`;
  post += `Tags: ${metadata.tags.join(', ')}\n`;
  post += `Quality: ${metadata.qualityScore}/100\n`;
  post += `Timing: ${metadata.timingType} - ${metadata.timingValid ? 'Compliant' : 'VIOLATION'}\n`;
  post += `Flags: ${metadata.qualityFlags.join(', ')}\n`;
  if (!metadata.timingValid) {
    post += `\n⚠️ ${metadata.timingNotes}\n`;
  }
  post += `\nbaozi.bet/market/${market.publicKey}`;
  return post.substring(0, 2000);
}

function formatEnrichmentComment(market: Market, metadata: MarketMetadata): string {
  return `Quality: ${metadata.qualityScore}/100 | ${metadata.category} | ${metadata.timingType} timing ${metadata.timingValid ? '✅' : '⚠️'} | ${metadata.qualityFlags.slice(0, 3).join(', ')}`.substring(0, 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeNewMarkets() {
  log('🔍 Checking for markets to analyze...');

  const rateLimiter = getRateLimiterConfig();
  log(`  Rate limits: batch=${rateLimiter.batchSize}, delay=${rateLimiter.perItemDelayMs}ms, interBatch=${rateLimiter.interBatchDelayMs}ms`);

  const allMarkets = await api.getAllMarkets();
  const unanalyzed = allMarkets.filter(m => !analyzedMarkets.has(m.publicKey));

  if (unanalyzed.length === 0) {
    log('No new markets to analyze');
    return;
  }

  log(`Found ${unanalyzed.length} markets to analyze (processing in batches of ${rateLimiter.batchSize})`);

  const existingQuestions = allMarkets.map(m => m.question);
  const batches = batchArray(unanalyzed, rateLimiter.batchSize);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    log(`\n📦 Batch ${batchIdx + 1}/${batches.length} (${batch.length} markets)`);

    for (const market of batch) {
      // Step 1: Fetch market data (already have it from allMarkets)
      log(`  [1/4] market fetched: "${market.question.substring(0, 60)}..."`);

      // Step 2: Enrich with LLM + data sources
      const metadata = await enrichMarket(
        { publicKey: market.publicKey, question: market.question, closingTime: market.closingTime, totalPoolSol: market.totalPoolSol },
        existingQuestions
      );
      log(`  [2/4] data sources queried -> ${metadata.category} | Quality: ${metadata.qualityScore}/100`);

      // Step 3: Generate analysis (already done in enrichment)
      log(`  [3/4] analysis generated -> Timing: ${metadata.timingType} ${metadata.timingValid ? '✅' : '❌'} | Flags: ${metadata.qualityFlags.join(', ')}`);

      const now = Date.now();

      // Step 4: Post with guardrail compliance
      if (now - lastPostTime >= POST_COOLDOWN_MS) {
        const post = formatEnrichmentPost(market, metadata);

        // Double-check guardrails before posting
        const guardrailCheck = checkGuardrails(post, market.isBettingOpen);
        if (!guardrailCheck.allowed) {
          log(`  🛡️ Guardrail blocked: ${guardrailCheck.violations.join('; ')}`);
          // Use sanitized version
          const sanitized = sanitizeForOpenMarket(post);
          const recheck = checkGuardrails(sanitized, market.isBettingOpen);
          if (recheck.allowed) {
            const success = await api.postToAgentBook(sanitized, market.publicKey);
            if (success) { postCount++; lastPostTime = Date.now(); }
          }
        } else {
          const success = await api.postToAgentBook(post, market.publicKey);
          if (success) {
            postCount++;
            lastPostTime = Date.now();
            log(`  [4/4] posted -> AgentBook post #${postCount} (${guardrailCheck.mode})`);
          }
        }
        await rateSleep(rateLimiter.perItemDelayMs);
      }

      // Comment on market if cooldown allows
      if (now - lastCommentTime >= COMMENT_COOLDOWN_MS) {
        const comment = formatEnrichmentComment(market, metadata);

        // Guardrail check on comments too
        const commentCheck = checkGuardrails(comment, market.isBettingOpen);
        if (commentCheck.allowed) {
          const messageText = `Enricher analysis for ${market.publicKey} at ${Date.now()}`;
          const { signature, message } = signMessage(messageText);

          const success = await api.commentOnMarket(market.publicKey, comment, signature, message);
          if (success) {
            commentCount++;
            lastCommentTime = Date.now();
            log(`  💬 Comment #${commentCount} on "${market.question.substring(0, 50)}..."`);
          }
        }
        await rateSleep(rateLimiter.perItemDelayMs);
      }

      analyzedMarkets.add(market.publicKey);
      saveAnalyzedMarkets(analyzedMarkets);
    }

    // Inter-batch delay
    if (batchIdx < batches.length - 1) {
      log(`  ⏳ Inter-batch delay: ${rateLimiter.interBatchDelayMs}ms`);
      await rateSleep(rateLimiter.interBatchDelayMs);
    }
  }

  log(`\n✅ Analysis complete. Posts: ${postCount}, Comments: ${commentCount}, Total analyzed: ${analyzedMarkets.size}`);
}

async function main() {
  log('🔬 Metadata Enricher starting (LLM-powered)...');
  log(`Wallet: ${config.walletAddress}`);
  log(`API: ${config.apiUrl}`);
  log(`LLM: ${process.env.OPENAI_API_KEY ? 'GPT-4o-mini' : 'Keyword fallback'}`);
  log(`Previously analyzed: ${analyzedMarkets.size} markets`);

  // Initial analysis
  await analyzeNewMarkets();

  // Poll every 2 hours
  cron.schedule(`0 */2 * * *`, async () => {
    log('⏰ Scheduled analysis trigger');
    await analyzeNewMarkets();
  });

  log('✅ Cron scheduled (every 2h). Running...');

  process.on('SIGINT', () => {
    log(`🛑 Shutting down. Posts: ${postCount}, Comments: ${commentCount}, Analyzed: ${analyzedMarkets.size}`);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log(`🛑 Shutting down. Posts: ${postCount}, Comments: ${commentCount}, Analyzed: ${analyzedMarkets.size}`);
    process.exit(0);
  });
}

main().catch(err => {
  log(`💥 Fatal: ${err}`);
  process.exit(1);
});
