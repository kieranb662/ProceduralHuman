import type { KeyedMap } from "../../../rigging/api/types.js";
import * as THREE from "three";
import { buildChainTube } from "../geometry/loft.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";

export function buildEyebrowStrip(
  s: number, boneName: string, boneIndex: KeyedMap<number>, evalForeheadSurfaceZ: (x: number, y: number) => number,
): THREE.BufferGeometry {
  const bIdx = boneIndex.get(boneName);
  const pts = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = s * THREE.MathUtils.lerp(0.011, 0.056, t);
    const arch = Math.sin(t * Math.PI) * 0.0042 - t * 0.0012;
    const y = 1.688 + arch;
    const z = evalForeheadSurfaceZ(x, y) + 0.0024;
    const thickness = 0.0024 + Math.sin(t * Math.PI) * 0.0014;
    const height = 0.0036 + Math.sin(t * Math.PI) * 0.0015;
    pts.push({ pos: new THREE.Vector3(x, y, z), rx: thickness, rz: height, weight: normalizeAndPackWeights([[bIdx, 1]]) });
  }
  return buildChainTube(pts, 10, true, true);
}
