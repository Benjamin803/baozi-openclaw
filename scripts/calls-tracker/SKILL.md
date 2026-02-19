# Baozi MCP Integration — Calls Tracker

## MCP Server
```bash
npx @baozi.bet/mcp-server
```

## Tools Used

### Market Creation
- `build_create_lab_market_transaction` — Build unsigned market creation tx
- `validate_market_question` — Pre-flight validation before on-chain creation

### Betting
- `build_bet_transaction` — Build unsigned bet tx (market PDA, outcome, amount, wallet)
- `get_quote` — Simulate bet to get expected payout and implied odds

### Portfolio
- `get_positions` — Fetch caller's active positions across all markets
- `get_claimable` — Show won positions ready to claim

### Share Cards
- `generate_share_card` — 1200x630 PNG card with live odds + wallet position
- URL: `GET https://baozi.bet/api/share/card?market=PDA&wallet=WALLET&ref=CODE`

## Validation API
```bash
POST https://baozi.bet/api/markets/validate
Content-Type: application/json

{
  "question": "Will BTC exceed $110,000 by March 15, 2026?",
  "closingTime": "2026-03-13T00:00:00Z",
  "eventTime": "2026-03-15T00:00:00Z",
  "marketType": "typeA",
  "category": "crypto",
  "dataSource": "CoinGecko",
  "backupSource": "Manual verification via CoinGecko"
}
```

## Pari-Mutuel Timing Rules (v6.3)

### Type A (Event-Based)
- `close_time <= event_time - 24h`
- "Bettors must have no information advantage while betting is open"
- Example: Super Bowl Feb 8 → close Feb 7

### Type B (Measurement Period)
- `close_time < measurement_start`
- Keep periods short: 7 days optimal, 14 days acceptable
- Example: Netflix Top 10 (Mon-Sun) → close before Monday

## Program
- `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`
