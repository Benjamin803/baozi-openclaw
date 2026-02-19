// Reputation Engine — Confidence-weighted scoring with streak bonuses

import { CONFIG, type Caller, type Call } from "../config.ts";
import { getCallerCalls } from "./db.ts";

// Calculate confidence-weighted reputation score
// Uses Bayesian updating: combines observed hit rate with prior
// More calls = more confidence in the score approaching true hit rate
export function calculateReputation(caller: Caller): {
  score: number; // 0-100
  tier: string;
  badge: string;
  details: {
    rawHitRate: number;
    bayesianScore: number;
    streakBonus: number;
    volumeBonus: number;
    profitFactor: number;
  };
} {
  const { totalCalls, correctCalls, currentStreak, totalWon, totalLost, totalWagered } = caller;

  // Raw hit rate
  const rawHitRate = totalCalls > 0 ? correctCalls / totalCalls : 0;

  // Bayesian score: pulls toward 50% with few observations
  // β(α + wins, β + losses) where α=β=prior/2
  const prior = CONFIG.MIN_CALLS_FOR_RANKING;
  const alpha = correctCalls + prior / 2;
  const beta = (totalCalls - correctCalls) + prior / 2;
  const bayesianScore = alpha / (alpha + beta);

  // Streak bonus: consecutive wins/losses amplify score
  let streakBonus = 0;
  if (currentStreak > 0) {
    streakBonus = Math.min(currentStreak * 0.02, 0.1); // Max +10%
  } else if (currentStreak < 0) {
    streakBonus = Math.max(currentStreak * 0.02, -0.1); // Max -10%
  }

  // Volume bonus: more calls = slight bonus for reliability
  const volumeBonus = Math.min(totalCalls * 0.005, 0.05); // Max +5%

  // Profit factor: how profitable are the calls
  const profitFactor = totalWagered > 0
    ? (totalWon - totalLost) / totalWagered
    : 0;
  const profitBonus = Math.max(Math.min(profitFactor * 0.1, 0.1), -0.1);

  // Combined score (0-1)
  const combined = Math.max(0, Math.min(1,
    bayesianScore + streakBonus + volumeBonus + profitBonus
  ));

  // Scale to 0-100
  const score = Math.round(combined * 100);

  // Determine tier and badge
  const { tier, badge } = getTier(score, totalCalls);

  return {
    score,
    tier,
    badge,
    details: {
      rawHitRate,
      bayesianScore,
      streakBonus,
      volumeBonus,
      profitFactor,
    },
  };
}

function getTier(score: number, totalCalls: number): { tier: string; badge: string } {
  if (totalCalls < CONFIG.MIN_CALLS_FOR_RANKING) {
    return { tier: "Unranked", badge: "?" };
  }

  if (score >= 80) return { tier: "Oracle", badge: "***" };
  if (score >= 70) return { tier: "Prophet", badge: "**" };
  if (score >= 60) return { tier: "Analyst", badge: "*" };
  if (score >= 50) return { tier: "Speculator", badge: "~" };
  if (score >= 40) return { tier: "Gambler", badge: "." };
  return { tier: "Rekt", badge: "x" };
}

// Format caller reputation as a display string
export function formatReputation(caller: Caller): string {
  const rep = calculateReputation(caller);
  const pnl = caller.totalWon - caller.totalLost;
  const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);

  const streakStr = caller.currentStreak > 0
    ? `W${caller.currentStreak}`
    : caller.currentStreak < 0
      ? `L${Math.abs(caller.currentStreak)}`
      : "-";

  return [
    `[${rep.badge}] ${caller.name} — ${rep.tier} (${rep.score}/100)`,
    `   Calls: ${caller.totalCalls} | Hit Rate: ${(caller.hitRate * 100).toFixed(1)}%`,
    `   Streak: ${streakStr} (Best: W${caller.bestStreak}, Worst: L${Math.abs(caller.worstStreak)})`,
    `   Wagered: ${caller.totalWagered.toFixed(2)} SOL | P&L: ${pnlStr} SOL`,
  ].join("\n");
}

// Calculate time-weighted accuracy (recent calls matter more)
export function timeWeightedAccuracy(callerId: string): number {
  const calls = getCallerCalls(callerId).filter(c => c.resolved && c.outcome !== "VOID");
  if (calls.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  // Sort oldest first
  calls.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (let i = 0; i < calls.length; i++) {
    const weight = Math.pow(CONFIG.CONFIDENCE_DECAY_FACTOR, calls.length - 1 - i);
    weightedSum += (calls[i].outcome === "WIN" ? 1 : 0) * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// Generate leaderboard
export function generateLeaderboard(callers: Caller[]): string {
  const ranked = callers
    .filter(c => c.totalCalls >= CONFIG.MIN_CALLS_FOR_RANKING)
    .map(c => ({ caller: c, rep: calculateReputation(c) }))
    .sort((a, b) => b.rep.score - a.rep.score);

  if (ranked.length === 0) {
    return "No ranked callers yet (minimum 3 calls required)";
  }

  const lines = [
    "=== CALLS TRACKER LEADERBOARD ===",
    "",
    `${"#".padEnd(4)} ${"Caller".padEnd(20)} ${"Score".padEnd(8)} ${"Tier".padEnd(12)} ${"Calls".padEnd(7)} ${"Hit%".padEnd(8)} ${"P&L".padEnd(10)} Streak`,
    "─".repeat(85),
  ];

  for (let i = 0; i < ranked.length; i++) {
    const { caller: c, rep } = ranked[i];
    const pnl = c.totalWon - c.totalLost;
    const pnlStr = pnl >= 0 ? `+${pnl.toFixed(1)}` : pnl.toFixed(1);
    const streak = c.currentStreak > 0 ? `W${c.currentStreak}` : c.currentStreak < 0 ? `L${Math.abs(c.currentStreak)}` : "-";

    lines.push(
      `${String(i + 1).padEnd(4)} ${c.name.padEnd(20)} ${String(rep.score).padEnd(8)} ${rep.tier.padEnd(12)} ${String(c.totalCalls).padEnd(7)} ${(c.hitRate * 100).toFixed(1).padEnd(8)} ${pnlStr.padEnd(10)} ${streak}`
    );
  }

  lines.push("");
  lines.push(`Total: ${ranked.length} ranked caller(s)`);

  return lines.join("\n");
}
