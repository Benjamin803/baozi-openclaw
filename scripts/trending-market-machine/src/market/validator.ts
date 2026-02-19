// Validate market questions against Baozi Parimutuel Rules v7.0
import { CONFIG, type MarketQuestion, type ValidationResult } from "../config.ts";

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

// v7.0 Blocked terms — auto-reject any question containing these
const BLOCKED_TERMS = [
  "price above", "price below", "trading volume", "market cap",
  "gains most", "total volume", "total burned", "average over",
  "this week", "this month", "floor price", "ath", "all-time high",
  "tvl", "total value locked",
];

// Local pre-validation (catch issues before hitting the API)
export function localValidate(market: MarketQuestion): ValidationResult {
  const violations: ValidationResult["violations"] = [];
  const now = Date.now();

  // v7.0 CRITICAL: Type B markets are BANNED
  if (market.timingType === "B") {
    violations.push({
      severity: "critical",
      rule: "TYPE_B_BANNED_V7",
      message: "Measurement-period (Type B) markets are banned under Parimutuel Rules v7.0. Only Type A (event-based) markets are allowed.",
    });
  }

  // v7.0: Check for blocked terms
  const questionLower = market.question.toLowerCase();
  for (const term of BLOCKED_TERMS) {
    if (questionLower.includes(term)) {
      violations.push({
        severity: "critical",
        rule: "BLOCKED_TERM_V7",
        message: `Question contains blocked term "${term}". Price/volume/metric markets are banned under v7.0.`,
      });
      break; // One blocked term is enough
    }
  }

  // v7.0 Core test: "Can a bettor observe or calculate the likely outcome while betting is still open?"
  // Flag price-adjacent patterns even if not exact blocked terms
  if (questionLower.match(/\b(price|volume|tvl|mcap|rank|cap|floor)\b/)) {
    violations.push({
      severity: "critical",
      rule: "PRICE_ADJACENT_V7",
      message: "Market appears price-adjacent. v7.0 requires genuinely unknowable outcomes.",
    });
  }

  // Check minimum time until close (48h)
  const hoursUntilClose = (market.closingTime.getTime() - now) / HOURS;
  if (hoursUntilClose < CONFIG.MIN_HOURS_UNTIL_CLOSE) {
    violations.push({
      severity: "critical",
      rule: "MIN_CLOSE_TIME",
      message: `Closing time must be at least ${CONFIG.MIN_HOURS_UNTIL_CLOSE}h from now. Got ${hoursUntilClose.toFixed(1)}h.`,
    });
  }

  // Check maximum time until close (14 days)
  const daysUntilClose = (market.closingTime.getTime() - now) / DAYS;
  if (daysUntilClose > CONFIG.MAX_DAYS_UNTIL_CLOSE) {
    violations.push({
      severity: "warning",
      rule: "MAX_CLOSE_TIME",
      message: `Markets closing >14 days out have poor UX. Got ${daysUntilClose.toFixed(1)} days.`,
    });
  }

  // Resolution time must be after closing time
  if (market.resolutionTime.getTime() <= market.closingTime.getTime()) {
    violations.push({
      severity: "critical",
      rule: "RESOLUTION_AFTER_CLOSE",
      message: "Resolution time must be after closing time.",
    });
  }

  // Type A: closing must be 24h before event
  if (market.timingType === "A" && market.eventTime) {
    const gapHours = (market.eventTime.getTime() - market.closingTime.getTime()) / HOURS;
    if (gapHours < 24) {
      violations.push({
        severity: "critical",
        rule: "TYPE_A_24H_GAP",
        message: `Type A markets must close 24h+ before the event. Gap: ${gapHours.toFixed(1)}h.`,
      });
    }
  }

  // Question quality checks
  if (market.question.length < 20) {
    violations.push({
      severity: "critical",
      rule: "QUESTION_TOO_SHORT",
      message: "Question must be at least 20 characters.",
    });
  }

  if (market.question.length > 200) {
    violations.push({
      severity: "warning",
      rule: "QUESTION_TOO_LONG",
      message: "Question should be under 200 characters for readability.",
    });
  }

  // No subjective outcomes
  const subjective = market.question.toLowerCase().match(/\b(best|worst|exciting|interesting|good|bad|amazing|terrible)\b/);
  if (subjective) {
    violations.push({
      severity: "critical",
      rule: "SUBJECTIVE_OUTCOME",
      message: `Question contains subjective term "${subjective[1]}". Outcomes must be objectively verifiable.`,
    });
  }

  // Must have data source
  if (!market.dataSource || market.dataSource.length < 5) {
    violations.push({
      severity: "critical",
      rule: "MISSING_DATA_SOURCE",
      message: "Must specify a verifiable data source for resolution.",
    });
  }

  // Must end with question mark
  if (!market.question.trim().endsWith("?")) {
    violations.push({
      severity: "warning",
      rule: "MISSING_QUESTION_MARK",
      message: "Market question should end with a question mark.",
    });
  }

  return {
    approved: violations.filter((v) => v.severity === "critical").length === 0,
    violations,
  };
}

// Remote validation via Baozi API
export async function remoteValidate(market: MarketQuestion): Promise<ValidationResult> {
  try {
    // Build payload matching Baozi's expected format (v7.0: Type A only)
    const payload: Record<string, unknown> = {
      question: market.question,
      closingTime: market.closingTime.toISOString(),
      marketType: "typeA",
      description: market.description,
      dataSource: market.dataSource,
      backupSource: market.backupSource || `${market.dataSource} (cross-referenced)`,
      category: market.category,
      eventTime: market.eventTime.toISOString(),
    };

    const resp = await fetch(CONFIG.BAOZI_VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      return {
        approved: false,
        violations: [{ severity: "critical", rule: "API_ERROR", message: `Validation API returned ${resp.status}` }],
      };
    }

    return await resp.json();
  } catch (err) {
    return {
      approved: false,
      violations: [{ severity: "critical", rule: "API_UNREACHABLE", message: (err as Error).message }],
    };
  }
}

// Full validation pipeline
export async function validateMarket(market: MarketQuestion): Promise<ValidationResult> {
  // Local checks first (fast)
  const local = localValidate(market);
  if (!local.approved) return local;

  // Remote validation (authoritative)
  const remote = await remoteValidate(market);

  // Merge results
  return {
    approved: local.approved && remote.approved,
    violations: [...local.violations, ...remote.violations],
  };
}
