/**
 * Market Reader Service
 *
 * Reads market data from Baozi via direct handler imports from @baozi.bet/mcp-server.
 * Provides normalized market data for the analysis engine.
 */
import {
  listMarkets as mcpListMarkets,
  getMarket as mcpGetMarket,
  listRaceMarkets as mcpListRaceMarkets,
  getQuote as mcpGetQuote,
  getRaceMarket as mcpGetRaceMarket,
  getRaceQuote as mcpGetRaceQuote,
} from "./mcp-client.js";
import type { Market, MarketOutcome, Quote, RaceMarket } from "../types/index.js";

export interface MarketReaderConfig {
  // Config kept for API compatibility but no longer needs http/proxy settings
}

export class MarketReader {
  constructor(_config: MarketReaderConfig = {}) {}

  /**
   * List active markets with optional filters.
   */
  async listMarkets(options: {
    status?: string;
    layer?: string;
    query?: string;
    limit?: number;
  } = {}): Promise<Market[]> {
    try {
      const rawMarkets = await mcpListMarkets(options.status || "active");
      if (!rawMarkets || !Array.isArray(rawMarkets)) {
        return [];
      }

      let markets = rawMarkets.map((m: any) => this.normalizeMarket(m));

      // Apply client-side filters
      if (options.layer && options.layer !== "all") {
        markets = markets.filter((m) => m.layer === options.layer);
      }
      if (options.query) {
        const q = options.query.toLowerCase();
        markets = markets.filter((m) => m.question.toLowerCase().includes(q));
      }
      if (options.limit) {
        markets = markets.slice(0, options.limit);
      }

      return markets;
    } catch (err: any) {
      console.error("Failed to list markets:", err.message);
      return [];
    }
  }

  /**
   * List race markets (multi-outcome).
   */
  async listRaceMarkets(options: {
    status?: string;
    limit?: number;
  } = {}): Promise<RaceMarket[]> {
    try {
      const rawMarkets = await mcpListRaceMarkets(options.status || "active");
      if (!rawMarkets || !Array.isArray(rawMarkets)) {
        return [];
      }

      let markets = rawMarkets.map((m: any) => this.normalizeRaceMarket(m));

      if (options.limit) {
        markets = markets.slice(0, options.limit);
      }

      return markets;
    } catch (err: any) {
      console.error("Failed to list race markets:", err.message);
      return [];
    }
  }

  /**
   * Get detailed quote for a market (implied probabilities + price impact).
   */
  async getQuote(marketPda: string, side: string, amount: number): Promise<Quote | null> {
    try {
      const raw = await mcpGetQuote(marketPda, side as "Yes" | "No", amount);
      if (!raw || !raw.valid) {
        return null;
      }

      return {
        marketPda,
        side,
        amount,
        avgPrice: raw.expectedPayoutSol > 0 ? amount / raw.expectedPayoutSol : 0,
        priceImpact: Math.abs(raw.newYesPercent - raw.currentYesPercent),
        estimatedShares: raw.expectedPayoutSol,
        impliedProbability: raw.impliedOdds,
      };
    } catch (err: any) {
      console.error("Failed to get quote:", err.message);
      return null;
    }
  }

  /**
   * Get race market quote (multi-outcome).
   */
  async getRaceQuote(
    marketPda: string,
    outcomeIndex: number,
    amount: number
  ): Promise<Quote | null> {
    try {
      const raceMarket = await mcpGetRaceMarket(marketPda);
      if (!raceMarket) return null;

      const raw = mcpGetRaceQuote(raceMarket, outcomeIndex, amount);
      if (!raw || !raw.valid) {
        return null;
      }

      return {
        marketPda,
        side: `outcome_${outcomeIndex}`,
        amount,
        avgPrice: raw.expectedPayoutSol > 0 ? amount / raw.expectedPayoutSol : 0,
        priceImpact: 0,
        estimatedShares: raw.expectedPayoutSol,
        impliedProbability: raw.impliedOdds,
      };
    } catch (err: any) {
      console.error("Failed to get race quote:", err.message);
      return null;
    }
  }

  /**
   * Get market details by PDA.
   */
  async getMarketDetails(marketPda: string): Promise<Market | null> {
    try {
      const raw = await mcpGetMarket(marketPda);
      if (!raw) return null;
      return this.normalizeMarket(raw);
    } catch (err: any) {
      console.error("Failed to get market details:", err.message);
      return null;
    }
  }

  /**
   * Fetch markets closing soon (within given hours).
   */
  async getClosingSoon(withinHours: number = 24): Promise<Market[]> {
    const markets = await this.listMarkets({ status: "active", limit: 100 });
    const cutoff = new Date(Date.now() + withinHours * 60 * 60 * 1000);
    return markets.filter((m) => new Date(m.closingTime) <= cutoff);
  }

