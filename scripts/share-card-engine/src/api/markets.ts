// Baozi market data fetcher — reads on-chain state for event detection
// Reuses V4.7.6 account decoding patterns

import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ");
const RPC_ENDPOINT =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const DISC = {
  MARKET: Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]),
  RACE_MARKET: Buffer.from([235, 196, 111, 75, 230, 113, 118, 238]),
  USER_POSITION: Buffer.from([251, 248, 209, 245, 83, 234, 17, 27]),
};

const STATUS: Record<number, string> = {
  0: "Active", 1: "Closed", 2: "Resolved", 3: "Voided", 4: "Disputed",
};
const LAYER: Record<number, string> = { 0: "Official", 1: "Lab", 2: "Private" };

function sol(lamports: bigint): number {
  return Math.round((Number(lamports) / 1e9) * 10000) / 10000;
}

export interface MarketSnapshot {
  pda: string;
  marketId: string;
  question: string;
  closingTime: Date;
  status: string;
  statusCode: number;
  yesPoolSol: number;
  noPoolSol: number;
  totalPoolSol: number;
  yesPercent: number;
  noPercent: number;
  winningOutcome: string | null;
  layer: string;
  creator: string;
  hasBets: boolean;
  type: "boolean";
}

export interface RaceSnapshot {
  pda: string;
  marketId: string;
  question: string;
  closingTime: Date;
  status: string;
  statusCode: number;
  outcomes: { label: string; poolSol: number; percent: number }[];
  totalPoolSol: number;
  winnerIndex: number | null;
  layer: string;
  creator: string;
  type: "race";
}

export type AnyMarket = MarketSnapshot | RaceSnapshot;

function decodeBoolean(data: Buffer, pubkey: PublicKey): MarketSnapshot | null {
  try {
    let o = 8;
    const marketId = data.readBigUInt64LE(o); o += 8;
    const qLen = data.readUInt32LE(o); o += 4;
    const question = data.subarray(o, o + qLen).toString("utf8"); o += qLen;
    const closingTime = new Date(Number(data.readBigInt64LE(o)) * 1000); o += 8;
    o += 8; // resolution_time
    o += 8; // auto_stop_buffer
    const yesPool = data.readBigUInt64LE(o); o += 8;
    const noPool = data.readBigUInt64LE(o); o += 8;
    o += 16; // snapshots
    const statusCode = data.readUInt8(o); o += 1;
    const hasWO = data.readUInt8(o); o += 1;
    let winningOutcome: string | null = null;
    if (hasWO === 1) { winningOutcome = data.readUInt8(o) === 1 ? "Yes" : "No"; o += 1; }
    o += 1 + 33; // currency + reserved
    o += 32; // creator_bond + total_claimed + platform_fee + last_bet_time
    o += 1; // bump
    const layerCode = data.readUInt8(o); o += 1;
    o += 2; // resolution_mode + access_gate
    const creator = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    // Skip to hasBets
    const hasOracle = data.readUInt8(o); o += 1;
    if (hasOracle === 1) o += 32;
    o += 160 + 4 + 8; // council + votes + affiliate_fees
    const hasInvite = data.readUInt8(o); o += 1;
    if (hasInvite === 1) o += 32;
    o += 2 + 8; // creator_fee_bps + total_creator_fees
    const hasCProfile = data.readUInt8(o); o += 1;
    if (hasCProfile === 1) o += 32;
    o += 4 + 8; // fee bps + freeze
    const hasBets = data.readUInt8(o) === 1;

    const y = sol(yesPool), n = sol(noPool), t = y + n;
    return {
      pda: pubkey.toBase58(), marketId: marketId.toString(), question,
      closingTime, status: STATUS[statusCode] || "Unknown", statusCode,
      yesPoolSol: y, noPoolSol: n, totalPoolSol: Math.round(t * 10000) / 10000,
      yesPercent: t > 0 ? Math.round((y / t) * 1000) / 10 : 50,
      noPercent: t > 0 ? Math.round((n / t) * 1000) / 10 : 50,
      winningOutcome, layer: LAYER[layerCode] || "Unknown",
      creator: creator.toBase58(), hasBets, type: "boolean",
    };
  } catch { return null; }
}

function decodeRace(data: Buffer, pubkey: PublicKey): RaceSnapshot | null {
  try {
    if (data.length < 500) return null;
    let o = 8;
    const marketId = data.readBigUInt64LE(o); o += 8;
    const qLen = data.readUInt32LE(o); o += 4;
    if (qLen > 500) return null;
    const question = data.subarray(o, o + qLen).toString("utf8"); o += qLen;
    const closingTime = new Date(Number(data.readBigInt64LE(o)) * 1000); o += 8;
    o += 16; // resolution + auto_stop
    const outcomeCount = data.readUInt8(o); o += 1;

    // Labels: [u8; 32] × 10
    const labels: string[] = [];
    for (let i = 0; i < 10; i++) {
      const lb = data.subarray(o, o + 32);
      let end = 32;
      for (let j = 0; j < 32; j++) { if (lb[j] === 0) { end = j; break; } }
      if (i < outcomeCount) labels.push(lb.subarray(0, end).toString("utf8"));
      o += 32;
    }

    // Pools: u64 × 10
    const pools: number[] = [];
    for (let i = 0; i < 10; i++) {
      if (i < outcomeCount) pools.push(sol(data.readBigUInt64LE(o)));
      o += 8;
    }

    const totalPoolSol = sol(data.readBigUInt64LE(o)); o += 8;
    o += 80 + 8; // snapshot pools + total
    const statusCode = data.readUInt8(o); o += 1;
    const hasW = data.readUInt8(o); o += 1;
    let winnerIndex: number | null = null;
    if (hasW === 1) { winnerIndex = data.readUInt8(o); o += 1; }
    o += 1 + 8 + 8 + 8 + 8 + 1; // currency + fees + bump
    const layerCode = data.readUInt8(o); o += 1;
    o += 2;
    const creator = new PublicKey(data.subarray(o, o + 32));

    const outcomes = labels.map((label, i) => ({
      label, poolSol: pools[i],
      percent: totalPoolSol > 0 ? Math.round((pools[i] / totalPoolSol) * 1000) / 10 : 0,
    }));

    return {
      pda: pubkey.toBase58(), marketId: marketId.toString(), question,
      closingTime, status: STATUS[statusCode] || "Unknown", statusCode,
      outcomes, totalPoolSol, winnerIndex,
      layer: LAYER[layerCode] || "Unknown", creator: creator.toBase58(), type: "race",
    };
  } catch { return null; }
}

export interface MarketState {
  booleans: MarketSnapshot[];
  races: RaceSnapshot[];
  fetchedAt: Date;
}

export async function fetchMarkets(): Promise<MarketState> {
  const conn = new Connection(RPC_ENDPOINT, "confirmed");
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, { encoding: "base64" });

  const booleans: MarketSnapshot[] = [];
  const races: RaceSnapshot[] = [];

  for (const { pubkey, account } of accounts) {
    const data = Buffer.from(account.data);
    if (data.length < 8) continue;
    const disc = data.subarray(0, 8);
    if (disc.equals(DISC.MARKET)) { const m = decodeBoolean(data, pubkey); if (m) booleans.push(m); }
    else if (disc.equals(DISC.RACE_MARKET)) { const r = decodeRace(data, pubkey); if (r) races.push(r); }
  }

  return { booleans, races, fetchedAt: new Date() };
}
