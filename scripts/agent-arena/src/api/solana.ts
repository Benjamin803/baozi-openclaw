// Solana RPC client for Baozi V4.7.6 on-chain data
// Decodes Market, UserPosition, RaceMarket, RacePosition, and CreatorProfile accounts

import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ");

const RPC_ENDPOINT =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

// Account discriminators (first 8 bytes of sha256 hash)
const DISC = {
  MARKET: Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]),
  USER_POSITION: Buffer.from([251, 248, 209, 245, 83, 234, 17, 27]),
  RACE_MARKET: Buffer.from([235, 196, 111, 75, 230, 113, 118, 238]),
  RACE_POSITION: Buffer.from([44, 182, 16, 1, 230, 14, 174, 46]),
  CREATOR_PROFILE: Buffer.from([251, 250, 184, 111, 214, 178, 32, 221]),
};

const STATUS_NAMES: Record<number, string> = {
  0: "Active",
  1: "Closed",
  2: "Resolved",
  3: "Voided",
  4: "Disputed",
};

const LAYER_NAMES: Record<number, string> = {
  0: "Official",
  1: "Lab",
  2: "Private",
};

function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1e9;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Market decoder (Boolean)
// ─────────────────────────────────────────────────────────────────────────────

export interface Market {
  publicKey: string;
  marketId: string;
  question: string;
  closingTime: string;
  resolutionTime: string;
  status: string;
  statusCode: number;
  winningOutcome: string | null;
  yesPoolSol: number;
  noPoolSol: number;
  totalPoolSol: number;
  yesPercent: number;
  noPercent: number;
  layer: string;
  creator: string;
  hasBets: boolean;
  isBettingOpen: boolean;
}

