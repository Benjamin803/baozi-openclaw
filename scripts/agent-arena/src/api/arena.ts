// Arena engine — computes leaderboard, P&L, streaks, and per-market agent analysis
// Works with both boolean and race markets

import type {
  ArenaData,
  Market,
  UserPosition,
  RaceMarket,
  RacePosition,
  CreatorProfile,
} from "./solana.js";
import { agentName } from "./solana.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentStats {
  wallet: string;
  name: string;
  totalWagered: number;
  totalWon: number;
  totalLost: number;
  pnl: number;
  openPositions: number;
  resolvedPositions: number;
  accuracy: number; // percent of resolved positions won
  wins: number;
  losses: number;
  streak: number; // consecutive correct (positive) or wrong (negative)
  activeMarkets: AgentMarketPosition[];
  resolvedMarkets: AgentMarketPosition[];
}

export interface AgentMarketPosition {
  marketPda: string;
  marketId: string;
  question: string;
  side: string;
  amountSol: number;
  status: string;
  pnlSol: number; // estimated or actual
  odds: number; // implied probability of their side
  isWinner: boolean | null; // null if unresolved
  type: "boolean" | "race";
}

export interface MarketArenaView {
  pda: string;
  marketId: string;
  question: string;
  status: string;
  totalPoolSol: number;
  type: "boolean" | "race";
  agents: {
    wallet: string;
    name: string;
    side: string;
    amountSol: number;
    pnlSol: number;
    isWinner: boolean | null;
  }[];
  // Boolean-specific
  yesPercent?: number;
  noPercent?: number;
  winningOutcome?: string | null;
  // Race-specific
  outcomes?: { label: string; pool: number; percent: number }[];
  winnerIndex?: number | null;
}

