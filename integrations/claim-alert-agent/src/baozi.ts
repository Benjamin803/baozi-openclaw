/**
 * Baozi Client — Hybrid REST API + Solana RPC
 * Uses baozi.bet REST API for market data (fast, no rate limits)
 * Uses Solana RPC only for wallet-specific position queries
 */
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { PROGRAM_ID, DISCRIMINATORS, SEEDS } from './baozi-constants';

const BAOZI_API = 'https://baozi.bet/api';

// =============================================================================
// TYPES
// =============================================================================

export interface Position {
  publicKey: string;
  user: string;
  marketId: string;
  yesAmountSol: number;
  noAmountSol: number;
  totalAmountSol: number;
  side: 'Yes' | 'No' | 'Both';
  claimed: boolean;
}

export interface Market {
  publicKey: string;
  marketId: string;
  question: string;
  closingTime: Date;
  status: string;
  statusCode: number;
  winningOutcome: string | null;
  yesPoolSol: number;
  noPoolSol: number;
  totalPoolSol: number;
  yesPercent: number;
  noPercent: number;
  platformFeeBps: number;
}

export interface ClaimablePosition {
  positionPda: string;
  marketPda: string;
  marketQuestion: string;
  side: 'Yes' | 'No';
  betAmountSol: number;
  claimType: 'winnings' | 'refund' | 'cancelled';
  estimatedPayoutSol: number;
}

export interface ClaimSummary {
  wallet: string;
  totalClaimableSol: number;
  claimablePositions: ClaimablePosition[];
}

// =============================================================================
// HELPERS
// =============================================================================

function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / 1_000_000_000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function deriveMarketPda(marketId: string): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketId));
  const [pda] = PublicKey.findProgramAddressSync([SEEDS.MARKET, buf], PROGRAM_ID);
  return pda;
}

// =============================================================================
// POSITION DECODER (RPC only)
// =============================================================================

function decodePosition(data: Buffer, pubkey: PublicKey): Position | null {
  try {
    let offset = 8;
    const user = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const marketId = data.readBigUInt64LE(offset); offset += 8;
    const yesAmount = data.readBigUInt64LE(offset); offset += 8;
    const noAmount = data.readBigUInt64LE(offset); offset += 8;
    const claimed = data.readUInt8(offset) === 1;

    const yesAmountSol = round4(lamportsToSol(yesAmount));
    const noAmountSol = round4(lamportsToSol(noAmount));
    let side: 'Yes' | 'No' | 'Both';
    if (yesAmount > 0n && noAmount > 0n) side = 'Both';
    else if (yesAmount > 0n) side = 'Yes';
    else side = 'No';

    return {
      publicKey: pubkey.toBase58(), user: user.toBase58(),
      marketId: marketId.toString(), yesAmountSol, noAmountSol,
      totalAmountSol: round4(yesAmountSol + noAmountSol), side, claimed,
    };
  } catch (err) {
    console.error('Error decoding position:', err);
    return null;
  }
}

// =============================================================================
// CLIENT
// =============================================================================

export class BaoziClient {
  private connection: Connection;
  private marketCache: Map<string, Market> = new Map();
  private lastCacheRefresh: number = 0;
  private readonly CACHE_TTL = 60_000; // 60s cache

