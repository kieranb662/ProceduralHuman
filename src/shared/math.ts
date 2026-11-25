import * as THREE from "three";

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const gauss = (dx: number, dy: number, dz: number, sx: number, sy: number, sz: number): number =>
  Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy) - (dz * dz) / (2 * sz * sz));
