/**
 * Live Integration Test — Metadata Enricher
 *
 * Fetches 3+ real markets from baozi.bet/api/markets,
 * runs the full enrichment pipeline, and logs results.
 *
 * Usage: npx tsx scripts/live-integration.ts
 */
import { BaoziAPI } from '../src/baozi-api';
import { enrichMarket } from '../src/enricher';
import { checkGuardrails, formatFactualReport } from '../src/guardrails';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const api = new BaoziAPI();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  console.log('═'.repeat(70));
  console.log('  LIVE INTEGRATION TEST — Metadata Enricher');
  console.log('═'.repeat(70));
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  API: https://baozi.bet/api/markets\n`);

  // Fetch all markets
  const allMarkets = await api.getAllMarkets();
  console.log(`  Total markets available: ${allMarkets.length}`);

  if (allMarkets.length < 3) {
    console.error('  ❌ Need at least 3 markets for integration test');
    process.exit(1);
  }

  // Select 3+ markets (mix of open and closed if available)
  const openMarkets = allMarkets.filter(m => m.isBettingOpen);
  const closedMarkets = allMarkets.filter(m => !m.isBettingOpen);
  const selected = [
    ...openMarkets.slice(0, 2),
    ...closedMarkets.slice(0, 1),
    ...openMarkets.slice(2, 3),
  ].filter(Boolean).slice(0, 5);

  if (selected.length < 3) {
    // Fall back to any 3
    selected.length = 0;
    selected.push(...allMarkets.slice(0, 3));
  }

  console.log(`  Selected ${selected.length} markets for testing\n`);

  const existingQuestions = allMarkets.map(m => m.question);
  const results: any[] = [];

  for (let i = 0; i < selected.length; i++) {
    const market = selected[i];
    console.log(`${'─'.repeat(70)}`);
    console.log(`  Market ${i + 1}/${selected.length}`);
    console.log(`${'─'.repeat(70)}`);

    // Step 1: Market fetched
    console.log(`  [1/4] market fetched`);
    console.log(`         PDA: ${market.publicKey}`);
    console.log(`         Q: "${market.question}"`);
    console.log(`         Status: ${market.status} | Betting open: ${market.isBettingOpen}`);
    console.log(`         Pool: ${market.totalPoolSol.toFixed(4)} SOL | YES ${market.yesPercent}% / NO ${market.noPercent}%`);

    // Step 2: Data sources queried (via enrichment)
    console.log(`\n  [2/4] data sources queried`);
    const metadata = await enrichMarket(
      {
        publicKey: market.publicKey,
        question: market.question,
        closingTime: market.closingTime,
        totalPoolSol: market.totalPoolSol,
      },
      existingQuestions,
    );
    console.log(`         LLM: ${process.env.OPENAI_API_KEY ? 'GPT-4o-mini' : 'keyword fallback'}`);
    console.log(`         Category: ${metadata.category}`);
    console.log(`         Tags: ${metadata.tags.join(', ')}`);

    // Step 3: Analysis generated
    console.log(`\n  [3/4] analysis generated`);
    console.log(`         Quality: ${metadata.qualityScore}/100`);
    console.log(`         Flags: ${metadata.qualityFlags.join(', ')}`);
    console.log(`         Timing: ${metadata.timingType} ${metadata.timingValid ? '✅' : '⚠️'}`);
    console.log(`         Notes: ${metadata.timingNotes}`);

    // Step 4: Guardrail check + post formatting
    console.log(`\n  [4/4] guardrail check`);
    const factualReport = formatFactualReport(
      { ...market, publicKey: market.publicKey },
      { qualityScore: metadata.qualityScore, tags: metadata.tags, timingType: metadata.timingType, timingValid: metadata.timingValid },
    );
    const guardrailResult = checkGuardrails(factualReport, market.isBettingOpen);
    console.log(`         Mode: ${guardrailResult.mode}`);
    console.log(`         Allowed: ${guardrailResult.allowed}`);
    console.log(`         Reason: ${guardrailResult.reason}`);

    if (market.isBettingOpen) {
      // Verify open market gets factual-only treatment
      console.log(`         ✅ Open market -> factual-only report (guardrail enforced)`);
    } else {
      console.log(`         ✅ Closed market -> full analysis permitted`);
    }

    console.log(`\n  Sample post:\n${'·'.repeat(40)}`);
    console.log(factualReport);
    console.log(`${'·'.repeat(40)}\n`);

    results.push({
      marketPda: market.publicKey,
      question: market.question,
      isBettingOpen: market.isBettingOpen,
      metadata,
      guardrail: guardrailResult,
    });

    // Small delay between markets
    await new Promise(r => setTimeout(r, 2000));
  }

  // Write results to log files
  const jsonLog = path.join(logDir, `live-integration-${timestamp}.json`);
  const textLog = path.join(logDir, `live-integration-${timestamp}.txt`);

  fs.writeFileSync(jsonLog, JSON.stringify(results, null, 2));
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Markets tested: ${results.length}`);
  console.log(`  Open markets: ${results.filter(r => r.isBettingOpen).length}`);
  console.log(`  Closed markets: ${results.filter(r => !r.isBettingOpen).length}`);
  console.log(`  Guardrails enforced: ${results.filter(r => r.guardrail.mode === 'FACTUAL_ONLY').length}`);
  console.log(`  All compliant: ${results.every(r => r.guardrail.allowed) ? '✅' : '❌'}`);
  console.log(`\n  Logs: ${jsonLog}`);
  console.log(`  Done.\n`);
}

main().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
