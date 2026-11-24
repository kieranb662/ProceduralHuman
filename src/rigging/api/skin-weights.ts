// --- 2. Geometry & Analytical Skinning Helpers ---
export function normalizeAndPackWeights(pairs) {
  const map = new Map();
  for (const [idx, w] of pairs) {
    if (w <= 1e-6) continue;
    map.set(idx, (map.get(idx) ?? 0) + w);
  }
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  while (sorted.length < 4) sorted.push([0, 0]);
  const sum = sorted.reduce((acc, e) => acc + e[1], 0) || 1;
  return {
    indices: sorted.map((e) => e[0]),
    weights: sorted.map((e) => e[1] / sum),
  };
}
