# Market Factory — Autonomous Market Creation (Bounty #3)

Auto-creates prediction markets on Baozi from trending news, crypto price milestones, and curated event calendars.

## Architecture

```
RSS Feeds / CoinGecko / Curated Events
        │
        ▼
  News Detector (pattern matching + AI)
        │
        ▼
  Duplicate Checker (vs live Baozi markets)
        │
        ▼
  Pari-Mutuel v6.3 Timing Validator   ← rejects non-compliant markets
        │
        ▼
  MCP Client (npx @baozi.bet/mcp-server)
    ├── validate_market_question
    └── build_create_lab_market_transaction
        │
        ▼
  Local signing → Solana submit (with exponential-backoff retry)
        │
        ▼
  SQLite Tracker (markets.db)
```

## Pari-Mutuel v6.3 Timing Rules

All markets are validated **before** hitting the chain. Markets that violate timing rules are either auto-adjusted or rejected.

### Type A — Event-based markets
> "Will X happen by Y?"

- Rule: `close_time <= event_time - 24h`
- Example: "Will a BTC ETF be approved by end of Q1 2026?" → betting closes 24h before deadline
- Rationale: prevents insider-information advantage as event approaches

### Type B — Measurement-period markets
> "Will X be above/below Y on DATE?"

- Rule: `close_time < measurement_start`
- Example: "Will SOL be above $200 on 2026-03-15?" → betting closes before the measurement date
- Rationale: price must not be observable while betting is open

### Enforcement

Validation is enforced in two places:
1. **`classifyAndValidateTiming()`** — classifies the market type and checks compliance
2. **`enforceTimingRules()`** — attempts to auto-adjust closing time; returns `null` if unfixable

Both functions are in `src/news-detector.ts` with full test coverage in `test/timing.test.ts`.

The **golden rule** is enforced: _"Bettors must NEVER have information advantage while betting is open."_

## MCP Integration

Uses `@baozi.bet/mcp-server` (v4.0.11, 69 tools) via stdio JSON-RPC:

```
npx @baozi.bet/mcp-server
```

Key tools used:
- `validate_market_question` — server-side question validation
- `build_create_lab_market_transaction` — builds unsigned tx for Lab market creation
- `get_parimutuel_rules` — fetches current rule set
- `get_timing_rules` — fetches timing constraints

## Error Handling

### On-chain transaction failures

The `sendWithRetry()` function implements exponential-backoff retry:

| Attempt | Delay | Total elapsed |
|---------|-------|---------------|
| 1       | 0s    | 0s            |
| 2       | 2s    | 2s            |
| 3       | 4s    | 6s            |

**Retried** (transient): RPC timeouts, network errors, rate limits
**NOT retried** (deterministic): `custom program error`, `InstructionError`, `insufficient funds`

### MCP failures

- `build_create_lab_market_transaction` error → market skipped with error logged
- MCP server crash → auto-restart on next cycle (lazy init)
- Question validation failure → market rejected before chain submission

## RPC Configuration

| Provider | URL | Notes |
|----------|-----|-------|
| **Solana public** (default) | `https://api.mainnet-beta.solana.com` | Free, rate-limited (100 req/10s) |
| **Helius** (recommended) | `https://mainnet.helius-rpc.com/?api-key=KEY` | Free tier: 100k credits/day |
| **QuickNode** | Custom URL | Free tier available |

Set via `SOLANA_RPC_URL` in `.env`. Public RPC works for low-volume operation (5 markets/day max), but a dedicated RPC is recommended for production.

**Tested with:** Solana public RPC (`api.mainnet-beta.solana.com`) — sufficient for the conservative 5 markets/day limit with 5s delay between creations.

## Running

```bash
cd skills/market-factory
cp .env.example .env   # fill in PRIVATE_KEY and OPENAI_API_KEY
npm install
npm run build
npm start
```

### SystemD service (for autonomous operation)

```ini
[Unit]
Description=Baozi Market Factory
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/skills/market-factory
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=30
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Environment Variables

```env
BAOZI_API_URL=https://baozi.bet/api          # Baozi REST API
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # Solana RPC (or Helius/QuickNode)
WALLET_ADDRESS=FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz
PRIVATE_KEY=                                  # Base58-encoded Solana private key
OPENAI_API_KEY=                               # For AI-powered market generation
DB_PATH=./data/markets.db                     # SQLite tracker
```

## Schedule

| Interval | Task |
|----------|------|
| 30 min   | Scan RSS feeds + crypto prices for new proposals |
| 1 hour   | Check existing markets for resolution |
| 6 hours  | Generate curated markets + print summary |
| 24 hours | Reset daily counter + full summary |

## Program

- **Baozi Program:** `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`
- **MCP Server:** `npx @baozi.bet/mcp-server` (v4.0.11)
- **Market Layer:** Lab (permissionless creation, no whitelist required)
