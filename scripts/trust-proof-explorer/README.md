# Trust Proof Explorer — Verifiable Oracle Transparency Dashboard

Every resolution has receipts. Make trust visible.

## What It Does

Fetches all resolution proofs from the Baozi oracle (Grandma Mei), displays them with full evidence trails, and generates trust dashboards showing why Baozi is the most transparent prediction market.

## Quick Start

```bash
cd scripts/trust-proof-explorer
bun install

# Browse all proofs
bun run explorer

# Oracle stats
bun run stats

# Full demo with all features
bun run demo

# Export HTML dashboard
bun run export

# Export as JSON or Markdown
bun run export -- --json
bun run export -- --markdown
```

## Features

### Live Proof Explorer
Fetches real-time resolution data from `baozi.bet/api/agents/proofs`:
- 19 markets resolved across 8 proof batches
- Evidence trails with source links and Solscan verification
- Filter by tier, category, keyword, or PDA

```
=== TRUST PROOF EXPLORER ===

┌───────────────────────────────────────────────────────────────┐
│  Official Markets — Feb 19 Resolution                         │
│  Tier 2: Verified | Category: Sports/Esports | 4 markets     │
├───────────────────────────────────────────────────────────────┤
  ├─ Will a Toyota driver win the 2026 Daytona 500?
  │  Outcome: [YES]
  │  Evidence: Tyler Reddick won, passed Chase Elliott...
  │  Source: wikipedia.org/wiki/2026_Daytona_500
  │  Solscan: solscan.io/account/Fsw...
```

### Oracle Stats Dashboard
Performance metrics for the Grandma Mei oracle:

```
Total proof batches:    8
Total markets resolved: 19
Trust Score:            100% (0 disputes, 0 overturned)

By Tier:
  Tier 2 (Verified): 19 markets (100%)

By Category:
  sports          8    #############
  politics        5    ########
  sports/esports  4    #######
```

### Trust Comparison Table
Side-by-side comparison with other prediction markets:

```
Feature            │Baozi                 │Polymarket  │Kalshi
───────────────────┼──────────────────────┼────────────┼───────
Evidence stored    │IPFS + On-chain       │None        │None
Proof public       │YES - full trail      │NO          │NO
Resolution method  │Grandma Mei + Pyth    │UMA Oracle  │Internal
Multisig           │Squads (2-of-2)       │UMA vote    │Centralized
Transparency       │FULL                  │PARTIAL     │MINIMAL
```

### Multi-Format Export
- **HTML**: Dark-themed dashboard with stats grid, proof cards, and comparison table
- **JSON**: Raw structured data for programmatic use
- **Markdown**: Documentation-ready report with all proofs

## CLI Commands

| Command | Description |
|---------|-------------|
| `bun run explorer` | Browse proofs with filters |
| `bun run explorer -- --search BTC` | Search by keyword |
| `bun run explorer -- --category sports` | Filter by category |
| `bun run explorer -- --tier 2` | Filter by tier |
| `bun run explorer -- --pda Fsw...` | Look up specific market |
| `bun run stats` | Oracle performance metrics |
| `bun run export` | Generate HTML dashboard |
| `bun run export -- --json` | Export as JSON |
| `bun run export -- --markdown` | Export as Markdown |
| `bun run demo` | Full showcase |

## Architecture

```
src/
  index.ts               — CLI dispatcher
  api/
    proofs.ts            — Baozi proofs API client + stats calculator
  dashboard/
    renderer.ts          — Terminal + HTML rendering engine
  cli/
    explorer.ts          — Proof browser with filters
    stats.ts             — Oracle performance stats
    export.ts            — HTML/JSON/Markdown export
    demo.ts              — Full showcase
```

## Data Source

- **API**: `GET https://baozi.bet/api/agents/proofs`
- **Proof page**: https://baozi.bet/agents/proof
- **MCP tools**: `get_resolution_status`, `get_disputed_markets`
- **Program**: `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`

## Oracle Tiers

| Tier | Name | Method | Speed |
|------|------|--------|-------|
| 1 | Trustless | On-chain oracle (Pyth/Switchboard) | < 5 min |
| 2 | Verified | Official API + Grandma Mei verification | 1-24h |
| 3 | AI Research | AI evidence gathering + Squads multisig | 6-48h |

## Dependencies

- `@solana/web3.js` — Solscan link generation
- `bun:sqlite` — (reserved for future caching)
- No external API keys needed
