// Market Creator — Create Lab markets and place bets via Baozi MCP/API

import { CONFIG, type Call } from "../config.ts";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";

// Baozi Lab market creation via on-chain program
// Program: FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ

const BAOZI_PROGRAM = new PublicKey(CONFIG.BAOZI_PROGRAM_ID);

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

// Derive market PDA from question hash
function deriveMarketPda(question: string, creator: PublicKey): [PublicKey, number] {
  const questionHash = Buffer.from(
    new Uint8Array(
      new TextEncoder().encode(question).buffer
    ).slice(0, 32)
  );

  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), creator.toBuffer(), questionHash],
    BAOZI_PROGRAM,
  );
}

// Create a Lab market on Baozi
export async function createMarket(call: Call): Promise<MarketCreationResult | null> {
  if (CONFIG.DRY_RUN) {
    console.log("[DRY RUN] Would create market:");
    console.log(`  Question: ${call.question}`);
    console.log(`  Category: ${call.category}`);
    console.log(`  Type: ${call.marketType}`);
    console.log(`  Closes: ${call.closingTime.toISOString()}`);
    if (call.eventTime) console.log(`  Event: ${call.eventTime.toISOString()}`);
    if (call.measurementStart) console.log(`  Measurement: ${call.measurementStart.toISOString()} → ${call.measurementEnd?.toISOString()}`);

    // Generate a deterministic mock PDA for dry run
    const mockPda = `DRY_${call.id}_${Date.now().toString(36)}`;
    return {
      marketPda: mockPda,
      txSignature: `dry_run_${call.id}`,
      shareCardUrl: buildShareCardUrl(mockPda),
    };
  }

  const wallet = loadWallet();
  if (!wallet) {
    console.error("No wallet available — set SOLANA_PRIVATE_KEY env var");
    return null;
  }

  const connection = new Connection(CONFIG.RPC_URL, "confirmed");

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  const requiredLamports = CONFIG.LAB_CREATION_FEE_SOL * 1e9 + 10_000; // fee + tx cost
  if (balance < requiredLamports) {
    console.error(`Insufficient balance: ${balance / 1e9} SOL (need ${requiredLamports / 1e9} SOL)`);
    return null;
  }

  // Derive market PDA
  const [marketPda] = deriveMarketPda(call.question, wallet.publicKey);

  // Build creation instruction
  // The actual instruction data depends on the Baozi program IDL
  // For now, we use the MCP tool approach which handles serialization
  console.log(`Creating market: ${call.question.slice(0, 60)}...`);
  console.log(`  PDA: ${marketPda.toBase58()}`);
  console.log(`  Creator: ${wallet.publicKey.toBase58()}`);
  console.log(`  Fee: ${CONFIG.LAB_CREATION_FEE_SOL} SOL`);

  // Note: Real creation requires either:
  // 1. The Baozi MCP server (npx @baozi.bet/mcp-server) which handles tx building
  // 2. Direct instruction building using the program IDL
  // The MCP server is the recommended approach per the bounty spec

  // For production: use build_create_lab_market_transaction MCP tool
  // This creates the unsigned transaction, then we sign and send
  const txResult = await buildAndSendCreateMarketTx(connection, wallet, call, marketPda);
  if (!txResult) return null;

  const shareCardUrl = buildShareCardUrl(marketPda.toBase58(), wallet.publicKey.toBase58());

  return {
    marketPda: marketPda.toBase58(),
    txSignature: txResult,
    shareCardUrl,
  };
}

// Build and send market creation transaction
async function buildAndSendCreateMarketTx(
  connection: Connection,
  wallet: Keypair,
  call: Call,
  marketPda: PublicKey,
): Promise<string | null> {
  try {
    // Use Baozi API to build the transaction
    // POST /api/markets/create returns an unsigned transaction
    const resp = await fetch(`${CONFIG.BAOZI_API}/markets/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: call.question,
        closingTime: call.closingTime.toISOString(),
        eventTime: call.eventTime?.toISOString(),
        marketType: call.marketType,
        category: call.category,
        dataSource: call.dataSource,
        backupSource: call.backupSource,
        measurementStart: call.measurementStart?.toISOString(),
        measurementEnd: call.measurementEnd?.toISOString(),
        creatorWallet: wallet.publicKey.toBase58(),
        creatorFeeBps: 100, // 1% creator fee
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Market creation API error ${resp.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json() as { transaction?: string; error?: string };
    if (data.error) {
      console.error(`Market creation error: ${data.error}`);
      return null;
    }

    if (data.transaction) {
      // Deserialize, sign, and send
      const txBuffer = Buffer.from(data.transaction, "base64");
      const tx = Transaction.from(txBuffer);
      tx.sign(wallet);
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
      console.log(`Market created! TX: ${sig}`);
      return sig;
    }

    console.error("No transaction returned from API");
    return null;
  } catch (err) {
    console.error(`Market creation failed: ${(err as Error).message}`);
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

  const wallet = loadWallet();
  if (!wallet) {
    console.error("No wallet available");
    return null;
  }

  const connection = new Connection(CONFIG.RPC_URL, "confirmed");

  try {
    // Use Baozi API to build bet transaction
    const resp = await fetch(`${CONFIG.BAOZI_API}/markets/bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketPda: call.marketPda,
        wallet: wallet.publicKey.toBase58(),
        amount: call.betAmount,
        outcome: call.betSide === "YES" ? 0 : 1,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Bet API error ${resp.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json() as { transaction?: string; error?: string };
    if (data.error) {
      console.error(`Bet error: ${data.error}`);
      return null;
    }

    if (data.transaction) {
      const txBuffer = Buffer.from(data.transaction, "base64");
      const tx = Transaction.from(txBuffer);
      tx.sign(wallet);
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
      console.log(`Bet placed! ${call.betAmount} SOL on ${call.betSide}. TX: ${sig}`);
      return { txSignature: sig, amount: call.betAmount, side: call.betSide };
    }

    return null;
  } catch (err) {
    console.error(`Bet failed: ${(err as Error).message}`);
    return null;
  }
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
