// Tileable value-noise helpers used by the procedural canvas textures.
export const hash2 = (x: number, y: number, s: number): number => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
export function vnoise(x: number, y: number, per: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % per) + per) % per;
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s);
  const c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(u: number, v: number, f: number, oct: number, s: number): number {
  let sum = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(u * f, v * f, f, s + o); tot += amp; f *= 2; amp *= 0.5; }
  return sum / tot;
}
