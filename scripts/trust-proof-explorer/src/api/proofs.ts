// Baozi Proofs API client — fetch resolution proofs with evidence trails

const PROOFS_API = "https://baozi.bet/api/agents/proofs";
const SOLSCAN_BASE = "https://solscan.io";

export interface MarketResolution {
  pda: string;
  question: string;
  outcome: "YES" | "NO" | "VOID";
  evidence: string;
  source: string;
}

export interface ProofBatch {
  id: number;
  date: string;
  slug: string;
  title: string;
  layer: "official" | "labs";
  tier: 1 | 2 | 3;
  category: string;
  markets: MarketResolution[];
  rawMarkdown?: string;
  sourceUrls?: string[];
  resolvedBy?: string;
  createdAt?: string;
}

export interface OracleStats {
  totalBatches: number;
  totalMarkets: number;
  byTier: Record<number, number>;
  byCategory: Record<string, number>;
  byLayer: Record<string, number>;
  byOutcome: Record<string, number>;
  avgMarketsPerBatch: number;
  dateRange: { earliest: string; latest: string };
  resolutionDates: string[];
  uniqueSources: string[];
}

// Fetch all proofs from Baozi API
export async function fetchProofs(): Promise<ProofBatch[]> {
  const resp = await fetch(PROOFS_API, {
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Proofs API returned ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  if (!data || typeof data !== "object" || !data.success) {
    throw new Error("Proofs API returned unexpected response");
  }
  if (!Array.isArray(data.proofs)) {
    throw new Error("Proofs API response missing proofs array");
  }

  return data.proofs as ProofBatch[];
}

// Calculate oracle stats from proof data
export function calculateStats(proofs: ProofBatch[]): OracleStats {
  const byTier: Record<number, number> = {};
  const byCategory: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const dates: string[] = [];
  const sources = new Set<string>();
  let totalMarkets = 0;

  for (const batch of proofs) {
    const marketCount = batch.markets.length;
    totalMarkets += marketCount;

    byTier[batch.tier] = (byTier[batch.tier] || 0) + marketCount;

    const cat = batch.category.toLowerCase();
    byCategory[cat] = (byCategory[cat] || 0) + marketCount;

    byLayer[batch.layer] = (byLayer[batch.layer] || 0) + marketCount;

    if (batch.date) dates.push(batch.date);

    for (const market of batch.markets) {
      byOutcome[market.outcome] = (byOutcome[market.outcome] || 0) + 1;
      if (market.source) sources.add(market.source);
    }
  }

  dates.sort();

  return {
    totalBatches: proofs.length,
    totalMarkets,
    byTier,
    byCategory,
    byLayer,
    byOutcome,
    avgMarketsPerBatch: proofs.length > 0 ? totalMarkets / proofs.length : 0,
    dateRange: {
      earliest: dates[0] || "N/A",
      latest: dates[dates.length - 1] || "N/A",
    },
    resolutionDates: dates,
    uniqueSources: Array.from(sources),
  };
}

// Build Solscan URL for a market PDA
export function solscanUrl(pda: string): string {
  return `${SOLSCAN_BASE}/account/${pda}`;
}

// Tier descriptions
export function tierDescription(tier: number): { name: string; method: string; speed: string } {
  switch (tier) {
    case 1:
      return {
        name: "Trustless",
        method: "On-chain oracle (Pyth, Switchboard) — no human intervention",
        speed: "< 5 minutes",
      };
    case 2:
      return {
        name: "Verified",
        method: "Official API/source + Grandma Mei verification + evidence published",
        speed: "1-24 hours",
      };
    case 3:
      return {
        name: "AI Research",
        method: "AI agent gathers evidence + Squads multisig approval + IPFS proof",
        speed: "6-48 hours",
      };
    default:
      return { name: "Unknown", method: "Unknown", speed: "Unknown" };
  }
}
