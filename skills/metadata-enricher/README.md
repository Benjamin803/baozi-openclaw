# Metadata Enricher — Auto-Curate Lab Markets (Bounty #12)

LLM-powered market metadata enricher for Baozi. Analyzes prediction markets, scores quality, validates timing rules, and posts factual reports to AgentBook.

## Architecture

```
Baozi API (list_markets)
    │
    ▼
Rate Limiter (batched processing)
    │
    ▼
LLM Classifier (GPT-4o-mini / keyword fallback)
    │
    ├── Category + Tags
    ├── Timing type (A/B)
    ├── Quality score (0-100)
    └── Data source identification
    │
    ▼
Guardrail Compliance Check
    ├── Open market → FACTUAL_ONLY (odds, pool, timing)
    └── Closed market → FULL_ANALYSIS (predictions OK)
    │
    ▼
AgentBook Post / Market Comment
```

## Guardrail Compliance

**Golden rule:** _"Bettors must NEVER have information advantage while betting is open."_

| Market State | Mode | Allowed Content |
|-------------|------|----------------|
| `isBettingOpen: true` | `FACTUAL_ONLY` | Odds, pool size, timing, category, quality score |
| `isBettingOpen: false` | `FULL_ANALYSIS` | All of the above + predictive analysis, outcome discussion |

**Blocked patterns** for open markets:
- "likely to win/resolve"
- "should resolve YES/NO"
- "I think/believe/predict"
- "strong chance/probability"
- "leaning towards"
- Any outcome-predictive language

Enforcement is in `src/guardrails.ts` with full test coverage in `test/guardrails.test.ts`.

## Rate Limiting

Markets are processed in configurable batches to prevent RPC/API hammering:

| Setting | Default | Env Var |
|---------|---------|---------|
| Batch size | 5 | `BATCH_SIZE` |
| Per-item delay | 3s | `PER_ITEM_DELAY_MS` |
| Inter-batch delay | 10s | `INTER_BATCH_DELAY_MS` |
| Max concurrent | 1 | `MAX_CONCURRENT` |

With 64 markets and default settings, a full scan takes ~4 minutes.

## Running

```bash
cd skills/metadata-enricher
cp .env.example .env   # fill in PRIVATE_KEY and OPENAI_API_KEY
npm install
npm run build
npm start
```

## Integration Test

Run the live integration test against 3+ real mainnet markets:

```bash
npx tsx scripts/live-integration.ts
```

This will:
1. Fetch markets from `https://baozi.bet/api/markets`
2. Select 3+ markets (mix of open/closed)
3. Run full enrichment pipeline on each
4. Verify guardrail compliance
5. Write results to `logs/live-integration-*.json`

Output shows the full pipeline: `market fetched → data sources queried → analysis generated → posted`

## Environment Variables

```env
BAOZI_API_URL=https://baozi.bet/api
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
WALLET_ADDRESS=FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz
PRIVATE_KEY=                    # Base58 Solana private key
OPENAI_API_KEY=                 # For GPT-4o-mini classification
ENRICH_INTERVAL_MINUTES=120     # Cron interval
BATCH_SIZE=5                    # Markets per batch
PER_ITEM_DELAY_MS=3000          # Delay between markets
INTER_BATCH_DELAY_MS=10000      # Delay between batches
```

## Quality Scoring (0-100)

| Flag | Points | Criteria |
|------|--------|----------|
| `clear-question` | 20 | Ends with `?`, 20-200 chars |
| `objectively-verifiable` | 20 | LLM confirms objective outcome |
| `timing-compliant` | 20 | Passes v6.3 timing rules |
| `data-source` | 20 | Has identifiable verification source |
| `unique` | 20 | Jaccard similarity < 0.6 to existing markets |

## Program

- **Baozi API:** `https://baozi.bet/api`
- **MCP:** `npx @baozi.bet/mcp-server` (v4.0.11)
- **Guardrails:** `https://baozi.bet/api/pari-mutuel-guardrails`
