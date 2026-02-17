import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';
import { PROGRAM_ID, DISCRIMINATORS, RPC_ENDPOINT, lamportsToSol } from './config';
import { Market, RaceMarket, Position } from './types';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
      publicKey: pubkey.toBase58(),
      user: user.toBase58(),
      marketId: marketId.toString(),
      yesAmountSol,
      noAmountSol,
      totalAmountSol: round4(yesAmountSol + noAmountSol),
      side,
      claimed,
    };
  } catch (err) {
    console.error('Error decoding position:', err);
    return null;
  }
}

export class BaoziClient {
  private connection: Connection;
  private apiUrl = 'https://baozi.bet/api/markets';

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
  }

  async getMarkets(status?: string): Promise<(Market | RaceMarket)[]> {
    try {
      const response = await axios.get(this.apiUrl);
      if (!response.data.success) throw new Error('API returned success: false');

      const binaryRaw = response.data.data.binary || [];
      const raceRaw = response.data.data.race || []; 

      const markets: (Market | RaceMarket)[] = [];

      for (const m of binaryRaw) {
        const total = Number(m.totalPoolSol);
        const yesPct = Number(m.yesPercent);
        const noPct = Number(m.noPercent);
        
        markets.push({
          publicKey: m.publicKey,
          marketId: m.marketId,
          question: m.question,
          status: m.status,
          statusCode: 0, // Not available from REST
          winningOutcome: m.outcome,
          yesPoolSol: round4(total * (yesPct / 100)),
          noPoolSol: round4(total * (noPct / 100)),
          totalPoolSol: round4(total),
          yesPercent: round2(yesPct),
          noPercent: round2(noPct),
          platformFeeBps: m.platformFeeBps,
          layer: m.layer,
          closingTime: new Date(typeof m.closingTime === 'number' ? m.closingTime * 1000 : m.closingTime),
        });
      }

      for (const m of raceRaw) {
        const total = Number(m.totalPoolSol);
        markets.push({
            publicKey: m.publicKey,
            marketId: m.marketId,
            question: m.question,
            outcomes: m.outcomes, // Assume outcomes are provided in race objects
            closingTime: new Date(typeof m.closingTime === 'number' ? m.closingTime * 1000 : m.closingTime),
            status: m.status,
            statusCode: 0,
            winningOutcomeIndex: m.winningOutcomeIndex,
            totalPoolSol: round4(total),
            layer: m.layer
        } as RaceMarket);
      }

      const filtered = status 
        ? markets.filter(m => m.status.toLowerCase() === status.toLowerCase())
        : markets;

      return filtered.sort((a, b) => {
          if (a.status === 'Active' && b.status !== 'Active') return -1;
          if (a.status !== 'Active' && b.status === 'Active') return 1;
          return a.closingTime.getTime() - b.closingTime.getTime();
      });

    } catch (err) {
      console.error('Error fetching markets from REST API:', err);
      return [];
    }
  }

  async getMarket(publicKey: string): Promise<Market | RaceMarket | null> {
    const markets = await this.getMarkets();
    return markets.find(m => m.publicKey === publicKey) || null;
  }

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
      return positions.sort((a, b) => Number(BigInt(b.marketId) - BigInt(a.marketId)));
    } catch (err) {
      console.error(`Error fetching positions for ${walletAddress}:`, err);
      return [];
    }
  }

  async getHotMarkets(limit = 5): Promise<(Market | RaceMarket)[]> {
    const markets = await this.getMarkets('Active');
    return markets
      .sort((a, b) => b.totalPoolSol - a.totalPoolSol)
      .slice(0, limit);
  }

  async getClosingMarkets(limit = 5): Promise<(Market | RaceMarket)[]> {
    const markets = await this.getMarkets('Active');
    return markets
      .sort((a, b) => a.closingTime.getTime() - b.closingTime.getTime())
      .slice(0, limit);
  }
}
