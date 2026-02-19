import { describe, it } from 'node:test';
import assert from 'node:assert';
import { marketsCommand } from '../src/commands/markets';
import { SafeEmbedBuilder } from '../src/utils/embed';

// Mock types
type MockInteraction = {
  deferReply: () => Promise<void>;
  options: { getString: (name: string) => string | null };
  editReply: (content: any) => Promise<void>;
  replied: boolean;
  deferred: boolean;
  commandName: string;
};

// Mock Client
const mockClient = {
  getMarkets: async (status?: string) => {
     if (status === 'Closed') return [];
     return [
       {
         publicKey: 'pubkey1',
         marketId: '1',
         question: 'Q1',
         status: 'Active',
         closingTime: new Date(),
         totalPoolSol: 100,
         yesPercent: 50,
         noPercent: 50,
       },
       {
         publicKey: 'pubkey2',
         marketId: '2',
         question: 'Q2',
         status: 'Active',
         closingTime: new Date(),
         totalPoolSol: 200,
         yesPercent: 60,
         noPercent: 40,
       }
     ];
  },
  getMarket: async () => null,
  getPositions: async () => [],
  getHotMarkets: async () => [],
  getClosingMarkets: async () => []
};

describe('marketsCommand', () => {
  it('should return markets embed', async () => {
    let reply: any = null;
    const interaction: MockInteraction = {
      deferReply: async () => {},
      options: { getString: () => 'Active' },
      editReply: async (content) => { reply = content; },
      replied: false,
      deferred: true,
      commandName: 'markets'
    };

    await marketsCommand.execute(interaction as any, mockClient as any);
    
    assert.ok(reply);
    assert.ok(reply.embeds);
    assert.strictEqual(reply.embeds.length, 1);
    const embed = reply.embeds[0];
    assert.strictEqual(embed.data.title, 'Baozi Markets (Active)');
    assert.strictEqual(embed.data.fields.length, 2);
    assert.strictEqual(embed.data.fields[0].name, 'Q1');
  });

  it('should handle empty markets', async () => {
    let reply: any = null;
    const interaction: MockInteraction = {
      deferReply: async () => {},
      options: { getString: () => 'Closed' }, // Mock client returns [] for Closed
      editReply: async (content) => { reply = content; },
      replied: false,
      deferred: true,
      commandName: 'markets'
    };

    await marketsCommand.execute(interaction as any, mockClient as any);
    
    assert.strictEqual(reply, 'No closed markets found.');
  });

  it('should handle many markets (truncation)', async () => {
    // Mock client returning many markets
    const manyMarketsClient = {
      ...mockClient,
      getMarkets: async () => Array(50).fill(0).map((_, i) => ({
         publicKey: `pubkey${i}`,
         marketId: `${i}`,
         question: `Question ${i} `.repeat(5), // Long question
         status: 'Active',
         closingTime: new Date(),
         totalPoolSol: 100,
         yesPercent: 50,
         noPercent: 50,
      }))
    };

    let reply: any = null;
    const interaction: MockInteraction = {
      deferReply: async () => {},
      options: { getString: () => 'Active' },
      editReply: async (content) => { reply = content; },
      replied: false,
      deferred: true,
      commandName: 'markets'
    };

    await marketsCommand.execute(interaction as any, manyMarketsClient as any);
    
    assert.ok(reply.embeds);
    const embed = reply.embeds[0];
    // Check truncation
    assert.ok(embed.data.fields.length <= 25);
    assert.ok(embed.data.footer.text.includes('... and more'));
  });
});
