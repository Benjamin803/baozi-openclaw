import { BaoziClient } from '../src/baozi';
import { PublicKey } from '@solana/web3.js';
import axios from 'axios';

jest.mock('axios');
jest.mock('@solana/web3.js', () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({
      getProgramAccounts: jest.fn(),
    })),
    PublicKey: jest.fn().mockImplementation((key) => ({
      toBase58: () => key.toString(),
    })),
  };
});

describe('BaoziClient', () => {
  let client: BaoziClient;

  beforeEach(() => {
    client = new BaoziClient();
    jest.clearAllMocks();
  });

  describe('getClaimable', () => {
    it('should calculate winnings correctly for Resolved market', async () => {
      // Mock market cache
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          data: {
            binary: [{
              publicKey: 'market1',
              marketId: '1',
              question: 'Will it rain?',
              closingTime: new Date().toISOString(),
              status: 'Resolved',
              outcome: 'Yes',
              totalPoolSol: 100,
              yesPercent: 50,
              noPercent: 50,
              platformFeeBps: 100, // 1%
            }]
          }
        }
      });

      // Mock positions
      // We need to mock getPositions to return a specific position
      // But getPositions uses Connection.getProgramAccounts which is hard to mock binary data for
      // So we will spy on getPositions
      jest.spyOn(client, 'getPositions').mockResolvedValue([{
        publicKey: 'pos1',
        user: 'user1',
        marketId: '1',
        yesAmountSol: 10,
        noAmountSol: 0,
        totalAmountSol: 10,
        side: 'Yes',
        claimed: false
      }]);

      const result = await client.getClaimable('wallet1');
      
      expect(result.totalClaimableSol).toBeGreaterThan(0);
      expect(result.claimablePositions.length).toBe(1);
      const p = result.claimablePositions[0];
      expect(p.marketQuestion).toBe('Will it rain?');
      expect(p.claimType).toBe('winnings');
      
      // Calculation:
      // Market pool: 100
      // Yes pool (50%): 50
      // User bet: 10 on Yes
      // User share: 10/50 = 0.2
      // Gross payout: 0.2 * 100 = 20
      // Profit: 20 - 10 = 10
      // Fee: 1% of 10 = 0.1
      // Net payout: 20 - 0.1 = 19.9
      expect(p.estimatedPayoutSol).toBeCloseTo(19.9);
    });

    it('should handle refunded markets', async () => {
       (axios.get as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          data: {
            binary: [{
              publicKey: 'market2',
              marketId: '2',
              question: 'Invalid market',
              closingTime: new Date().toISOString(),
              status: 'Resolved', // Resolved but no outcome -> Refund? 
              // Wait, code says: if winningOutcome is null -> refund
              outcome: null,
              totalPoolSol: 100,
              yesPercent: 50,
              noPercent: 50,
              platformFeeBps: 0,
            }]
          }
        }
      });

      jest.spyOn(client, 'getPositions').mockResolvedValue([{
        publicKey: 'pos2',
        user: 'user1',
        marketId: '2',
        yesAmountSol: 10,
        noAmountSol: 0,
        totalAmountSol: 10,
        side: 'Yes',
        claimed: false
      }]);

      const result = await client.getClaimable('wallet1');
      expect(result.claimablePositions[0].claimType).toBe('refund');
      expect(result.claimablePositions[0].estimatedPayoutSol).toBe(10);
    });
  });
});
