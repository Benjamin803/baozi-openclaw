/**
 * MCP Client for @baozi.bet/mcp-server
 *
 * Imports handlers DIRECTLY from the installed @baozi.bet/mcp-server package
 * instead of spawning a subprocess. This is faster, more reliable, and testable.
 */
import { listMarkets, getMarket } from "@baozi.bet/mcp-server/dist/handlers/markets.js";
import { listRaceMarkets, getRaceMarket, getRaceQuote } from "@baozi.bet/mcp-server/dist/handlers/race-markets.js";
import { getQuote } from "@baozi.bet/mcp-server/dist/handlers/quote.js";
import { PROGRAM_ID } from "@baozi.bet/mcp-server/dist/config.js";
import type { McpResult } from "../types/index.js";

// Re-export the direct handlers for use in other modules
export { listMarkets, getMarket, listRaceMarkets, getRaceMarket, getRaceQuote, getQuote, PROGRAM_ID };

/**
 * Execute an MCP tool by name using direct handler imports.
 * Maps tool names to the corresponding handler functions.
 */
export async function execMcpTool(
  toolName: string,
  params: Record<string, any>
): Promise<McpResult> {
  try {
    switch (toolName) {
      case "list_markets": {
        const markets = await listMarkets(params.status);
        return { success: true, data: markets };
      }
      case "get_market": {
        const market = await getMarket(params.market_pda || params.publicKey);
        return { success: true, data: market };
      }
      case "list_race_markets": {
        const raceMarkets = await listRaceMarkets(params.status);
        return { success: true, data: raceMarkets };
      }
      case "get_race_market": {
        const raceMarket = await getRaceMarket(params.market_pda || params.publicKey);
        return { success: true, data: raceMarket };
      }
      case "get_quote": {
        const quote = await getQuote(params.market_pda, params.side, params.amount);
        return { success: true, data: quote };
      }
      case "get_race_quote": {
        const raceMarketData = await getRaceMarket(params.market_pda);
        if (!raceMarketData) {
          return { success: false, error: "Race market not found" };
        }
        const raceQuote = getRaceQuote(raceMarketData, params.outcome_index, params.amount);
        return { success: true, data: raceQuote };
      }
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { success: false, error: `MCP handler error: ${err.message}` };
  }
}
