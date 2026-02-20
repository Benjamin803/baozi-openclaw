// Market Creator — Create Lab markets via Baozi MCP server
// Uses build_create_lab_market_transaction for proper on-chain creation

import { CONFIG, type Call } from "../config.ts";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { spawn, type ChildProcess } from "child_process";

const BAOZI_PROGRAM_ID = CONFIG.BAOZI_PROGRAM_ID;

interface MarketCreationResult {
  marketPda: string;
  txSignature: string;
  shareCardUrl: string;
}

interface BetResult {
  txSignature: string;
  amount: number;
  side: "YES" | "NO";
}

// ─── MCP Client ──────────────────────────────────────────────────────────

class MCPClient {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private pendingResolves: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private requestId = 0;
  private ready = false;

  async connect(): Promise<void> {
    this.proc = spawn("npx", ["@baozi.bet/mcp-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on("data", () => {});

    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "calls-tracker", version: "1.0.0" },
    });

    this.sendNotification("notifications/initialized", {});
    this.ready = true;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pendingResolves.has(msg.id)) {
          const { resolve, reject } = this.pendingResolves.get(msg.id)!;
          this.pendingResolves.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch {}
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestId++;
      const id = this.requestId;
      this.pendingResolves.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc!.stdin!.write(msg);
      setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingResolves.delete(id);
          reject(new Error(`MCP timeout for ${method}`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params: any): void {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.proc!.stdin!.write(msg);
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.ready) throw new Error("MCP not connected");
    return this.sendRequest("tools/call", { name, arguments: args });
  }

  close(): void {
    if (this.proc) { this.proc.kill(); this.proc = null; }
  }
}

let mcpClient: MCPClient | null = null;

async function getMCP(): Promise<MCPClient> {
  if (!mcpClient) {
    mcpClient = new MCPClient();
    console.log("  Connecting to Baozi MCP server...");
    await mcpClient.connect();
    console.log("  MCP connected!");
  }
  return mcpClient;
}

export function closeMCP(): void {
  if (mcpClient) { mcpClient.close(); mcpClient = null; }
}

function loadWallet(): Keypair | null {
  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const keyBytes = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
      return Keypair.fromSecretKey(Uint8Array.from(keyBytes));
    } catch {
      console.error("Invalid SOLANA_PRIVATE_KEY format");
    }
  }
  return null;
}

// ─── Market Creation via MCP ─────────────────────────────────────────────

