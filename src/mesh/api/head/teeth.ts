import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { ensureUniformAttributes } from "../geometry/attributes.js";
import { buildChainTube, loftRings } from "../geometry/loft.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";

// Shared arch geometry so crowns and gingiva stay registered. The lower arch sits inside the
// upper one (overjet) and its incisal edges rise above the upper edges (overbite / curve of Spee).
export const DENTAL_ARCH = {
  upper: { rx: 0.026, rz: 0.035, front: 0.112, edges: [1.5925, 1.5925, 1.5925, 1.5925, 1.5925, 1.5925, 1.5925] },
  lower: { rx: 0.0235, rz: 0.033, front: 0.1075, edges: [1.5945, 1.5943, 1.5935, 1.5926, 1.5920, 1.5915, 1.5912] },
};

export function dentalLayout(upper: boolean) {
  // Seven teeth per quadrant: incisors, canine, two premolars, two molars.
  const widths = upper ? [0.0080, 0.0064, 0.0072, 0.0065, 0.0064, 0.0092, 0.0087]
    : [0.0052, 0.0057, 0.0065, 0.0065, 0.0068, 0.0095, 0.0090];
  const heights = upper ? [0.0095, 0.0085, 0.0102, 0.0075, 0.0070, 0.0065, 0.0060]
    : [0.0075, 0.0078, 0.0090, 0.0070, 0.0067, 0.0062, 0.0058];
  const { rx, rz, front, edges } = upper ? DENTAL_ARCH.upper : DENTAL_ARCH.lower;
  const teeth = [];
  for (const side of [-1, 1]) {
    let angle = 0;
    for (let i = 0; i < widths.length; i++) {
      const speed = Math.hypot(rx * Math.cos(angle), rz * Math.sin(angle));
      const span = (widths[i] + 0.00025) / speed;
      const t = angle + span / 2;
      teeth.push({ i, side, t, width: widths[i], height: heights[i], edgeY: edges[i],
        depth: i < 3 ? 0.0055 : i < 5 ? 0.0080 : 0.010,
        x: side * rx * Math.sin(t), z: front - rz * (1 - Math.cos(t)),
        rotation: side * Math.atan2(rz * Math.sin(t), rx * Math.cos(t)) });
      angle += span;
    }
  }
  return teeth;
}

export function buildTeethArc(upper: boolean, boneIdx: number): THREE.BufferGeometry {
  const parts = [], direction = upper ? 1 : -1;
  const weight = normalizeAndPackWeights([[boneIdx, 1]]);
  for (const tooth of dentalLayout(upper)) {
    const rings = [];
    const edgeY = tooth.edgeY;
    for (let r = 0; r <= 12; r++) {
      const v = r / 12;
      const profile = r === 0 ? 0.67 : r === 12 ? 0.72 : 0.94 + 0.06 * Math.sin(Math.PI * v);
      const pts = [], wgts = [];
      for (let s = 0; s < 32; s++) {
        const a = s / 32 * Math.PI * 2;
        const rounded = (n: number) => Math.sign(n) * Math.pow(Math.abs(n), 0.55);
        const lx = rounded(Math.cos(a)) * tooth.width * 0.48 * profile;
        const lz = -rounded(Math.sin(a)) * tooth.depth * 0.5 * profile * (tooth.i < 3 ? 0.55 + v * 0.45 : 1);
        // Canine: single pointed cusp. Premolars: buccal + lingual cusps. Molars: four corner cusps.
        const cusp = tooth.i === 2 ? (1 - Math.abs(lx) / (tooth.width * 0.5)) * 0.0016
          : tooth.i >= 3 ? (0.5 - 0.5 * Math.cos(a * (tooth.i < 5 ? 2 : 4))) * 0.0010 : 0;
        const y = edgeY + direction * (v * tooth.height - cusp * Math.pow(1 - v, 4));
        pts.push(new THREE.Vector3(
          tooth.x + lx * Math.cos(tooth.rotation) + lz * Math.sin(tooth.rotation),
          y, tooth.z - lx * Math.sin(tooth.rotation) + lz * Math.cos(tooth.rotation)));
        wgts.push(weight);
      }
      rings.push({ points: pts, weights: wgts, v });
    }
    // Reverse lower rings to retain outward-facing winding on both arches.
    const geo = loftRings(upper ? rings : rings.reverse(), true, true);
    const col = geo.attributes.color;
    const shade = 1 - tooth.i * 0.009;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, shade, shade, shade);
    parts.push(geo);
  }
  return BufferGeometryUtils.mergeGeometries(parts.map(ensureUniformAttributes), false);
}

export function buildGumArc(upper: boolean, boneIdx: number): THREE.BufferGeometry {
  const { rx, rz, front } = upper ? DENTAL_ARCH.upper : DENTAL_ARCH.lower;
  const dir = upper ? 1 : -1, radius = 0.0040;
  // Gum line tracks each crown's cervical margin, overlapping it by ~1.3 mm.
  const quadrant = dentalLayout(upper).filter((tooth) => tooth.side === 1);
  const cervicalY = (t: number) => {
    const a = Math.abs(t);
    let k = quadrant.findIndex((tooth) => tooth.t > a);
    if (k === -1) k = quadrant.length;
    const p = quadrant[Math.max(0, k - 1)], n = quadrant[Math.min(quadrant.length - 1, k)];
    const f = p === n ? 0 : THREE.MathUtils.clamp((a - p.t) / (n.t - p.t), 0, 1);
    return THREE.MathUtils.lerp(p.edgeY + dir * p.height, n.edgeY + dir * n.height, f);
  };
  const defs = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64 - 0.5) * Math.PI * 1.15;
    defs.push({ pos: new THREE.Vector3(rx * Math.sin(t), cervicalY(t) + dir * (radius - 0.0013), front - rz * (1 - Math.cos(t))),
      rx: radius, rz: radius, weight: normalizeAndPackWeights([[boneIdx, 1]]) });
  }
  const geo = buildChainTube(defs, 16, true, true);
  const colors = geo.attributes.color;
  // Attached gingiva reads coral-pink, lighter than the surrounding mucosa.
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1.12, 1.30, 1.18);
  return geo;
}
