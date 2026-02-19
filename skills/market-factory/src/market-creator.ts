/**
 * Market Creator — On-chain market creation via MCP Server
 *
 * Uses @baozi.bet/mcp-server's build_create_lab_market_transaction tool
 * to create markets on-chain, then signs and submits the transaction.
 */
import {
  Connection,
  Keypair,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { MarketProposal } from './news-detector';
import { classifyAndValidateTiming, enforceTimingRules } from './news-detector';
import { recordMarket } from './tracker';
import { McpClient } from './mcp-client';

let connection: Connection;
let keypair: Keypair;
let mcpClient: McpClient | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(config.rpcEndpoint, 'confirmed');
  }
  return connection;
}

function getKeypair(): Keypair {
  if (!keypair) {
    const secretKey = bs58.decode(config.privateKey);
    keypair = Keypair.fromSecretKey(secretKey);
  }
  return keypair;
}

async function getMcpClient(): Promise<McpClient> {
  if (!mcpClient) {
    mcpClient = new McpClient();
    await mcpClient.start();
  }
  return mcpClient;
}

export interface CreateMarketResult {
  success: boolean;
  marketPda: string;
  marketId: number;
  txSignature: string;
  error?: string;
}

/**
 * Create a lab market using MCP server's build_create_lab_market_transaction.
 * 1. Validate timing rules
 * 2. Validate question via MCP
 * 3. Build unsigned tx via MCP
 * 4. Sign locally and submit to Solana
 */
export async function createLabMarket(proposal: MarketProposal): Promise<CreateMarketResult> {
  const conn = getConnection();
  const kp = getKeypair();

  try {
    // 1. Validate and enforce timing rules locally
    const timingCheck = classifyAndValidateTiming(proposal);
    if (!timingCheck.valid) {
      const adjusted = enforceTimingRules(proposal);
      if (!adjusted) {
        return { success: false, marketPda: '', marketId: 0, txSignature: '', error: `Timing violation: ${timingCheck.reason}` };
      }
      proposal = adjusted;
    }

    console.log(`  Timing: ${timingCheck.type} - ${timingCheck.reason}`);

    // 2. Get MCP client and validate question
    const mcp = await getMcpClient();

    try {
      const validation = await mcp.validateMarketQuestion(proposal.question);
      if (validation && !validation.valid) {
        return { success: false, marketPda: '', marketId: 0, txSignature: '', error: `Question validation failed: ${validation.issues.join(', ')}` };
      }
    } catch (e: any) {
      console.warn(`  MCP validation skipped: ${e.message}`);
    }

    // 3. Build unsigned transaction via MCP
    const closingTimeISO = proposal.closingTime.toISOString();
    let buildResult: any;

    try {
      buildResult = await mcp.buildCreateLabMarketTransaction({
        question: proposal.question,
        closingTime: closingTimeISO,
        creatorWallet: kp.publicKey.toBase58(),
        resolutionMode: 'CouncilOracle',
        councilMembers: [kp.publicKey.toBase58()],
      });
    } catch (e: any) {
      return { success: false, marketPda: '', marketId: 0, txSignature: '', error: `MCP build failed: ${e.message}` };
    }

    if (!buildResult || !buildResult.transaction) {
      return { success: false, marketPda: '', marketId: 0, txSignature: '', error: 'MCP returned no transaction data' };
    }

    // 4. Deserialize, sign, and send
    const txBuffer = Buffer.from(buildResult.transaction, 'base64');
    const tx = Transaction.from(txBuffer);
    tx.sign(kp);

    const txSignature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await conn.confirmTransaction(txSignature, 'confirmed');

    const marketPda = buildResult.marketPda || '';

    console.log(`\n  Market created via MCP!`);
    console.log(`  PDA: ${marketPda}`);
    console.log(`  TX: ${txSignature}`);

    // 5. Record in tracker
    recordMarket({
      market_pda: marketPda,
      market_id: 0,
      question: proposal.question,
      category: proposal.category,
      source: proposal.source,
      source_url: proposal.sourceUrl,
      closing_time: closingTimeISO,
      resolution_outcome: null,
      tx_signature: txSignature,
    });

    return { success: true, marketPda, marketId: 0, txSignature };
  } catch (err: any) {
    return { success: false, marketPda: '', marketId: 0, txSignature: '', error: err.message || String(err) };
  }
}

export async function getWalletBalance(): Promise<number> {
  const conn = getConnection();
  const kp = getKeypair();
  const balance = await conn.getBalance(kp.publicKey);
  return balance / 1_000_000_000;
}

export async function canAffordMarketCreation(): Promise<boolean> {
  const balance = await getWalletBalance();
  const needed = 0.015;
  if (balance < needed) {
    console.warn(`Low balance: ${balance.toFixed(4)} SOL (need ${needed} SOL)`);
    return false;
  }
  return true;
}

export async function shutdownMcp(): Promise<void> {
  if (mcpClient) {
    await mcpClient.stop();
    mcpClient = null;
  }
}