export async function createMarket(call: Call): Promise<MarketCreationResult | null> {
  console.log(`\n--- Creating Market from Call ---`);
  console.log(`  Question: ${call.question}`);
  console.log(`  Category: ${call.category}`);
  console.log(`  Close: ${call.closingTime.toISOString()}`);
  if (call.eventTime) console.log(`  Event: ${call.eventTime.toISOString()}`);

  if (CONFIG.DRY_RUN) {
    console.log("  [DRY RUN] Market validated, would create on-chain");
    return {
      marketPda: `DRY_${call.id}_${Date.now().toString(36)}`,
      txSignature: `dry_run_${call.id}`,
      shareCardUrl: buildShareCardUrl("DRY_RUN"),
    };
  }

  const wallet = loadWallet();
  if (!wallet) {
    console.error("  No wallet — set SOLANA_PRIVATE_KEY");
    return null;
  }

  console.log(`  Wallet: ${wallet.publicKey.toBase58()}`);

  try {
    const mcp = await getMCP();

    // Step 1: Validate
    console.log("  Validating via MCP...");
    const validResult = await mcp.callTool("validate_market_question", {
      question: call.question,
      closing_time: call.closingTime.toISOString(),
      market_type: "typeA",
      event_time: call.eventTime?.toISOString() || new Date(call.closingTime.getTime() + 24 * 3600000).toISOString(),
    });
    const validText = (validResult.content || []).map((c: any) => c.text || "").join("\n");

    if (validText.toLowerCase().includes("rejected") || validText.toLowerCase().includes("not valid")) {
      console.log(`  REJECTED by MCP validation: ${validText.slice(0, 200)}`);
      return null;
    }
    console.log("  Validation: PASSED");

    // Step 2: Build transaction via MCP
    console.log("  Building transaction via MCP...");
    const createResult = await mcp.callTool("build_create_lab_market_transaction", {
      question: call.question,
      closing_time: call.closingTime.toISOString(),
      market_type: "typeA",
      event_time: call.eventTime?.toISOString() || new Date(call.closingTime.getTime() + 24 * 3600000).toISOString(),
      category: call.category,
      data_source: call.dataSource || "CoinGecko",
      creator_wallet: wallet.publicKey.toBase58(),
    });

    const createText = (createResult.content || []).map((c: any) => c.text || "").join("\n");

    // Parse JSON response
    let txData: any;
    try {
      txData = JSON.parse(createText);
    } catch {
      // Try to extract base64 tx from text
      const txMatch = createText.match(/[A-Za-z0-9+/]{100,}={0,2}/);
      if (!txMatch) {
        console.error("  Could not extract transaction from MCP response");
        console.log(`  Response: ${createText.slice(0, 300)}`);
        return null;
      }
      txData = { success: true, transaction: { serialized: txMatch[0] } };
    }

    if (!txData.success) {
      console.error(`  MCP creation failed: ${txData.error || "unknown"}`);
      return null;
    }

    const base64Tx = txData.transaction?.serialized;
    if (!base64Tx) {
      console.error("  No serialized transaction in response");
      return null;
    }

    const marketPda = txData.transaction?.marketPda || "unknown";
    console.log(`  Market PDA: ${marketPda}`);

    // Step 3: Sign and send
    const conn = new Connection(CONFIG.RPC_URL, "confirmed");
    const txBuf = Buffer.from(base64Tx, "base64");
    const tx = Transaction.from(txBuf);

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);

    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    console.log(`  TX: ${sig}`);
    console.log(`  Explorer: https://solscan.io/tx/${sig}`);

    const confirmation = await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (confirmation.value.err) {
      console.error("  Transaction failed:", confirmation.value.err);
      return null;
    }

    console.log("  CONFIRMED on mainnet!");

    return {
      marketPda,
      txSignature: sig,
      shareCardUrl: buildShareCardUrl(marketPda, wallet.publicKey.toBase58()),
    };
  } catch (err) {
    console.error(`  Market creation failed: ${(err as Error).message}`);
    return null;
  }
}

// Place a bet on the caller's own prediction
export async function placeBet(call: Call): Promise<BetResult | null> {
  if (!call.marketPda) {
    console.error("No market PDA — create market first");
    return null;
  }

  if (CONFIG.DRY_RUN) {
    console.log(`[DRY RUN] Would bet ${call.betAmount} SOL on ${call.betSide} for market ${call.marketPda}`);
    return {
      txSignature: `dry_run_bet_${call.id}`,
      amount: call.betAmount,
      side: call.betSide,
    };
  }

  // Betting requires MCP build_place_bet_transaction tool
  console.log(`  Betting ${call.betAmount} SOL on ${call.betSide} (requires funded wallet)`);
  return null;
}

// Build share card URL
export function buildShareCardUrl(marketPda: string, wallet?: string, ref?: string): string {
  const params = new URLSearchParams({ market: marketPda });
  if (wallet) params.set("wallet", wallet);
  if (ref) params.set("ref", ref);
  return `${CONFIG.BAOZI_SHARE_CARD_URL}?${params.toString()}`;
}

// Get market positions for a wallet
export async function getPositions(wallet: string): Promise<Array<{ marketPda: string; side: string; amount: number }>> {
  try {
    const resp = await fetch(`${CONFIG.BAOZI_API}/positions?wallet=${wallet}`);
    if (!resp.ok) return [];
    return await resp.json() as Array<{ marketPda: string; side: string; amount: number }>;
  } catch {
    return [];
  }
}
