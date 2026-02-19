import cron from 'node-cron';
import { BaoziAPI, Market } from './baozi-api';
import { enrichMarket, MarketMetadata } from './enricher';
import { signMessage } from './signer';
import { config } from './config';
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

  const allMarkets = await api.getAllMarkets();
  const unanalyzed = allMarkets.filter(m => !analyzedMarkets.has(m.publicKey));

  if (unanalyzed.length === 0) {
    log('No new markets to analyze');
    return;
  }

  log(`Found ${unanalyzed.length} markets to analyze`);

  const existingQuestions = allMarkets.map(m => m.question);

  for (const market of unanalyzed) {
    const metadata = await enrichMarket(
      { publicKey: market.publicKey, question: market.question, closingTime: market.closingTime, totalPoolSol: market.totalPoolSol },
      existingQuestions
    );

    log(`Analyzed: "${market.question.substring(0, 50)}..." -> ${metadata.category} | Quality: ${metadata.qualityScore}/100 | Timing: ${metadata.timingType} ${metadata.timingValid ? '✅' : '❌'}`);

    const now = Date.now();

    // Post to AgentBook if cooldown allows
    if (now - lastPostTime >= POST_COOLDOWN_MS) {
      const post = formatEnrichmentPost(market, metadata);
      const success = await api.postToAgentBook(post, market.publicKey);
      if (success) {
        postCount++;
        lastPostTime = Date.now();
        log(`📝 AgentBook post #${postCount} for quality report`);
      }
      await sleep(5000);
    }

    // Comment on market if cooldown allows
    if (now - lastCommentTime >= COMMENT_COOLDOWN_MS) {
      const comment = formatEnrichmentComment(market, metadata);
      const messageText = `Enricher analysis for ${market.publicKey} at ${Date.now()}`;
      const { signature, message } = signMessage(messageText);

      const success = await api.commentOnMarket(market.publicKey, comment, signature, message);
      if (success) {
        commentCount++;
        lastCommentTime = Date.now();
        log(`💬 Comment #${commentCount} on "${market.question.substring(0, 50)}..."`);
      }
      await sleep(5000);
    }

    analyzedMarkets.add(market.publicKey);
    saveAnalyzedMarkets(analyzedMarkets);
  }
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