export interface ArenaReport {
  leaderboard: AgentStats[];
  activeMarkets: MarketArenaView[];
  resolvedMarkets: MarketArenaView[];
  totalAgents: number;
  totalMarkets: number;
  totalVolume: number;
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export function buildArenaReport(data: ArenaData): ArenaReport {
  const { markets, positions, raceMarkets, racePositions, profiles } = data;

  // Index markets by ID
  const marketById = new Map<string, Market>();
  for (const m of markets) marketById.set(m.marketId, m);

  const raceById = new Map<string, RaceMarket>();
  for (const r of raceMarkets) raceById.set(r.marketId, r);

  // Group positions by user wallet
  const agentPositions = new Map<string, UserPosition[]>();
  for (const p of positions) {
    const arr = agentPositions.get(p.user) || [];
    arr.push(p);
    agentPositions.set(p.user, arr);
  }

  const agentRacePositions = new Map<string, RacePosition[]>();
  for (const rp of racePositions) {
    const arr = agentRacePositions.get(rp.user) || [];
    arr.push(rp);
    agentRacePositions.set(rp.user, arr);
  }

  // Get all unique agent wallets
  const allWallets = new Set<string>();
  for (const p of positions) allWallets.add(p.user);
  for (const rp of racePositions) allWallets.add(rp.user);

  // Compute per-agent stats
  const agentStats: AgentStats[] = [];

  for (const wallet of allWallets) {
    const name = agentName(wallet, profiles);
    const boolPositions = agentPositions.get(wallet) || [];
    const rPositions = agentRacePositions.get(wallet) || [];

    let totalWagered = 0;
    let totalWon = 0;
    let totalLost = 0;
    let wins = 0;
    let losses = 0;
    let openPositions = 0;
    let resolvedPositions = 0;
    const activeMarkets: AgentMarketPosition[] = [];
    const resolvedMarkets: AgentMarketPosition[] = [];

    // Process boolean positions
    for (const pos of boolPositions) {
      const market = marketById.get(pos.marketId);
      if (!market) continue;

      totalWagered += pos.totalAmountSol;

      const isResolved = market.statusCode === 2 || market.statusCode === 3;
      let pnl = 0;
      let isWinner: boolean | null = null;

      if (isResolved && market.winningOutcome) {
        resolvedPositions++;
        const won =
          (market.winningOutcome === "Yes" && pos.side === "Yes") ||
          (market.winningOutcome === "No" && pos.side === "No") ||
          (pos.side === "Both"); // simplified — both sides

        if (won) {
          // Approximate payout: (totalPool / winningPool) * betAmount
          const winPool =
            market.winningOutcome === "Yes"
              ? market.yesPoolSol
              : market.noPoolSol;
          const betOnWinningSide =
            market.winningOutcome === "Yes"
              ? pos.yesAmountSol
              : pos.noAmountSol;

          if (winPool > 0 && betOnWinningSide > 0) {
            const grossPayout =
              (market.totalPoolSol / winPool) * betOnWinningSide;
            const netPayout = grossPayout * 0.97; // ~3% platform fee
            pnl = netPayout - pos.totalAmountSol;
            totalWon += netPayout;
          }
          wins++;
          isWinner = true;
        } else {
          pnl = -pos.totalAmountSol;
          totalLost += pos.totalAmountSol;
          losses++;
          isWinner = false;
        }
      } else {
        openPositions++;

        // Estimate unrealized P&L based on current odds
        const yesOdds =
          market.totalPoolSol > 0 ? market.yesPoolSol / market.totalPoolSol : 0.5;
        const noOdds = 1 - yesOdds;

        if (pos.side === "Yes") {
          const expectedPayout =
            market.yesPoolSol > 0
              ? (market.totalPoolSol / market.yesPoolSol) * pos.yesAmountSol * 0.97
              : 0;
          pnl = expectedPayout - pos.totalAmountSol;
        } else if (pos.side === "No") {
          const expectedPayout =
            market.noPoolSol > 0
              ? (market.totalPoolSol / market.noPoolSol) * pos.noAmountSol * 0.97
              : 0;
          pnl = expectedPayout - pos.totalAmountSol;
        }
      }

      const impliedOdds =
        pos.side === "Yes"
          ? market.yesPercent
          : pos.side === "No"
            ? market.noPercent
            : 50;

      const entry: AgentMarketPosition = {
        marketPda: market.publicKey,
        marketId: market.marketId,
        question: market.question,
        side: pos.side,
        amountSol: pos.totalAmountSol,
        status: market.status,
        pnlSol: round4(pnl),
        odds: round2(impliedOdds),
        isWinner,
        type: "boolean",
      };

      if (isResolved) resolvedMarkets.push(entry);
      else activeMarkets.push(entry);
    }

    // Process race positions
    for (const rpos of rPositions) {
      const race = raceById.get(rpos.marketId);
      if (!race) continue;

      totalWagered += rpos.totalAmountSol;

      const isResolved = race.statusCode === 2 || race.statusCode === 3;

      for (const bet of rpos.bets) {
        const outcome = race.outcomes[bet.outcomeIndex];
        if (!outcome) continue;

        let pnl = 0;
        let isWinner: boolean | null = null;

        if (isResolved && race.winnerIndex !== null) {
          resolvedPositions++;
          if (bet.outcomeIndex === race.winnerIndex) {
            const winPool = outcome.pool;
            if (winPool > 0) {
              const grossPayout = (race.totalPoolSol / winPool) * bet.amountSol;
              const netPayout = grossPayout * 0.97;
              pnl = netPayout - bet.amountSol;
              totalWon += netPayout;
            }
            wins++;
            isWinner = true;
          } else {
            pnl = -bet.amountSol;
            totalLost += bet.amountSol;
            losses++;
            isWinner = false;
          }
        } else {
          openPositions++;
          // Estimate based on current odds
          if (outcome.pool > 0) {
            const expectedPayout =
              (race.totalPoolSol / outcome.pool) * bet.amountSol * 0.97;
            pnl = expectedPayout - bet.amountSol;
          }
        }

        const entry: AgentMarketPosition = {
          marketPda: race.publicKey,
          marketId: race.marketId,
          question: race.question,
          side: outcome.label,
          amountSol: bet.amountSol,
          status: race.status,
          pnlSol: round4(pnl),
          odds: outcome.percent,
          isWinner,
          type: "race",
        };

        if (isResolved) resolvedMarkets.push(entry);
        else activeMarkets.push(entry);
      }
    }

    // Compute streak from resolved markets (most recent first)
    const resolved = [...resolvedMarkets].sort(
      (a, b) => Number(b.marketId) - Number(a.marketId)
    );
    let streak = 0;
    if (resolved.length > 0) {
      const firstResult = resolved[0].isWinner;
      for (const r of resolved) {
        if (r.isWinner === firstResult) {
          streak += firstResult ? 1 : -1;
        } else break;
      }
    }

    const accuracy =
      resolvedPositions > 0 ? round2((wins / resolvedPositions) * 100) : 0;

    agentStats.push({
      wallet,
      name,
      totalWagered: round4(totalWagered),
      totalWon: round4(totalWon),
      totalLost: round4(totalLost),
      pnl: round4(totalWon - totalLost - totalWagered + totalWon), // simplified: won - wagered for resolved
      openPositions,
      resolvedPositions,
      accuracy,
      wins,
      losses,
      streak,
      activeMarkets,
      resolvedMarkets,
    });
  }

  // Fix P&L calculation: pnl = totalWon - totalWagered (for resolved only)
  for (const agent of agentStats) {
    const resolvedWager = agent.resolvedMarkets.reduce(
      (sum, m) => sum + m.amountSol,
      0
    );
    agent.pnl = round4(agent.totalWon - resolvedWager);
  }

  // Sort leaderboard by P&L descending
  agentStats.sort((a, b) => b.pnl - a.pnl);

  // Build per-market arena views
  const marketViews = buildMarketViews(
    markets,
    positions,
    raceMarkets,
    racePositions,
    profiles
  );

  const active = marketViews.filter(
    (m) => m.status === "Active" || m.status === "Closed"
  );
  const resolved = marketViews.filter(
    (m) => m.status === "Resolved" || m.status === "Voided"
  );

  const totalVolume = agentStats.reduce((s, a) => s + a.totalWagered, 0);

  return {
    leaderboard: agentStats,
    activeMarkets: active,
    resolvedMarkets: resolved,
    totalAgents: agentStats.length,
    totalMarkets: markets.length + raceMarkets.length,
    totalVolume: round4(totalVolume),
    fetchedAt: data.fetchedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-market views
// ─────────────────────────────────────────────────────────────────────────────

function buildMarketViews(
  markets: Market[],
  positions: UserPosition[],
  raceMarkets: RaceMarket[],
  racePositions: RacePosition[],
  profiles: Map<string, CreatorProfile>
): MarketArenaView[] {
  const views: MarketArenaView[] = [];

  // Boolean markets
  const posByMarket = new Map<string, UserPosition[]>();
  for (const p of positions) {
    const arr = posByMarket.get(p.marketId) || [];
    arr.push(p);
    posByMarket.set(p.marketId, arr);
  }

  for (const m of markets) {
    const mPositions = posByMarket.get(m.marketId) || [];
    if (mPositions.length === 0) continue; // skip markets with no bets

    const agents = mPositions.map((p) => {
      let pnl = 0;
      let isWinner: boolean | null = null;

      if (m.statusCode === 2 && m.winningOutcome) {
        const won =
          (m.winningOutcome === "Yes" && p.side === "Yes") ||
          (m.winningOutcome === "No" && p.side === "No");

        if (won) {
          const winPool =
            m.winningOutcome === "Yes" ? m.yesPoolSol : m.noPoolSol;
          const bet =
            m.winningOutcome === "Yes" ? p.yesAmountSol : p.noAmountSol;
          if (winPool > 0) {
            pnl = round4((m.totalPoolSol / winPool) * bet * 0.97 - p.totalAmountSol);
          }
          isWinner = true;
        } else {
          pnl = -p.totalAmountSol;
          isWinner = false;
        }
      }

      return {
        wallet: p.user,
        name: agentName(p.user, profiles),
        side: p.side,
        amountSol: p.totalAmountSol,
        pnlSol: round4(pnl),
        isWinner,
      };
    });

    // Sort agents by amount wagered
    agents.sort((a, b) => b.amountSol - a.amountSol);

    views.push({
      pda: m.publicKey,
      marketId: m.marketId,
      question: m.question,
      status: m.status,
      totalPoolSol: m.totalPoolSol,
      type: "boolean",
      agents,
      yesPercent: m.yesPercent,
      noPercent: m.noPercent,
      winningOutcome: m.winningOutcome,
    });
  }

  // Race markets
  const racePosByMarket = new Map<string, RacePosition[]>();
  for (const rp of racePositions) {
    const arr = racePosByMarket.get(rp.marketId) || [];
    arr.push(rp);
    racePosByMarket.set(rp.marketId, arr);
  }

  for (const r of raceMarkets) {
    const rPositions = racePosByMarket.get(r.marketId) || [];
    if (rPositions.length === 0) continue;

    const agents: MarketArenaView["agents"] = [];

    for (const rp of rPositions) {
      for (const bet of rp.bets) {
        const outcome = r.outcomes[bet.outcomeIndex];
        if (!outcome) continue;

        let pnl = 0;
        let isWinner: boolean | null = null;

        if (r.statusCode === 2 && r.winnerIndex !== null) {
          if (bet.outcomeIndex === r.winnerIndex) {
            if (outcome.pool > 0) {
              pnl = round4(
                (r.totalPoolSol / outcome.pool) * bet.amountSol * 0.97 -
                  bet.amountSol
              );
            }
            isWinner = true;
          } else {
            pnl = -bet.amountSol;
            isWinner = false;
          }
        }

        agents.push({
          wallet: rp.user,
          name: agentName(rp.user, profiles),
          side: outcome.label,
          amountSol: bet.amountSol,
          pnlSol: round4(pnl),
          isWinner,
        });
      }
    }

    agents.sort((a, b) => b.amountSol - a.amountSol);

    views.push({
      pda: r.publicKey,
      marketId: r.marketId,
      question: r.question,
      status: r.status,
      totalPoolSol: r.totalPoolSol,
      type: "race",
      agents,
      outcomes: r.outcomes,
      winnerIndex: r.winnerIndex,
    });
  }

  // Sort by total pool descending
  views.sort((a, b) => b.totalPoolSol - a.totalPoolSol);

  return views;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
