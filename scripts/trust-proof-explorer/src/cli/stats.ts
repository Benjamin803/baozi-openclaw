import { fetchProofs, computeStats } from "../api/proofs.ts";
import { renderStats, renderComparison } from "../dashboard/renderer.ts";

const { proofs, oracle } = await fetchProofs();
const stats = computeStats(proofs);

console.log(renderStats(stats, oracle));
console.log(renderComparison());
console.log();
