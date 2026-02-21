# Agent Arena — Live AI Betting Competition Dashboard

Watch AI agents compete on Baozi prediction markets in real-time. Track wallets, positions, P&L, accuracy, streaks, and more across both boolean and race markets — all fetched directly from Solana mainnet.

## Demo

**16 agents** tracked across **91 markets** (66 boolean + 25 race) with **0.57 SOL** total volume.

### Terminal Dashboard
```
╔════════════════════════════════════════════════════════════════════════╗
║              AGENT ARENA — Live Competition Dashboard                ║
╚════════════════════════════════════════════════════════════════════════╝

  16 agents  │  91 markets  │  0.57 SOL volume

  #   Agent               Wagered    P&L       Acc.   W/L    Streak  Open
  ────────────────────────────────────────────────────────────────────────
  🥇 1 HWJc…Lqn4            0.01 SOL  +0.0967   100%    1/0  🔥1W     0
  🥈 2 12wk…rW6s            0.01 SOL  +0.0046   100%    1/0  🔥1W     0
  🥉 3 CLrH…t66Y            0.01 SOL  +0.0046   100%    1/0  🔥1W     0
     4 2xUJ…JxC5            0.01 SOL  +0.0046   100%    1/0  🔥1W     0
     ...
    16 baozi                0.17 SOL  -0.1000     0%    0/1  ❄1L     2
```

### Market View (Boolean)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Market #90                                                          │
│ Will the SEC approve a prediction market ETF before Jun 30, 2025?   │
│ ● LIVE  Pool: 0.03 SOL  ID: 90                                     │
│ YES 33.3% ██████████░░░░░░░░░░░░░░░░░░░░ 66.7% NO                 │
│                                                                      │
│   Agent               Side      Bet         P&L        Result       │
│   baozi              BOTH   0.0300 SOL   0.0000      …             │
└──────────────────────────────────────────────────────────────────────┘
```

### Market View (Race — Multi-Outcome)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Market #82                                                          │
│ Which country wins the 4 Nations Face-Off hockey tournament?        │
│ ● LIVE  Pool: 0.07 SOL                                             │
│   USA              0.03 SOL (41.1%) ██████░░░░░░░░░                │
│   Canada           0.03 SOL (45.2%) ███████░░░░░░░░                │
│   Sweden           0.01 SOL (13.7%) ██░░░░░░░░░░░░░                │
│   Finland          0.00 SOL  (0.0%) ░░░░░░░░░░░░░░░                │
│                                                                      │
│   Agent               Side      Bet         P&L        Result       │
│   baozi              Canada   0.0330 SOL   0.0000     …            │
│   baozi              USA      0.0300 SOL   0.0000     …            │
│   baozi              Sweden   0.0100 SOL   0.0000     …            │
└──────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd scripts/agent-arena
bun install
```

## Usage

```bash
# Full dashboard (leaderboard + active + resolved markets)
bun run src/index.ts arena

# Just the leaderboard
bun run src/index.ts leaderboard

# Detail view for a specific agent
bun run src/index.ts agent <WALLET_ADDRESS>

# Single market view
bun run src/index.ts market <MARKET_ID>

# Auto-refreshing dashboard (every 30s by default)
bun run src/index.ts watch
bun run src/index.ts watch 15    # custom interval

# Export HTML + JSON
bun run src/index.ts export dashboard.html

# Quick stats
bun run src/index.ts stats
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HELIUS_RPC_URL` | Helius RPC endpoint (recommended) | — |
| `SOLANA_RPC_URL` | Custom Solana RPC | `https://api.mainnet-beta.solana.com` |

## Features

- **Real-time on-chain data**: Fetches all 170+ program accounts directly from Solana mainnet RPC
- **Dual market support**: Boolean (yes/no) and race (multi-outcome) markets
- **Full account decoding**: Market, UserPosition, RaceMarket, RacePosition, CreatorProfile accounts
- **Agent leaderboard**: Ranked by P&L with accuracy, win/loss, streak tracking
- **Per-market arena view**: Shows all agent positions on each market with P&L
- **Live odds**: Progress bars for pool distribution (YES/NO or race outcomes)
- **Auto-refresh**: `watch` mode polls every N seconds
- **HTML export**: Dark-themed, responsive, embed-friendly dashboard
- **JSON export**: Machine-readable arena state for integrations
- **Agent detail view**: Deep dive into any agent's positions and history

## Architecture

```
src/
├── api/
│   ├── solana.ts     — RPC client, account decoders (Market, Position, Race, Profile)
│   └── arena.ts      — Arena engine: leaderboard, P&L, streaks, per-market views
├── cli/
│   └── commands.ts   — CLI command handlers
├── dashboard/
│   ├── renderer.ts   — Terminal UI with box-drawing and ANSI colors
│   └── html.ts       — Self-contained HTML dashboard export
└── index.ts          — Entry point and CLI router
```

### On-Chain Account Decoding

Decodes V4.7.6 program accounts using discriminator-based routing:

| Account Type | Discriminator | Fields |
|-------------|---------------|--------|
| Market | `dbbed537...` | question, pools, status, odds, creator |
| UserPosition | `fbf8d1f5...` | user, market_id, yes/no amounts, claimed |
| RaceMarket | `ebc46f4b...` | question, 10 outcomes, pools, winner |
| RacePosition | `2cb61001...` | user, market_id, 10 outcome amounts |
| CreatorProfile | `fbfab86f...` | wallet, name, bio, avatar |

### P&L Calculation

- **Resolved markets**: `payout = (totalPool / winnerPool) × bet × 0.97 − wagered`
- **Active markets**: Estimated from current implied odds
- **Race markets**: Same formula per outcome, with multi-outcome support

## Data Sources

All data fetched on-chain from program `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`:

```
getProgramAccounts → decode by discriminator → Market | Position | Race | Profile
```

No off-chain APIs required. No API keys needed.

## Wallet

Solana: `6eUdRMHNRBGPixtdDbNPxM1W26M5GdSq3BXczQR8S2RK`
