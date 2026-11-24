import * as THREE from "three";

export const smoothstep = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const gauss = (dx, dy, dz, sx, sy, sz) =>
  Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy) - (dz * dz) / (2 * sz * sz));
