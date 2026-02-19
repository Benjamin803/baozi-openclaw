# Share Card Viral Engine — Every Bet Becomes a Billboard

Monitors Baozi prediction markets for notable activity and auto-generates share cards with captions, affiliate links, and engagement tracking. Turns every market event into distributable content.

## Demo

Scanning 91 mainnet markets detected **12 notable events** including resolved markets, closing-soon deadlines, new markets, and race leader updates:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[just_resolved] Priority 5/5
✅ Resolved: "will it snow in vilnius?" → No

水落石出 — when the water recedes the stones appear

📊 will it snow in vilnius in 5th of feb at 1:30 am?
🏆 Winner: No
💰 Pool: 0.11 SOL
📈 Final odds: YES 90.9% / NO 9.1%

Card: https://baozi.bet/api/share/card?market=7pYbqwrj...
Link: https://baozi.bet/market/7pYbqwrj...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[closing_soon] Priority 4/5
⏰ Race closing in 17h: "Which country will win Men's Hockey gold?"

机不可失 — opportunity knocks but once

🏁 Which country will win Men's Hockey gold at 2026 Olympics?
🥇 Leading: USA (100%)  │  💰 Pool: 0.01 SOL  │  ⏰ 17h remaining
```

## Installation

```bash
cd scripts/share-card-engine
bun install
```

## Usage

```bash
# Preview all detected events (no-op, just displays)
bun run src/index.ts demo

# Continuous monitoring (default: 60s interval)
bun run src/index.ts monitor
bun run src/index.ts monitor 30   # every 30 seconds

# One-shot scan + distribute
bun run src/index.ts scan console
bun run src/index.ts scan file    # saves markdown per event

# Generate share card for a specific market
bun run src/index.ts generate <MARKET_PDA> [output.png]

# View engagement metrics
bun run src/index.ts metrics
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AFFILIATE_CODE` | Your Baozi affiliate/referral code (1% lifetime commission) |
| `WALLET` | Your wallet address (shown on share cards) |
| `HELIUS_RPC_URL` | Helius RPC for higher rate limits |
| `SOLANA_RPC_URL` | Custom Solana RPC endpoint |
| `TELEGRAM_BOT_TOKEN` | Bot token for Telegram distribution |
| `TELEGRAM_CHAT_ID` | Chat ID for Telegram distribution |

## Event Detection

The engine detects 8 types of notable market activity:

| Event Type | Priority | Trigger |
|------------|----------|---------|
| `just_resolved` | 5 | Market outcome decided |
| `race_leader_flip` | 5 | New leader in race market |
| `closing_soon` | 4 | Market closes within 24 hours |
| `odds_shift` | 4 | YES/NO swung >10% since last check |
| `milestone_pool` | 4 | Pool crossed 1/5/10/25/50/100 SOL |
| `new_market` | 3 | Market with no bets yet |
| `first_bet` | 3 | Market just received its first bet |
| `close_contest` | 3 | YES and NO within 10% of each other |

Events are priority-sorted (highest first), with pool size as tiebreaker.

## Distribution Targets

| Target | Description |
|--------|-------------|
| `console` | Rich terminal output with ANSI colors |
| `agentbook` | Baozi's social board (`POST /api/agentbook/post`) |
| `telegram` | Telegram bot message with share card link |
| `file` | Markdown file per event in output directory |

Each post includes:
- Share card image URL (`GET /api/share/card?market=PDA`)
- Market link with affiliate code
- Bilingual proverb caption (Chinese + English)
- Event details and metadata

## Viral Loop

```
Market activity detected
  → Detect event (resolved, odds shift, closing soon, etc.)
  → Generate share card via API (1200×630 PNG with live odds)
  → Craft caption with proverb + market context
  → Post to targets (AgentBook, Telegram, etc.)
  → Affiliate link in every post (1% lifetime commission)
  → New users bet → more activity → more cards → repeat
```

## Engagement Metrics

The engine tracks all posts with:
- Event type distribution
- Target distribution
- Unique markets covered
- Post history (last 500)

Run `bun run src/index.ts metrics` to see the summary.

## Architecture

```
src/
├── api/
│   ├── markets.ts       — Solana RPC, V4.7.6 boolean + race decoders
│   └── share-cards.ts   — Share card URL builder and downloader
├── engine/
│   ├── detector.ts      — 8 event types, configurable thresholds, proverbs
│   ├── distributor.ts   — Multi-target distribution (AgentBook, Telegram, file)
│   └── metrics.ts       — Post tracking and engagement analytics
├── cli/
│   └── commands.ts      — CLI handlers (demo, monitor, scan, generate, metrics)
└── index.ts             — Entry point
```

## Data Sources

All market data fetched directly from Solana mainnet via RPC:
- Program: `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`
- Share cards: `GET https://baozi.bet/api/share/card?market=PDA`
- No API keys required for market data

## Wallet

Solana: `6eUdRMHNRBGPixtdDbNPxM1W26M5GdSq3BXczQR8S2RK`
