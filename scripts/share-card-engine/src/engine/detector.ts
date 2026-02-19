// Event detector — identifies notable market activity worth sharing
// Detects: new markets, large bets, closing soon, resolved, odds shifts

import type { MarketSnapshot, RaceSnapshot, MarketState } from "../api/markets.js";

// ─────────────────────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────────────────────

export type EventType =
  | "new_market"       // Created within last hour
  | "large_bet"        // Pool significantly larger than average
  | "closing_soon"     // Closes within 24 hours
  | "just_resolved"    // Recently resolved
  | "odds_shift"       // YES/NO swung more than 10% since last check
  | "race_leader_flip" // Different outcome leading in a race market
  | "first_bet"        // Market just got its first bet
  | "milestone_pool"   // Pool crossed a round SOL threshold (1, 5, 10...)
  | "close_contest"    // YES and NO within 5% of each other (tight race)
  ;

export interface MarketEvent {
  type: EventType;
  priority: number; // 1-5 (5 = most important)
  market: MarketSnapshot | RaceSnapshot;
  headline: string;
  caption: string;
  details: Record<string, string | number>;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection thresholds
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  NEW_MARKET_HOURS: 1,
  CLOSING_SOON_HOURS: 24,
  LARGE_BET_SOL: 1.0,
  ODDS_SHIFT_PCT: 10,
  CLOSE_CONTEST_PCT: 5,
  MILESTONE_THRESHOLDS: [1, 5, 10, 25, 50, 100],
};

// ─────────────────────────────────────────────────────────────────────────────
// Proverbs for share card captions (from baozi.bet aesthetic)
// ─────────────────────────────────────────────────────────────────────────────

const PROVERBS = {
  new_market: [
    "新菜上桌 — new dish on the table",
    "万事开头难 — every beginning is hard",
    "千里之行始于足下 — a journey begins with a single step",
  ],
  closing_soon: [
    "时不我待 — time waits for no one",
    "机不可失 — opportunity knocks but once",
    "临门一脚 — the last kick before the goal",
  ],
  just_resolved: [
    "尘埃落定 — the dust has settled",
    "真金不怕火炼 — true gold fears no fire",
    "水落石出 — when the water recedes the stones appear",
  ],
  large_bet: [
    "重拳出击 — a heavy fist strikes",
    "一掷千金 — a throw worth a thousand gold",
    "大手笔 — a bold stroke of the brush",
  ],
  odds_shift: [
    "风向变了 — the wind has changed",
    "人心齐泰山移 — united hearts can move mountains",
    "此一时彼一时 — times have changed",
  ],
  close_contest: [
    "难分伯仲 — hard to tell who's first",
    "棋逢对手 — meeting one's match",
    "势均力敌 — evenly matched forces",
  ],
  default: [
    "火候到了，自然熟 — when the heat is right, it cooks itself",
    "让子弹飞一会儿 — let the bullet fly for a while",
  ],
};