  constructor(rpcUrl: string = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Refresh market cache from Baozi REST API (single HTTP call for all markets)
   */
  private async refreshMarketCache(): Promise<void> {
    if (Date.now() - this.lastCacheRefresh < this.CACHE_TTL) return;

    try {
      const resp = await axios.get(`${BAOZI_API}/markets`, { timeout: 15000 });
      if (!resp.data?.success) return;

      const markets = resp.data.data.binary || [];
      this.marketCache.clear();

      for (const m of markets) {
        const statusMap: Record<string, number> = {
          Active: 0, Closed: 1, Resolved: 2, Cancelled: 3,
          Paused: 4, ResolvedPending: 5, Disputed: 6,
        };

        const market: Market = {
          publicKey: m.publicKey,
          marketId: String(m.marketId),
          question: m.question,
          closingTime: new Date(m.closingTime),
          status: m.status,
          statusCode: statusMap[m.status] ?? -1,
          winningOutcome: m.outcome === 'Yes' ? 'Yes' : m.outcome === 'No' ? 'No' : null,
          yesPoolSol: round4(m.totalPoolSol * (m.yesPercent / 100)),
          noPoolSol: round4(m.totalPoolSol * (m.noPercent / 100)),
          totalPoolSol: m.totalPoolSol,
          yesPercent: m.yesPercent,
          noPercent: m.noPercent,
          platformFeeBps: m.platformFeeBps || 0,
        };

        this.marketCache.set(market.marketId, market);
      }

      this.lastCacheRefresh = Date.now();
      console.log(`[BaoziClient] Cached ${this.marketCache.size} markets from REST API`);
    } catch (err: any) {
      console.error('[BaoziClient] REST API error:', err.message);
    }
  }

  /**
   * Get positions for a wallet (RPC — one call per wallet)
   */
  async getPositions(walletAddress: string): Promise<Position[]> {
    try {
      const wallet = new PublicKey(walletAddress);
      const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode(DISCRIMINATORS.USER_POSITION) } },
          { memcmp: { offset: 8, bytes: wallet.toBase58() } },
        ],
      });
      const positions: Position[] = [];
      for (const { account, pubkey } of accounts) {
        const p = decodePosition(account.data as Buffer, pubkey);
        if (p) positions.push(p);
      }
      return positions;
    } catch (err) {
      console.error(`Error fetching positions for ${walletAddress}:`, err);
      return [];
    }
  }

  /**
   * Get market by ID (from cache, zero RPC calls)
   */
  async getMarketById(marketId: string): Promise<Market | null> {
    await this.refreshMarketCache();
    return this.marketCache.get(marketId) || null;
  }

  /**
   * Get market by PDA (from cache, zero RPC calls)
   */
  async getMarket(marketPda: string): Promise<Market | null> {
    await this.refreshMarketCache();
    for (const m of this.marketCache.values()) {
      if (m.publicKey === marketPda) return m;
    }
    return null;
  }

  /**
   * Get claimable positions (1 RPC call + cache lookups)
   */
  async getClaimable(walletAddress: string): Promise<ClaimSummary> {
    await this.refreshMarketCache();
    const positions = await this.getPositions(walletAddress);
    const claimable: ClaimablePosition[] = [];
    let totalClaimable = 0;

    for (const position of positions) {
      if (position.claimed) continue;
      const market = this.marketCache.get(position.marketId);
      if (!market) continue;

      let claimType: 'winnings' | 'refund' | 'cancelled' | null = null;
      let estimatedPayout = 0;
      let winningSide: 'Yes' | 'No' | null = null;

      if (market.status === 'Resolved') {
        if (market.winningOutcome === 'Yes' && position.yesAmountSol > 0) {
          winningSide = 'Yes'; claimType = 'winnings';
          if (market.yesPoolSol > 0) {
            const share = position.yesAmountSol / market.yesPoolSol;
            const gross = share * market.totalPoolSol;
            const profit = gross - position.yesAmountSol;
            estimatedPayout = gross - (profit > 0 ? (profit * market.platformFeeBps) / 10000 : 0);
          }
        } else if (market.winningOutcome === 'No' && position.noAmountSol > 0) {
          winningSide = 'No'; claimType = 'winnings';
          if (market.noPoolSol > 0) {
            const share = position.noAmountSol / market.noPoolSol;
            const gross = share * market.totalPoolSol;
            const profit = gross - position.noAmountSol;
            estimatedPayout = gross - (profit > 0 ? (profit * market.platformFeeBps) / 10000 : 0);
          }
        } else if (market.winningOutcome === null) {
          claimType = 'refund'; estimatedPayout = position.totalAmountSol;
          winningSide = position.yesAmountSol > position.noAmountSol ? 'Yes' : 'No';
        }
      } else if (market.status === 'Cancelled') {
        claimType = 'cancelled'; estimatedPayout = position.totalAmountSol;
        winningSide = position.yesAmountSol > position.noAmountSol ? 'Yes' : 'No';
      }

      if (claimType && winningSide) {
        const payout = round4(estimatedPayout);
        totalClaimable += payout;
        const marketPda = deriveMarketPda(position.marketId);
        claimable.push({
          positionPda: position.publicKey, marketPda: marketPda.toBase58(),
          marketQuestion: market.question, side: winningSide,
          betAmountSol: winningSide === 'Yes' ? position.yesAmountSol : position.noAmountSol,
          claimType, estimatedPayoutSol: payout,
        });
      }
    }
    return { wallet: walletAddress, totalClaimableSol: round4(totalClaimable), claimablePositions: claimable };
  }

  async getResolutionStatus(marketId: string): Promise<{ marketId: string; isResolved: boolean; winningOutcome: string | null; status: string }> {
    const market = await this.getMarketById(marketId);
    if (!market) return { marketId, isResolved: false, winningOutcome: null, status: 'Unknown' };
    return { marketId, isResolved: market.status === 'Resolved', winningOutcome: market.winningOutcome, status: market.status };
  }

  async getMarketOdds(marketId: string): Promise<{ marketId: string; yesPercent: number; noPercent: number } | null> {
    const market = await this.getMarketById(marketId);
    if (!market) return null;
    return { marketId, yesPercent: market.yesPercent, noPercent: market.noPercent };
  }

  async getMarketClosingTime(marketId: string): Promise<Date | null> {
    const market = await this.getMarketById(marketId);
    if (!market) return null;
    return market.closingTime;
  }
}