  /**
   * Fetch markets sorted by pool size (volume proxy).
   */
  async getTopByVolume(limit: number = 10): Promise<Market[]> {
    const markets = await this.listMarkets({ status: "active", limit: 100 });
    return markets.sort((a, b) => b.pool.total - a.pool.total).slice(0, limit);
  }

  /**
   * Normalize a raw MCP Market object into our typed Market.
   */
  private normalizeMarket(raw: any): Market {
    const outcomes: MarketOutcome[] = [];

    // @baozi.bet/mcp-server returns yesPoolSol/noPoolSol directly
    if (raw.yesPoolSol !== undefined && raw.noPoolSol !== undefined) {
      const total = (raw.yesPoolSol || 0) + (raw.noPoolSol || 0);
      outcomes.push(
        {
          index: 0,
          label: "Yes",
          probability: raw.yesPercent !== undefined ? raw.yesPercent / 100 : (total > 0 ? raw.yesPoolSol / total : 0.5),
          pool: raw.yesPoolSol,
        },
        {
          index: 1,
          label: "No",
          probability: raw.noPercent !== undefined ? raw.noPercent / 100 : (total > 0 ? raw.noPoolSol / total : 0.5),
          pool: raw.noPoolSol,
        }
      );
    } else if (raw.outcomes && Array.isArray(raw.outcomes)) {
      for (let i = 0; i < raw.outcomes.length; i++) {
        const o = raw.outcomes[i];
        outcomes.push({
          index: i,
          label: o.label || o.name || (i === 0 ? "Yes" : "No"),
          probability: o.probability || o.implied_probability || 0,
          pool: o.pool || o.pool_amount || 0,
        });
      }
    } else {
      outcomes.push(
        { index: 0, label: "Yes", probability: 0.5, pool: 0 },
        { index: 1, label: "No", probability: 0.5, pool: 0 }
      );
    }

    const totalPool = raw.totalPoolSol ?? outcomes.reduce((sum, o) => sum + o.pool, 0);

    // Map layer from MCP format
    const layerMap: Record<string, "official" | "lab" | "private"> = {
      Official: "official",
      Lab: "lab",
      Private: "private",
    };

    // Map status from MCP format
    const statusMap: Record<string, "active" | "closed" | "resolved"> = {
      Active: "active",
      Closed: "closed",
      Resolved: "resolved",
    };

    return {
      id: raw.marketId || raw.publicKey || "",
      pda: raw.publicKey || raw.pda || "",
      question: raw.question || raw.title || "",
      status: statusMap[raw.status] || (raw.status?.toLowerCase() as any) || "active",
      layer: layerMap[raw.layer] || (raw.layer?.toLowerCase() as any) || "official",
      category: raw.category || raw.tag || undefined,
      closingTime: raw.closingTime || raw.close_time || "",
      createdAt: raw.createdAt || raw.created_at || "",
      pool: { total: totalPool, outcomes: outcomes.map((o) => o.pool) },
      outcomes,
      volume: raw.volume || totalPool,
      creator: raw.creator || undefined,
    };
  }

  /**
   * Normalize a raw MCP RaceMarket object.
   */
  private normalizeRaceMarket(raw: any): RaceMarket {
    const outcomes: MarketOutcome[] = [];

    if (raw.outcomes && Array.isArray(raw.outcomes)) {
      for (let i = 0; i < raw.outcomes.length; i++) {
        const o = raw.outcomes[i];
        outcomes.push({
          index: o.index ?? i,
          label: o.label || `Outcome ${i}`,
          probability: o.percent !== undefined ? o.percent / 100 : 0,
          pool: o.poolSol || 0,
        });
      }
    }

    const totalPool = raw.totalPoolSol ?? outcomes.reduce((sum, o) => sum + o.pool, 0);

    const layerMap: Record<string, "official" | "lab" | "private"> = {
      Official: "official",
      Lab: "lab",
      Private: "private",
    };

    const statusMap: Record<string, "active" | "closed" | "resolved"> = {
      Active: "active",
      Closed: "closed",
      Resolved: "resolved",
    };

    return {
      id: raw.marketId || raw.publicKey || "",
      pda: raw.publicKey || raw.pda || "",
      question: raw.question || "",
      status: statusMap[raw.status] || (raw.status?.toLowerCase() as any) || "active",
      layer: layerMap[raw.layer] || (raw.layer?.toLowerCase() as any) || "official",
      closingTime: raw.closingTime || "",
      createdAt: raw.createdAt || "",
      pool: { total: totalPool, outcomes: outcomes.map((o) => o.pool) },
      outcomes,
      volume: totalPool,
      creator: raw.creator || undefined,
    };
  }
}