function decodeMarket(data: Buffer, pubkey: PublicKey): Market | null {
  try {
    let offset = 8; // skip discriminator

    const marketId = data.readBigUInt64LE(offset);
    offset += 8;

    const questionLen = data.readUInt32LE(offset);
    offset += 4;
    const question = data.subarray(offset, offset + questionLen).toString("utf8");
    offset += questionLen;

    const closingTime = data.readBigInt64LE(offset);
    offset += 8;
    const resolutionTime = data.readBigInt64LE(offset);
    offset += 8;

    // auto_stop_buffer
    offset += 8;

    const yesPool = data.readBigUInt64LE(offset);
    offset += 8;
    const noPool = data.readBigUInt64LE(offset);
    offset += 8;

    // snapshot pools
    offset += 16;

    const statusCode = data.readUInt8(offset);
    offset += 1;

    const hasWinningOutcome = data.readUInt8(offset);
    offset += 1;
    let winningOutcome: string | null = null;
    if (hasWinningOutcome === 1) {
      winningOutcome = data.readUInt8(offset) === 1 ? "Yes" : "No";
      offset += 1;
    }

    // currency_type + reserved_usdc_vault
    offset += 1 + 33;

    // creator_bond + total_claimed + platform_fee_collected + last_bet_time
    offset += 8 + 8 + 8 + 8;

    // bump
    offset += 1;

    const layerCode = data.readUInt8(offset);
    offset += 1;

    // resolution_mode + access_gate
    offset += 2;

    const creator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // oracle_host (Option<Pubkey>)
    const hasOracle = data.readUInt8(offset);
    offset += 1;
    if (hasOracle === 1) offset += 32;

    // council (5 * 32)
    offset += 160;

    // council_size/votes/threshold
    offset += 4;

    // total_affiliate_fees
    offset += 8;

    // invite_hash (Option<[u8;32]>)
    const hasInvite = data.readUInt8(offset);
    offset += 1;
    if (hasInvite === 1) offset += 32;

    // creator_fee_bps
    offset += 2;

    // total_creator_fees
    offset += 8;

    // creator_profile (Option<Pubkey>)
    const hasCProfile = data.readUInt8(offset);
    offset += 1;
    if (hasCProfile === 1) offset += 32;

    // platform_fee_bps + affiliate_fee_bps
    offset += 4;

    // betting_freeze_seconds
    const bettingFreezeSeconds = data.readBigInt64LE(offset);
    offset += 8;

    const hasBets = data.readUInt8(offset) === 1;

    const yesPoolSol = lamportsToSol(yesPool);
    const noPoolSol = lamportsToSol(noPool);
    const totalPoolSol = yesPoolSol + noPoolSol;
    const yesPercent = totalPoolSol > 0 ? (yesPoolSol / totalPoolSol) * 100 : 50;
    const noPercent = totalPoolSol > 0 ? (noPoolSol / totalPoolSol) * 100 : 50;

    const now = BigInt(Math.floor(Date.now() / 1000));
    const freezeTime = closingTime - bettingFreezeSeconds;
    const isBettingOpen = statusCode === 0 && now < freezeTime;

    return {
      publicKey: pubkey.toBase58(),
      marketId: marketId.toString(),
      question,
      closingTime: new Date(Number(closingTime) * 1000).toISOString(),
      resolutionTime: new Date(Number(resolutionTime) * 1000).toISOString(),
      status: STATUS_NAMES[statusCode] || "Unknown",
      statusCode,
      winningOutcome,
      yesPoolSol: round4(yesPoolSol),
      noPoolSol: round4(noPoolSol),
      totalPoolSol: round4(totalPoolSol),
      yesPercent: round2(yesPercent),
      noPercent: round2(noPercent),
      layer: LAYER_NAMES[layerCode] || "Unknown",
      creator: creator.toBase58(),
      hasBets,
      isBettingOpen,
    };
  } catch (e) {
    console.error(`decodeMarket failed for ${pubkey.toBase58()}:`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UserPosition decoder
// ─────────────────────────────────────────────────────────────────────────────

export interface UserPosition {
  publicKey: string;
  user: string;
  marketId: string;
  yesAmountSol: number;
  noAmountSol: number;
  totalAmountSol: number;
  side: "Yes" | "No" | "Both";
  claimed: boolean;
  referredBy: string | null;
}

function decodePosition(data: Buffer, pubkey: PublicKey): UserPosition | null {
  try {
    let offset = 8;

    const user = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const marketId = data.readBigUInt64LE(offset);
    offset += 8;

    const yesAmount = data.readBigUInt64LE(offset);
    offset += 8;
    const noAmount = data.readBigUInt64LE(offset);
    offset += 8;

    const claimed = data.readUInt8(offset) === 1;
    offset += 1;

    // bump
    offset += 1;

    // referred_by (Option<Pubkey>)
    const hasRef = data.readUInt8(offset);
    offset += 1;
    let referredBy: string | null = null;
    if (hasRef === 1) {
      referredBy = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    }

    const yesAmountSol = round4(lamportsToSol(yesAmount));
    const noAmountSol = round4(lamportsToSol(noAmount));
    const totalAmountSol = round4(yesAmountSol + noAmountSol);

    let side: "Yes" | "No" | "Both";
    if (yesAmount > 0n && noAmount > 0n) side = "Both";
    else if (yesAmount > 0n) side = "Yes";
    else side = "No";

    return {
      publicKey: pubkey.toBase58(),
      user: user.toBase58(),
      marketId: marketId.toString(),
      yesAmountSol,
      noAmountSol,
      totalAmountSol,
      side,
      claimed,
      referredBy,
    };
  } catch (e) {
    console.error(`decodePosition failed for ${pubkey.toBase58()}:`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RaceMarket decoder
// ─────────────────────────────────────────────────────────────────────────────

export interface RaceOutcome {
  label: string;
  pool: number;
  percent: number;
}

export interface RaceMarket {
  publicKey: string;
  marketId: string;
  question: string;
  closingTime: string;
  status: string;
  statusCode: number;
  outcomes: RaceOutcome[];
  totalPoolSol: number;
  winnerIndex: number | null;
  layer: string;
  creator: string;
}

function decodeRaceMarket(data: Buffer, pubkey: PublicKey): RaceMarket | null {
  try {
    if (data.length < 500) return null; // Race markets are large accounts

    let offset = 8;

    const marketId = data.readBigUInt64LE(offset);
    offset += 8;

    const questionLen = data.readUInt32LE(offset);
    offset += 4;
    if (questionLen > 500 || questionLen + offset > data.length) return null;
    const question = data.subarray(offset, offset + questionLen).toString("utf8");
    offset += questionLen;

    const closingTime = data.readBigInt64LE(offset);
    offset += 8;

    // resolution_time + auto_stop_buffer
    offset += 16;

    // outcome_count (u8)
    const outcomeCount = data.readUInt8(offset);
    offset += 1;

    // outcome_labels: [[u8; 32]; 10] = 320 bytes FIXED (null-terminated strings)
    const outcomeLabels: string[] = [];
    for (let i = 0; i < 10; i++) {
      const labelBytes = data.subarray(offset, offset + 32);
      let labelEnd = 32;
      for (let j = 0; j < 32; j++) {
        if (labelBytes[j] === 0) { labelEnd = j; break; }
      }
      if (i < outcomeCount) {
        outcomeLabels.push(labelBytes.subarray(0, labelEnd).toString("utf8"));
      }
      offset += 32;
    }

    // outcome_pools: [u64; 10] = 80 bytes FIXED
    const outcomePools: bigint[] = [];
    for (let i = 0; i < 10; i++) {
      const pool = data.readBigUInt64LE(offset);
      if (i < outcomeCount) outcomePools.push(pool);
      offset += 8;
    }

    // total_pool (u64)
    const totalPoolLamports = data.readBigUInt64LE(offset);
    offset += 8;

    // snapshot_pools [u64; 10] + snapshot_total (u64)
    offset += 80 + 8;

    // status (enum, 1)
    const statusCode = data.readUInt8(offset);
    offset += 1;

    // winning_outcome (Option<u8>)
    const hasWinner = data.readUInt8(offset);
    offset += 1;
    let winnerIndex: number | null = null;
    if (hasWinner === 1) {
      winnerIndex = data.readUInt8(offset);
      offset += 1;
    }

    // currency_type (1)
    offset += 1;

    // platform_fee_collected + creator_fee_collected + total_claimed + last_bet_time
    offset += 8 + 8 + 8 + 8;

    // bump (1)
    offset += 1;

    const layerCode = data.readUInt8(offset);
    offset += 1;

    // resolution_mode + access_gate
    offset += 2;

    const creator = new PublicKey(data.subarray(offset, offset + 32));

    // Build outcomes with pools and percentages
    const totalPoolSol = round4(lamportsToSol(totalPoolLamports));
    const outcomes: RaceOutcome[] = [];
    for (let i = 0; i < outcomeCount; i++) {
      const poolSol = round4(lamportsToSol(outcomePools[i]));
      const percent = totalPoolSol > 0
        ? round2((poolSol / totalPoolSol) * 100)
        : round2(100 / outcomeCount);
      outcomes.push({ label: outcomeLabels[i], pool: poolSol, percent });
    }

    return {
      publicKey: pubkey.toBase58(),
      marketId: marketId.toString(),
      question,
      closingTime: new Date(Number(closingTime) * 1000).toISOString(),
      status: STATUS_NAMES[statusCode] || "Unknown",
      statusCode,
      outcomes,
      totalPoolSol,
      winnerIndex,
      layer: LAYER_NAMES[layerCode] || "Unknown",
      creator: creator.toBase58(),
    };
  } catch (e) {
    console.error(`decodeRaceMarket failed for ${pubkey.toBase58()}:`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RacePosition decoder
// ─────────────────────────────────────────────────────────────────────────────

export interface RacePosition {
  publicKey: string;
  user: string;
  marketId: string;
  bets: { outcomeIndex: number; amountSol: number }[];
  totalAmountSol: number;
  claimed: boolean;
}

function decodeRacePosition(data: Buffer, pubkey: PublicKey): RacePosition | null {
  try {
    let offset = 8;

    const user = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const marketId = data.readBigUInt64LE(offset);
    offset += 8;

    // amounts: [u64; 10] = 80 bytes FIXED (bet amount per outcome index)
    const bets: { outcomeIndex: number; amountSol: number }[] = [];
    let total = 0;

    for (let i = 0; i < 10; i++) {
      const amount = data.readBigUInt64LE(offset);
      offset += 8;
      if (amount > 0n) {
        const amountSol = round4(lamportsToSol(amount));
        total += amountSol;
        bets.push({ outcomeIndex: i, amountSol });
      }
    }

    // claimed (bool, 1)
    const claimed = data.readUInt8(offset) === 1;

    return {
      publicKey: pubkey.toBase58(),
      user: user.toBase58(),
      marketId: marketId.toString(),
      bets,
      totalAmountSol: round4(total),
      claimed,
    };
  } catch (e) {
    console.error(`decodeRacePosition failed for ${pubkey.toBase58()}:`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CreatorProfile decoder
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatorProfile {
  publicKey: string;
  wallet: string;
  name: string;
  marketsCreated: number;
}

function decodeCreatorProfile(data: Buffer, pubkey: PublicKey): CreatorProfile | null {
  try {
    let offset = 8;

    const wallet = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    // bio (String)
    const bioLen = data.readUInt32LE(offset);
    offset += 4 + bioLen;

    // avatar (String)
    const avatarLen = data.readUInt32LE(offset);
    offset += 4 + avatarLen;

    // markets_created (u32)
    const marketsCreated = data.readUInt32LE(offset);

    return {
      publicKey: pubkey.toBase58(),
      wallet: wallet.toBase58(),
      name,
      marketsCreated,
    };
  } catch (e) {
    console.error(`decodeCreatorProfile failed for ${pubkey.toBase58()}:`, e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch all data from chain
// ─────────────────────────────────────────────────────────────────────────────

export interface ArenaData {
  markets: Market[];
  positions: UserPosition[];
  raceMarkets: RaceMarket[];
  racePositions: RacePosition[];
  profiles: Map<string, CreatorProfile>;
  fetchedAt: string;
}

export async function fetchAllArenaData(): Promise<ArenaData> {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  // Fetch all program accounts in one call
  const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    encoding: "base64",
  });

  const markets: Market[] = [];
  const positions: UserPosition[] = [];
  const raceMarkets: RaceMarket[] = [];
  const racePositions: RacePosition[] = [];
  const profiles = new Map<string, CreatorProfile>();

  for (const { pubkey, account } of allAccounts) {
    const data = Buffer.from(account.data);
    if (data.length < 8) continue;

    const disc = data.subarray(0, 8);

    if (disc.equals(DISC.MARKET)) {
      const m = decodeMarket(data, pubkey);
      if (m) markets.push(m);
    } else if (disc.equals(DISC.USER_POSITION)) {
      const p = decodePosition(data, pubkey);
      if (p) positions.push(p);
    } else if (disc.equals(DISC.RACE_MARKET)) {
      const r = decodeRaceMarket(data, pubkey);
      if (r) raceMarkets.push(r);
    } else if (disc.equals(DISC.RACE_POSITION)) {
      const rp = decodeRacePosition(data, pubkey);
      if (rp) racePositions.push(rp);
    } else if (disc.equals(DISC.CREATOR_PROFILE)) {
      const cp = decodeCreatorProfile(data, pubkey);
      if (cp) profiles.set(cp.wallet, cp);
    }
  }

  return {
    markets,
    positions,
    raceMarkets,
    racePositions,
    profiles,
    fetchedAt: new Date().toISOString(),
  };
}

// Helper: get agent display name
export function agentName(wallet: string, profiles: Map<string, CreatorProfile>): string {
  const p = profiles.get(wallet);
  return p ? p.name : `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}