function pickProverb(type: string): string {
  const pool = (PROVERBS as Record<string, string[]>)[type] || PROVERBS.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Boolean market detection
// ─────────────────────────────────────────────────────────────────────────────

function detectBooleanEvents(
  markets: MarketSnapshot[],
  prevState?: MarketSnapshot[]
): MarketEvent[] {
  const events: MarketEvent[] = [];
  const now = new Date();
  const prevMap = new Map<string, MarketSnapshot>();
  if (prevState) for (const m of prevState) prevMap.set(m.marketId, m);

  for (const m of markets) {
    const hoursUntilClose = (m.closingTime.getTime() - now.getTime()) / 3600000;
    const marketAge = (now.getTime() - m.closingTime.getTime() + hoursUntilClose * 3600000) / 3600000;

    // New market (active + created recently via closingTime proximity heuristic)
    if (m.statusCode === 0 && m.totalPoolSol === 0 && !m.hasBets) {
      events.push({
        type: "new_market", priority: 3, market: m, timestamp: now,
        headline: `🆕 New market: "${truncate(m.question, 60)}"`,
        caption: `${pickProverb("new_market")}\n\n📊 ${m.question}\n⏰ Closes: ${formatDate(m.closingTime)}\n🏷️ ${m.layer}\n\n🎲 Be the first to bet →`,
        details: { closingTime: formatDate(m.closingTime), layer: m.layer },
      });
    }

    // First bet
    if (m.hasBets && m.totalPoolSol > 0 && m.totalPoolSol < 0.05) {
      const prev = prevMap.get(m.marketId);
      if (prev && prev.totalPoolSol === 0) {
        events.push({
          type: "first_bet", priority: 3, market: m, timestamp: now,
          headline: `🎯 First bet on "${truncate(m.question, 50)}"`,
          caption: `${pickProverb("new_market")}\n\n📊 ${m.question}\n💰 Pool: ${m.totalPoolSol.toFixed(2)} SOL\n📈 YES ${m.yesPercent}% / NO ${m.noPercent}%`,
          details: { pool: m.totalPoolSol, yesPercent: m.yesPercent },
        });
      }
    }

    // Closing soon
    if (m.statusCode === 0 && hoursUntilClose > 0 && hoursUntilClose < THRESHOLDS.CLOSING_SOON_HOURS) {
      events.push({
        type: "closing_soon", priority: 4, market: m, timestamp: now,
        headline: `⏰ Closing in ${Math.round(hoursUntilClose)}h: "${truncate(m.question, 50)}"`,
        caption: `${pickProverb("closing_soon")}\n\n📊 ${m.question}\n💰 Pool: ${m.totalPoolSol.toFixed(2)} SOL\n📈 YES ${m.yesPercent}% / NO ${m.noPercent}%\n⏰ ${Math.round(hoursUntilClose)}h remaining\n\n🎲 Last chance to bet →`,
        details: { hoursLeft: Math.round(hoursUntilClose), pool: m.totalPoolSol },
      });
    }

    // Just resolved
    if (m.statusCode === 2 && m.winningOutcome) {
      const prev = prevMap.get(m.marketId);
      if (!prev || prev.statusCode !== 2) {
        events.push({
          type: "just_resolved", priority: 5, market: m, timestamp: now,
          headline: `✅ Resolved: "${truncate(m.question, 50)}" → ${m.winningOutcome}`,
          caption: `${pickProverb("just_resolved")}\n\n📊 ${m.question}\n🏆 Winner: ${m.winningOutcome}\n💰 Pool: ${m.totalPoolSol.toFixed(2)} SOL\n📈 Final odds: YES ${m.yesPercent}% / NO ${m.noPercent}%`,
          details: { winner: m.winningOutcome, pool: m.totalPoolSol },
        });
      }
    }

    // Large bet / milestone pool
    for (const threshold of THRESHOLDS.MILESTONE_THRESHOLDS) {
      if (m.totalPoolSol >= threshold) {
        const prev = prevMap.get(m.marketId);
        if (prev && prev.totalPoolSol < threshold) {
          events.push({
            type: "milestone_pool", priority: 4, market: m, timestamp: now,
            headline: `🎉 Pool hit ${threshold} SOL: "${truncate(m.question, 50)}"`,
            caption: `${pickProverb("large_bet")}\n\n📊 ${m.question}\n💰 Pool: ${m.totalPoolSol.toFixed(2)} SOL (milestone: ${threshold})\n📈 YES ${m.yesPercent}% / NO ${m.noPercent}%`,
            details: { pool: m.totalPoolSol, milestone: threshold },
          });
        }
        break;
      }
    }

    // Odds shift
    if (m.statusCode === 0) {
      const prev = prevMap.get(m.marketId);
      if (prev && prev.statusCode === 0) {
        const shift = Math.abs(m.yesPercent - prev.yesPercent);
        if (shift >= THRESHOLDS.ODDS_SHIFT_PCT) {
          const direction = m.yesPercent > prev.yesPercent ? "YES ↑" : "NO ↑";
          events.push({
            type: "odds_shift", priority: 4, market: m, timestamp: now,
            headline: `📊 Odds shifted ${shift.toFixed(1)}% (${direction}): "${truncate(m.question, 45)}"`,
            caption: `${pickProverb("odds_shift")}\n\n📊 ${m.question}\n📈 ${prev.yesPercent}% → ${m.yesPercent}% YES (${shift.toFixed(1)}% swing)\n💰 Pool: ${m.totalPoolSol.toFixed(2)} SOL\n\n🎲 Odds are moving — bet now →`,
            details: { shift, prevYes: prev.yesPercent, newYes: m.yesPercent },
          });
        }
      }
    }

    // Close contest
    if (m.statusCode === 0 && m.hasBets) {
      const spread = Math.abs(m.yesPercent - m.noPercent);
      if (spread < THRESHOLDS.CLOSE_CONTEST_PCT * 2) {
        events.push({
          type: "close_contest", priority: 3, market: m, timestamp: now,
          headline: `⚔️ Tight race (${spread.toFixed(1)}% spread): "${truncate(m.question, 45)}"`,
          caption: `${pickProverb("close_contest")}\n\n📊 ${m.question}\n📈 YES ${m.yesPercent}% / NO ${m.noPercent}% — just ${spread.toFixed(1)}% apart!\n💰 Pool: ${m.totalPoolSol.toFixed(2)} SOL\n\n🎲 Your bet could tip the scales →`,
          details: { spread, pool: m.totalPoolSol },
        });
      }
    }
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Race market detection
// ─────────────────────────────────────────────────────────────────────────────

function detectRaceEvents(
  races: RaceSnapshot[],
  prevState?: RaceSnapshot[]
): MarketEvent[] {
  const events: MarketEvent[] = [];
  const now = new Date();
  const prevMap = new Map<string, RaceSnapshot>();
  if (prevState) for (const r of prevState) prevMap.set(r.marketId, r);

  for (const r of races) {
    const hoursUntilClose = (r.closingTime.getTime() - now.getTime()) / 3600000;

    // Closing soon
    if (r.statusCode === 0 && hoursUntilClose > 0 && hoursUntilClose < THRESHOLDS.CLOSING_SOON_HOURS) {
      const leader = r.outcomes.reduce((a, b) => a.poolSol > b.poolSol ? a : b);
      events.push({
        type: "closing_soon", priority: 4, market: r, timestamp: now,
        headline: `⏰ Race closing in ${Math.round(hoursUntilClose)}h: "${truncate(r.question, 45)}"`,
        caption: `${pickProverb("closing_soon")}\n\n🏁 ${r.question}\n🥇 Leading: ${leader.label} (${leader.percent}%)\n💰 Pool: ${r.totalPoolSol.toFixed(2)} SOL\n⏰ ${Math.round(hoursUntilClose)}h remaining`,
        details: { leader: leader.label, hoursLeft: Math.round(hoursUntilClose) },
      });
    }

    // Just resolved
    if (r.statusCode === 2 && r.winnerIndex !== null) {
      const prev = prevMap.get(r.marketId);
      if (!prev || prev.statusCode !== 2) {
        const winner = r.outcomes[r.winnerIndex];
        events.push({
          type: "just_resolved", priority: 5, market: r, timestamp: now,
          headline: `🏆 Race resolved: "${truncate(r.question, 45)}" → ${winner?.label}`,
          caption: `${pickProverb("just_resolved")}\n\n🏁 ${r.question}\n🏆 Winner: ${winner?.label} (${winner?.percent}%)\n💰 Pool: ${r.totalPoolSol.toFixed(2)} SOL\n${r.outcomes.map((o, i) => `${i === r.winnerIndex ? "★" : " "} ${o.label}: ${o.percent}%`).join("\n")}`,
          details: { winner: winner?.label || "N/A", pool: r.totalPoolSol },
        });
      }
    }

    // Leader flip
    if (r.statusCode === 0 && r.outcomes.length > 1) {
      const prev = prevMap.get(r.marketId);
      if (prev && prev.outcomes.length > 1) {
        const currentLeader = r.outcomes.reduce((a, b) => a.poolSol > b.poolSol ? a : b);
        const prevLeader = prev.outcomes.reduce((a, b) => a.poolSol > b.poolSol ? a : b);
        if (currentLeader.label !== prevLeader.label) {
          events.push({
            type: "race_leader_flip", priority: 5, market: r, timestamp: now,
            headline: `🔄 New leader in "${truncate(r.question, 45)}": ${currentLeader.label}`,
            caption: `${pickProverb("odds_shift")}\n\n🏁 ${r.question}\n🔄 ${prevLeader.label} → ${currentLeader.label} takes the lead!\n💰 Pool: ${r.totalPoolSol.toFixed(2)} SOL\n${r.outcomes.map(o => `  ${o.label}: ${o.percent}%`).join("\n")}`,
            details: { prevLeader: prevLeader.label, newLeader: currentLeader.label },
          });
        }
      }
    }
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function detectEvents(
  state: MarketState,
  prevState?: MarketState
): MarketEvent[] {
  const boolEvents = detectBooleanEvents(
    state.booleans,
    prevState?.booleans
  );
  const raceEvents = detectRaceEvents(
    state.races,
    prevState?.races
  );

  const all = [...boolEvents, ...raceEvents];
  // Sort by priority (highest first), then by pool size
  all.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const poolA = "totalPoolSol" in a.market ? a.market.totalPoolSol : 0;
    const poolB = "totalPoolSol" in b.market ? b.market.totalPoolSol : 0;
    return poolB - poolA;
  });

  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
