/** Up to 4 bone influences per vertex, as stored in the skinIndex / skinWeight attributes. */
export interface PackedWeights { indices: number[]; weights: number[] }

/** Keeps the 4 strongest bone influences, merged per bone and normalized to sum to 1. */
export function normalizeAndPackWeights(pairs: Iterable<readonly number[]>): PackedWeights {
  const map = new Map<number, number>();
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
