---
name: trending-market-machine
version: 2.0.0
description: Auto-create Baozi Lab prediction markets from trending topics
author: TheAuroraAI
category: market-creation
requires:
  - "@baozi.bet/mcp-server"
  - "@solana/web3.js"
env:
  - SOLANA_RPC_URL: "Solana RPC endpoint (default: mainnet-beta)"
  - SOLANA_PRIVATE_KEY: "JSON array of wallet secret key bytes"
  - DRY_RUN: "Set to 'true' to simulate without creating markets"
---

# Trending Market Machine

> The machine never sleeps. If it's trending, there's a market.

An autonomous agent that monitors trending topics across multiple platforms and auto-creates properly-structured Lab prediction markets on Baozi.

## What It Does

1. **Detects trends** from 3 sources: CoinGecko (crypto), HackerNews (tech), RSS feeds (news/sports)
2. **Generates market questions** following Baozi Parimutuel Rules v7.0 (Type A only)
3. **Validates** via local rule checks AND the Baozi validation API
4. **Creates Lab markets** on Solana mainnet with proper metadata
5. **Deduplicates** — never creates duplicate markets for the same topic

## v7.0 Compliance

All markets are **Type A (event-based)** only. Type B (measurement-period) markets are banned.

**The Core Test:** "Can a bettor observe or calculate the likely outcome while betting is still open?"
- YES → BLOCKED
- NO → Allowed

**Blocked Terms (auto-rejected):** `price above`, `price below`, `trading volume`, `market cap`, `gains most`, `total volume`, `total burned`, `average over`, `this week`, `this month`, `floor price`, `ATH`, `TVL`

## Trend Sources

| Source | Category | Market Types |
|--------|----------|--------------|
| CoinGecko Trending | Crypto | Mainnet launches, exchange listings, partnerships, governance votes |
| HackerNews | Tech | Product launches, acquisitions, regulatory decisions, IPO filings |
| CoinDesk RSS | Crypto | Protocol upgrades, partnerships |
| TechCrunch RSS | Tech | Product launches, acquisitions |
| ESPN RSS | Sports | Game outcomes, championships |

## Market Types Generated

All markets follow the pattern: "Will [specific event] happen before [date]?"

**Crypto:**
- Mainnet/upgrade launches
- Exchange listings on major CEXs
- Partnership confirmations
- Governance proposal outcomes

**Tech/News:**
- Product/feature availability
- Acquisition/merger confirmations
- Regulatory/legal decisions
- IPO filings
- Open source release milestones

**Sports:**
- Game/match outcomes (single point-in-time event)

## Commands

```bash
# Detect trending topics (no market creation)
bun run detect

# Validate a market question
bun run validate "Will Ethereum complete the Pectra upgrade before March 2026?"

# Create markets (dry run)
DRY_RUN=true bun run start

# Create markets (live)
SOLANA_PRIVATE_KEY='[...]' bun run start

# Run continuous loop (every 15 min)
bun run start loop
```

## Market Quality Rules

- **Type A ONLY** — single point-in-time events with genuinely unknowable outcomes
- No price/volume/metric prediction markets (v7.0 banned)
- No duplicate markets (checks existing Baozi markets)
- No subjective outcomes ("Will people like X?" → rejected)
- Closing time ≥ 24h before event (v7.0 requirement)
- Minimum 48h until closing time
- Maximum 14 days until closing
- Must have verifiable data source (tier-1 sources preferred)
- Rate limited to 3 markets/hour
