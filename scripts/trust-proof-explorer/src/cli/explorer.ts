import { fetchProofs } from "../api/proofs.ts";
import { renderProof } from "../dashboard/renderer.ts";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const search = get("--search")?.toLowerCase() ?? null;
const category = get("--category")?.toLowerCase() ?? null;
const tier = get("--tier") ? Number(get("--tier")) : null;
const pda = get("--pda") ?? null;

const { proofs } = await fetchProofs();

console.log("\x1b[36m\x1b[1m=== TRUST PROOF EXPLORER ===\x1b[0m");
console.log(`\x1b[2mFetched ${proofs.length} proof batches from baozi.bet\x1b[0m\n`);

let filtered = proofs;

if (pda) {
  filtered = filtered.filter((p) => p.markets.some((m) => m.pda.toLowerCase() === pda.toLowerCase()));
}
if (tier !== null) {
  filtered = filtered.filter((p) => p.tier === tier);
}
if (category) {
  filtered = filtered.filter((p) => p.category.toLowerCase().includes(category));
}
if (search) {
  filtered = filtered.filter(
    (p) =>
      p.title.toLowerCase().includes(search) ||
      p.markets.some(
        (m) =>
          m.question.toLowerCase().includes(search) ||
          m.evidence.toLowerCase().includes(search)
      )
  );
}

if (filtered.length === 0) {
  console.log("\x1b[33mNo proofs matched your filters.\x1b[0m");
  process.exit(0);
}

console.log(`Showing \x1b[1m${filtered.length}\x1b[0m proof batch(es):\n`);
for (const proof of filtered) {
  console.log(renderProof(proof));
  console.log();
}
