#!/usr/bin/env node
/**
 * Baozi Claim & Alert Agent
 * Monitors wallets for claimable winnings, odds shifts, and closing markets.
 * Logs all alerts to alerts.log for proof of operation.
 */
import { Monitor } from './monitor';
import config from './config';

async function main() {
  const startTime = new Date().toISOString();
  console.log('=== Baozi Claim & Alert Agent ===');
  console.log(`Started: ${startTime}`);
  console.log(`Wallets: ${config.walletAddresses.length}`);
  config.walletAddresses.forEach((w, i) => console.log(`  [${i + 1}] ${w}`));
  console.log(`Poll interval: ${config.pollIntervalMinutes} minutes`);
  console.log(`RPC: ${config.solanaRpcUrl}`);
  console.log(`Webhook: ${config.alertWebhookUrl ? 'configured' : 'none (logging only)'}`);
  console.log(`Thresholds: winnings=${config.winningsThreshold} SOL, odds_shift=${config.oddsShiftThreshold}%, close_warn=${config.marketCloseThreshold}min`);
  console.log('');

  if (config.walletAddresses.length === 0) {
    console.error('Error: No wallet addresses configured. Set WALLET_ADDRESSES in .env');
    process.exit(1);
  }

  const monitor = new Monitor();
  await monitor.start();

  // Keep alive
  process.on('SIGINT', () => {
    console.log(`\n[Agent] Shutting down. Ran since ${startTime}`);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log(`\n[Agent] Terminated. Ran since ${startTime}`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
