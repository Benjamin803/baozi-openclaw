# Claim & Alert Agent (Bounty #11)

Portfolio monitoring agent that watches for claimable winnings, odds shifts, and market resolutions on Baozi prediction markets.

**Wallet:** `FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz`
**Bounty:** #11 (0.5 SOL)

## Features
- Real on-chain data via `getProgramAccounts` with correct discriminators
- Buffer decoding matching V4.7.6 layout
- 4 alert types: claimable winnings, market resolved, closing soon, odds shift
- **MCP integration:** Calls `build_claim_winnings_transaction` via `@baozi.bet/mcp-server` to build claim transactions
- Discord webhook notifications with embed formatting
- Anti-spam cooldowns per alert type
- State persistence via JSON

## MCP Integration
When claimable winnings are detected, the agent calls `build_claim_winnings_transaction` via the Baozi MCP server to build an unsigned transaction. The transaction data is included in the alert so users can sign and submit it.

```
npx @baozi.bet/mcp-server → build_claim_winnings_transaction({marketPda, walletAddress})
```

## Running
```bash
npm install
npm run build
node dist/index.js
```

## Tests
```bash
npx vitest run
```

## Environment
See `.env.example` for required variables.
