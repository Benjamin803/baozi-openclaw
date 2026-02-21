# Calls Tracker — Influencer Prediction Reputation System

Turn tweets into trackable prediction markets. Every call builds or destroys reputation. No hiding from bad takes.

## How It Works

```
Influencer tweets: "BTC will hit $110k by March 1"
  → Parser: "Will Bitcoin (BTC) exceed $110,000 by March 1, 2026?"
  → Validation: Baozi pari-mutuel rules (Type A: close 24h before event)
  → Market: Created on-chain via Baozi Lab
  → Bet: Caller puts skin in the game (0.1 SOL default)
  → Share card: Generated for social proof
  → Resolution: Market resolves, reputation updated
```

## Quick Start

```bash
cd scripts/calls-tracker
bun install

# Run demo with 8 example calls
bun run demo

# Make a real call (dry run)
DRY_RUN=true bun run call -- -c "CryptoKing" -p "BTC will hit $110k by March 1"

# Make a live call (needs SOLANA_PRIVATE_KEY)
bun run call -- -c "CryptoKing" -p "BTC will hit $110k by March 1" --bet 0.5

# View leaderboard
bun run dashboard

# View caller profile
bun run dashboard -- --caller CryptoKing

# Resolve a call
bun run resolve -- --id abc123 --outcome WIN
```

## Features

### Natural Language Prediction Parser
Parses predictions into structured market questions:

| Input | Output |
|-------|--------|
| "BTC will hit $110k by March 15" | Will Bitcoin (BTC) exceed $110,000 by March 15, 2026? |
| "ETH will exceed $4000 by end of Q1" | Will Ethereum (ETH) exceed $4,000 by March 31, 2026? |
| "NVDA will drop below $700 by April" | Will NVIDIA (NVDA) fall below $700.00 by April 30, 2026? |
| "Lakers will beat Celtics in Game 7" | Will the Lakers beat the Celtics by [date]? |
| "Interest rates will be cut this quarter" | Will interest rates be cut by March 31, 2026? |

Supports: 25+ crypto tickers, 7 stock tickers, sports teams (NBA, NFL), date formats (by March 1, end of Q1, next week, in 7 days, this month, before April).

### Baozi Market Integration
- Validates all markets against Baozi pari-mutuel timing rules (v6.3)
- Type A (event-based): `close_time <= event_time - 24h`
- Type B (measurement): `close_time < measurement_start`
- Uses `POST /api/markets/validate` for pre-flight checks
- Creates Lab markets via `build_create_lab_market_transaction` MCP tool
- Generates share cards via `GET /api/share/card?market=PDA&wallet=WALLET`

### Reputation Scoring
Bayesian confidence-weighted scoring system:

- **Raw hit rate**: wins / total calls
- **Bayesian score**: pulls toward 50% with few observations — prevents inflated scores from small samples
- **Streak bonus**: consecutive wins/losses amplify score (max +/-10%)
- **Volume bonus**: more calls = slight reliability bonus (max +5%)
- **Profit factor**: P&L ratio adjusts score (max +/-10%)

**Tiers:**

| Score | Tier | Badge |
|-------|------|-------|
| 80+ | Oracle | *** |
| 70-79 | Prophet | ** |
| 60-69 | Analyst | * |
| 50-59 | Speculator | ~ |
| 40-49 | Gambler | . |
| <40 | Rekt | x |

Minimum 3 calls required for ranking.

### Time-Weighted Accuracy
Recent calls weighted higher than older ones using exponential decay (factor: 0.95). This captures improving or declining prediction ability.

### SQLite Database
All calls and reputation data stored locally in `calls-tracker.db`. Portable, no external dependencies.

Tables: `callers` (reputation), `calls` (prediction history).

## CLI Commands

| Command | Description |
|---------|-------------|
| `bun run call` | Make a new prediction call |
| `bun run dashboard` | View leaderboard or caller profile |
| `bun run resolve` | Check/resolve market outcomes |
| `bun run track` | Register or view callers |
| `bun run demo` | Run demo with example calls |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SOLANA_PRIVATE_KEY` | JSON array of wallet secret key bytes |
| `SOLANA_RPC_URL` | Custom RPC endpoint (default: mainnet-beta) |
| `DRY_RUN` | Set to "true" to skip on-chain operations |
| `DB_PATH` | Custom database path (default: ./calls-tracker.db) |

## Demo Output

```
=== CALLS TRACKER LEADERBOARD ===

#    Caller               Score    Tier         Calls   Hit%     P&L        Streak
─────────────────────────────────────────────────────────────────────────────────────
1    MacroTrader          71       Prophet      3       66.7     +1.2       W2
2    CryptoKing           68       Analyst      3       66.7     +1.4       L1

--- Individual Profiles ---

[**] MacroTrader — Prophet (71/100)
   Calls: 3 | Hit Rate: 66.7%
   Streak: W2 (Best: W2, Worst: L1)
   Wagered: 1.80 SOL | P&L: +1.20 SOL

[*] CryptoKing — Analyst (68/100)
   Calls: 3 | Hit Rate: 66.7%
   Streak: L1 (Best: W2, Worst: L1)
   Wagered: 1.00 SOL | P&L: +1.40 SOL
```

## Architecture

```
src/
  config.ts              — Configuration, types, interfaces
  index.ts               — Main entry point, CLI dispatcher
  parser/
    prediction.ts        — NLP prediction parser (regex-based, no LLM dependency)
  market/
    validator.ts         — Local + remote (Baozi API) validation pipeline
    creator.ts           — On-chain market creation + betting
  tracker/
    db.ts                — SQLite database (callers, calls, resolution)
    reputation.ts        — Bayesian reputation engine + leaderboard
  cli/
    call.ts              — Make new predictions
    dashboard.ts         — View reputation data
    resolve.ts           — Resolve market outcomes
    track.ts             — Manage callers
    demo.ts              — Demo with example calls
```

## Dependencies

- `@solana/web3.js` — Solana blockchain interaction
- `@coral-xyz/anchor` — Anchor framework (for PDA derivation)
- `bun:sqlite` — Built-in SQLite (no external DB needed)
- Baozi MCP server: `npx @baozi.bet/mcp-server` (69 tools)

## On-Chain Verification

All data is verifiable on-chain:
- Market PDAs derived from question hash + creator wallet
- Bet transactions recorded on Solana
- Positions queryable via `get_positions` MCP tool
- Resolution via Grandma Mei oracle system

Program: `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`
