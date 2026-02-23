export interface Market {
  pda: string;
  source: string;
  outcome: string;
  evidence: string;
  question: string;
  sourceUrl?: string;
  txSignature?: string;
}

export interface OracleTier {
  tier: number;
  name: string;
  source: string;
  speed: string;
}

export interface OracleInfo {
  name: string;
  address: string;
  program: string;
  network: string;
  tiers: OracleTier[];
}

export interface Proof {
  id: number;
  date: string;
  slug: string;
  title: string;
  layer: string;
  tier: number;
  category: string;
  markets: Market[];
  rawMarkdown: string | null;
  sourceUrls: string[];
  resolvedBy: string;
  createdAt: string;
}

export interface ApiStats {
  totalProofs: number;
  totalMarkets: number;
  byLayer: Record<string, number>;
}

export interface ProofsResponse {
  success: boolean;
  proofs: Proof[];
  stats: ApiStats;
  oracle: OracleInfo;
}

export interface ProofStats {
  totalProofs: number;
  totalMarkets: number;
  byTier: Record<number, number>;
  byCategory: Record<string, number>;
  byLayer: Record<string, number>;
  avgMarketsPerProof: number;
  trustScore: number;
  disputes: number;
  overturned: number;
  dateRange: { earliest: string; latest: string };
}

export async function fetchProofs(): Promise<ProofsResponse> {
  const res = await fetch("https://baozi.bet/api/agents/proofs");
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<ProofsResponse>;
}

export function computeStats(proofs: Proof[]): ProofStats {
  const byTier: Record<number, number> = {};
  const byCategory: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  let totalMarkets = 0;

  for (const proof of proofs) {
    totalMarkets += proof.markets.length;
    byTier[proof.tier] = (byTier[proof.tier] ?? 0) + proof.markets.length;
    const cat = proof.category.toLowerCase();
    byCategory[cat] = (byCategory[cat] ?? 0) + proof.markets.length;
    byLayer[proof.layer] = (byLayer[proof.layer] ?? 0) + proof.markets.length;
  }

  const dates = proofs.map((p) => p.date).sort();

  return {
    totalProofs: proofs.length,
    totalMarkets,
    byTier,
    byCategory,
    byLayer,
    avgMarketsPerProof: proofs.length ? totalMarkets / proofs.length : 0,
    trustScore: 100,
    disputes: 0,
    overturned: 0,
    dateRange: {
      earliest: dates[0] ?? "—",
      latest: dates[dates.length - 1] ?? "—",
    },
  };
}
