// Market Validator — Validate predictions against Baozi pari-mutuel rules + API

import { CONFIG, type Call, type ValidationResult } from "../config.ts";

// Local validation: check timing rules before hitting API
function validateTiming(call: Call): ValidationResult {
  const violations: ValidationResult["violations"] = [];
  const now = new Date();

  // Closing time must be in the future
  if (call.closingTime <= now) {
    violations.push({
      severity: "critical",
      rule: "closing_time_future",
      message: `Closing time ${call.closingTime.toISOString()} is in the past`,
    });
  }

  // Minimum time until close (48h recommended)
  const hoursUntilClose = (call.closingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilClose < 24) {
    violations.push({
      severity: "critical",
      rule: "min_close_buffer",
      message: `Only ${hoursUntilClose.toFixed(1)}h until close — minimum 24h required`,
    });
  }

  // Max days until close
  const daysUntilClose = hoursUntilClose / 24;
  if (daysUntilClose > CONFIG.MAX_DAYS_UNTIL_CLOSE) {
    violations.push({
      severity: "warning",
      rule: "max_close_days",
      message: `${daysUntilClose.toFixed(0)} days until close exceeds recommended ${CONFIG.MAX_DAYS_UNTIL_CLOSE}d`,
    });
  }

  if (call.marketType === "typeA") {
    // Type A: close_time <= event_time - 24h
    if (call.eventTime) {
      const hoursBefore = (call.eventTime.getTime() - call.closingTime.getTime()) / (1000 * 60 * 60);
      if (hoursBefore < CONFIG.MIN_HOURS_BEFORE_EVENT) {
        violations.push({
          severity: "critical",
          rule: "type_a_buffer",
          message: `Close is only ${hoursBefore.toFixed(1)}h before event — need >= ${CONFIG.MIN_HOURS_BEFORE_EVENT}h`,
        });
      }
    }
  } else if (call.marketType === "typeB") {
    // Type B: close_time < measurement_start
    if (call.measurementStart && call.closingTime >= call.measurementStart) {
      violations.push({
        severity: "critical",
        rule: "type_b_close_before_measurement",
        message: `Close time must be before measurement start`,
      });
    }
    if (call.measurementStart && call.measurementEnd) {
      const periodDays = (call.measurementEnd.getTime() - call.measurementStart.getTime()) / (1000 * 60 * 60 * 24);
      if (periodDays > 30) {
        violations.push({
          severity: "warning",
          rule: "type_b_period_length",
          message: `Measurement period is ${periodDays.toFixed(0)} days — 7-14 days optimal`,
        });
      }
    }
  }

  const hasErrors = violations.some(v => v.severity === "critical");
  return { approved: !hasErrors, violations };
}

// Validate question text quality
function validateQuestion(call: Call): ValidationResult {
  const violations: ValidationResult["violations"] = [];

  // Must end with question mark
  if (!call.question.endsWith("?")) {
    violations.push({
      severity: "critical",
      rule: "question_format",
      message: "Question must end with a question mark",
    });
  }

  // Must be objective
  const subjectiveWords = /\b(should|might|could|would|maybe|possibly|I think)\b/i;
  if (subjectiveWords.test(call.question)) {
    violations.push({
      severity: "warning",
      rule: "objective_question",
      message: "Question contains subjective language — must be objectively resolvable",
    });
  }

  // Must have data source
  if (!call.dataSource) {
    violations.push({
      severity: "critical",
      rule: "data_source",
      message: "Must specify a data source for resolution",
    });
  }

  // Reasonable question length
  if (call.question.length < 20) {
    violations.push({
      severity: "warning",
      rule: "question_length",
      message: "Question seems too short — add more specifics",
    });
  }

  if (call.question.length > 200) {
    violations.push({
      severity: "warning",
      rule: "question_length",
      message: "Question is very long — consider making it more concise",
    });
  }

  const hasErrors = violations.some(v => v.severity === "critical");
  return { approved: !hasErrors, violations };
}

// Remote validation via Baozi API
async function validateRemote(call: Call): Promise<ValidationResult> {
  const body: Record<string, unknown> = {
    question: call.question,
    closingTime: call.closingTime.toISOString(),
    eventTime: call.eventTime?.toISOString(),
    marketType: call.marketType,
    category: call.category,
    dataSource: call.dataSource,
    backupSource: call.backupSource || `Manual verification via ${call.dataSource}`,
  };

  if (call.marketType === "typeB") {
    body.measurementStart = call.measurementStart?.toISOString();
    body.measurementEnd = call.measurementEnd?.toISOString();
  }

  try {
    const resp = await fetch(CONFIG.BAOZI_VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        approved: false,
        violations: [{
          severity: "critical",
          rule: "api_error",
          message: `Baozi API returned ${resp.status}: ${text.slice(0, 200)}`,
        }],
      };
    }

    const data = await resp.json() as { approved: boolean; violations?: Array<{ severity: string; rule: string; message: string }> };
    return {
      approved: data.approved,
      violations: (data.violations || []).map(v => ({
        severity: (v.severity || "warning") as "critical" | "warning" | "info",
        rule: v.rule || "api",
        message: v.message || "Unknown violation",
      })),
    };
  } catch (err) {
    return {
      approved: false,
      violations: [{
        severity: "critical",
        rule: "api_unreachable",
        message: `Cannot reach Baozi API: ${(err as Error).message}`,
      }],
    };
  }
}

// Full validation pipeline: local + remote
export async function validateCall(call: Call): Promise<ValidationResult> {
  // Step 1: Local timing validation
  const timingResult = validateTiming(call);
  if (!timingResult.approved) {
    return timingResult;
  }

  // Step 2: Local question validation
  const questionResult = validateQuestion(call);

  // Step 3: Remote Baozi API validation
  const remoteResult = await validateRemote(call);

  // Merge all violations
  const allViolations = [
    ...timingResult.violations,
    ...questionResult.violations,
    ...remoteResult.violations,
  ];

  const hasErrors = allViolations.some(v => v.severity === "critical");
  return {
    approved: !hasErrors && remoteResult.approved,
    violations: allViolations,
  };
}
