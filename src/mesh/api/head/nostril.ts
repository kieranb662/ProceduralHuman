import { gauss } from "../../../shared/math.js";

// One nostril (ax = |x|): a teardrop whose axis converges toward the nose tip and narrows at the front.
export const nostrilField = (ax: number, y: number): number => {
  const v = y - 1.6205;
  const width = 0.0034 * (1 - 0.38 * Math.tanh(v / 0.0030));
  return gauss(ax - 0.0074 + v * 0.42, v, 0, width, 0.0036, 1);
};
