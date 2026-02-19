import { Monitor } from '../src/monitor';
import { BaoziClient } from '../src/baozi';
import { Notifier } from '../src/notifier';
import { StateManager } from '../src/state';
import { McpClient } from '../src/mcp';

jest.mock('../src/baozi');
jest.mock('../src/notifier');
jest.mock('../src/state');
jest.mock('../src/mcp');

describe('Monitor', () => {
  let monitor: Monitor;
  let mockClient: jest.Mocked<BaoziClient>;
  let mockNotifier: jest.Mocked<Notifier>;
  let mockState: jest.Mocked<StateManager>;
  let mockMcp: jest.Mocked<McpClient>;

  beforeEach(() => {
    mockClient = new BaoziClient() as jest.Mocked<BaoziClient>;
    mockNotifier = new Notifier('url') as jest.Mocked<Notifier>;
    mockState = new StateManager() as jest.Mocked<StateManager>;
    mockMcp = new McpClient() as jest.Mocked<McpClient>;

    monitor = new Monitor(mockClient, mockNotifier, mockState, mockMcp);
  });

  it('should detect claimable positions and call MCP', async () => {
    // Setup mocks
    mockClient.getClaimable.mockResolvedValue({
      wallet: 'wallet1',
      totalClaimableSol: 10,
      claimablePositions: [{
        positionPda: 'pos1',
        marketPda: 'market1',
        marketQuestion: 'Q1',
        side: 'Yes',
        betAmountSol: 5,
        claimType: 'winnings',
        estimatedPayoutSol: 10
      }]
    });

    mockClient.getPositions.mockResolvedValue([]);
    mockState.getLastAlerted.mockReturnValue(0); // Never alerted
    mockMcp.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'base64tx' }]
    });

    // Run poll
    await monitor.poll();

    // Verify MCP call
    expect(mockMcp.callTool).toHaveBeenCalledWith('build_claim_winnings_transaction', {
      positionPda: 'pos1',
      marketPda: 'market1'
    });

    // Verify notification
    expect(mockNotifier.send).toHaveBeenCalled();
    const args = mockNotifier.send.mock.calls[0][0];
    expect(args.message).toContain('10 SOL to claim');
    expect(args.message).toContain('Tx: `base64tx`');
  });

  it('should handle MCP errors gracefully', async () => {
    mockClient.getClaimable.mockResolvedValue({
      wallet: 'wallet1',
      totalClaimableSol: 10,
      claimablePositions: [{
        positionPda: 'pos1',
        marketPda: 'market1',
        marketQuestion: 'Q1',
        side: 'Yes',
        betAmountSol: 5,
        claimType: 'winnings',
        estimatedPayoutSol: 10
      }]
    });

    mockClient.getPositions.mockResolvedValue([]);
    mockState.getLastAlerted.mockReturnValue(0);
    mockMcp.callTool.mockRejectedValue(new Error('MCP Failed'));

    await monitor.poll();

    expect(mockNotifier.send).toHaveBeenCalled();
    const args = mockNotifier.send.mock.calls[0][0];
    expect(args.message).not.toContain('Tx: `base64tx`');
    // It should still alert about winnings
    expect(args.message).toContain('10 SOL to claim');
  });
});
