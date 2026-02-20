/**
 * Test Runner for AgentBook Pundit
 *
 * Runs all test suites and reports results.
 * No external test framework needed — uses a minimal built-in harness.
 */
import { testHelpers } from "./test-helpers.js";
import { testFundamental } from "./test-fundamental.js";
import { testStatistical } from "./test-statistical.js";
import { testContrarian } from "./test-contrarian.js";
import { testContentGenerator } from "./test-content-generator.js";
import { testAgentBookClient } from "./test-agentbook-client.js";
import { testStrategiesIntegration } from "./test-strategies-integration.js";
import { testIntegration } from "./test-integration.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

let results: TestResult[] = [];
let currentSuite = "";

export function describe(name: string, fn: () => void | Promise<void>): void {
  currentSuite = name;
  console.log(`\n📦 ${name}`);
  // Run sync — tests register themselves
  const result = fn();
  if (result instanceof Promise) {
    // Handle async suites in the runner
  }
}

export function test(name: string, fn: () => void): void {
  const fullName = `${currentSuite} > ${name}`;
  try {
    fn();
    results.push({ name: fullName, passed: true });
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    results.push({ name: fullName, passed: false, error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (actual >= expected) {
        throw new Error(`Expected ${actual} < ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (actual > expected) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
    toContain(expected: string) {
      if (typeof actual === "string" && !actual.includes(expected)) {
        throw new Error(`Expected "${actual.substring(0, 80)}" to contain "${expected}"`);
      }
      if (Array.isArray(actual) && !actual.includes(expected)) {
        throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
      }
    },
    toHaveLength(expected: number) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
    toMatch(pattern: RegExp) {
      if (!pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${pattern}`);
      }
    },
    toThrow() {
      if (typeof actual !== "function") {
        throw new Error("Expected a function");
      }
      try {
        actual();
        throw new Error("Expected function to throw");
      } catch (e: any) {
        if (e.message === "Expected function to throw") throw e;
        // OK — it threw
      }
    },
  };
}

// Run all test suites
async function main() {
  console.log("🧪 AgentBook Pundit — Test Suite\n");
  console.log("═".repeat(50));

  // Unit tests (mocked data)
  testHelpers();
  testFundamental();
  testStatistical();
  testContrarian();
  testContentGenerator();
  testAgentBookClient();
  testStrategiesIntegration();

  // Integration tests (real API calls)
  await testIntegration();

  // Report
  console.log("\n" + "═".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log("❌ Failed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`   • ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log("✅ All tests passed!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
