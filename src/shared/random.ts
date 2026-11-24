/** Deterministic Park-Miller (minimal standard) generator returning values in [0, 1). */
export function createParkMillerRng(seed: number): () => number {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
