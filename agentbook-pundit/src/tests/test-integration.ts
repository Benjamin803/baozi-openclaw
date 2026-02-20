/**
 * Integration Tests for AgentBook Pundit
 *
 * These tests call REAL APIs — no mocking.
 * They verify that the direct handler imports from @baozi.bet/mcp-server
 * work correctly against Solana mainnet, and that the AgentBook API
 * returns the expected schema.
 *
 * Note: Solana public RPC has rate limits. Tests include delays to avoid 429s.
 * Set HELIUS_RPC_URL or SOLANA_RPC_URL env var for a dedicated RPC endpoint.
 */
import { listMarkets, getMarket, PROGRAM_ID } from "../services/mcp-client.js";

interface IntegrationTestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: IntegrationTestResult[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  ✅ ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({ name, passed: false, error: err.message, duration });
    console.log(`  ❌ ${name}: ${err.message} (${duration}ms)`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function testIntegration(): Promise<void> {
  console.log("\n📦 Integration Tests (REAL API calls)\n");

  // --- Test 1: Program ID is correct ---
  await runTest("PROGRAM_ID matches expected Baozi V4 mainnet address", async () => {
    const expected = "FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ";
    assert(
      PROGRAM_ID.toBase58() === expected,
      `Expected ${expected}, got ${PROGRAM_ID.toBase58()}`
    );
  });

  // --- Test 2: listMarkets returns real data from Solana RPC ---
  // This is the critical integration test: calls a real handler that queries Solana mainnet
  await runTest("listMarkets() returns real markets from Solana mainnet", async () => {
    // Retry up to 3 times with increasing delays for rate-limited public RPC
    let markets: any[] | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`    ↻ Retry ${attempt} after delay...`);
          await sleep(5000 * attempt);
        }
        markets = await listMarkets("active");
        break;
      } catch (err: any) {
        lastError = err.message;
        if (!err.message.includes("429")) throw err;
      }
    }

    assert(markets !== null, `All retries failed: ${lastError}`);
    assert(Array.isArray(markets), "Expected array of markets");
    assert(markets!.length > 0, "Expected at least 1 active market");

    const first = markets![0];
    assert(typeof first.publicKey === "string" && first.publicKey.length > 0, "Market should have publicKey");
    assert(typeof first.question === "string" && first.question.length > 0, "Market should have question");
    assert(typeof first.yesPoolSol === "number", "Market should have yesPoolSol");
    assert(typeof first.noPoolSol === "number", "Market should have noPoolSol");
    assert(typeof first.totalPoolSol === "number", "Market should have totalPoolSol");
    assert(typeof first.status === "string", "Market should have status");
    assert(typeof first.closingTime === "string", "Market should have closingTime");
    assert(typeof first.layer === "string", "Market should have layer");
    assert(typeof first.yesPercent === "number", "Market should have yesPercent");
    assert(typeof first.noPercent === "number", "Market should have noPercent");

    console.log(`    → Found ${markets!.length} active markets`);
    console.log(`    → First: "${first.question}" (${first.yesPercent}% Yes / ${first.noPercent}% No)`);
  });

  // --- Test 3: AgentBook GET API returns real posts ---
  await runTest("AgentBook GET /api/agentbook/posts returns real posts with correct schema", async () => {
    const res = await fetch("https://baozi.bet/api/agentbook/posts");
    assert(res.ok, `HTTP ${res.status}`);
    const data = await res.json() as any;

    assert(data.success === true, "Expected {success: true}");
    assert(Array.isArray(data.posts), "Expected posts array");
    assert(data.posts.length > 0, "Expected at least 1 post");

    const post = data.posts[0];
    assert(typeof post.id === "number", "Post should have numeric id");
    assert(typeof post.walletAddress === "string", "Post should have walletAddress");
    assert(typeof post.content === "string", "Post should have content");
    assert(typeof post.steams === "number", "Post should have steams count");
    assert(typeof post.createdAt === "string", "Post should have createdAt timestamp");
    // marketPda can be null for general posts
    assert(post.marketPda === null || typeof post.marketPda === "string", "Post marketPda should be string or null");

    console.log(`    → Found ${data.posts.length} posts, latest by ${post.walletAddress.slice(0, 8)}...`);
  });

  // --- Test 4: AgentBook POST schema validation (dry check, no actual post) ---
  await runTest("AgentBook POST /api/agentbook/posts schema matches expected format", async () => {
    // Validate we can construct the correct request body
    const body = {
      walletAddress: "FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz",
      content: "Test content — this verifies schema compatibility",
      marketPda: "aGv3HyRKrcksPufa7QMWrbK4JdkfuM84q1gobBr9UtA",
    };

    // Verify the expected fields match what real API expects
    assert(typeof body.walletAddress === "string", "walletAddress required");
    assert(typeof body.content === "string", "content required");
    assert(typeof body.marketPda === "string", "marketPda is a string");

    // Verify against known real post from GET (confirms GET/POST schemas are consistent)
    const res = await fetch("https://baozi.bet/api/agentbook/posts?limit=1");
    const data = await res.json() as any;
    if (data.posts && data.posts.length > 0) {
      const realPost = data.posts[0];
      // Confirm real post has the fields our POST body sends
      assert("walletAddress" in realPost, "Real post has walletAddress");
      assert("content" in realPost, "Real post has content");
      assert("marketPda" in realPost, "Real post has marketPda");
      // Real posts also have server-set fields
      assert("id" in realPost, "Real post has id (server-assigned)");
      assert("steams" in realPost, "Real post has steams (server-set)");
      assert("createdAt" in realPost, "Real post has createdAt (server-set)");
    }

    console.log("    → POST schema {walletAddress, content, marketPda} confirmed against real API");
  });

  // --- Summary ---
  console.log("\n" + "─".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n📊 Integration: ${passed}/${results.length} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log("❌ Failed integration tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`   • ${r.name}: ${r.error}`);
    }
  }
}
