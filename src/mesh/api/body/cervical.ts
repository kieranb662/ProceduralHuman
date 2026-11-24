import * as THREE from "three";
import { buildGeometryFromArrays } from "../geometry/attributes.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";

export function buildCervicalSurface(body, head, rig, headOffset, neckOffset) {
  const positions = [], uvs = [], colors = [], skinIdx = [], skinWgt = [], indices = [];
  const { neck: base, neckBelow: below } = body.userData.interfaces;
  const baseAngles = body.userData.neckAngles;
  const { neckAngles: angles, neckStart: top, skullStride: stride } = head.userData;
  const getPoint = (geo, i) => new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i);
  const packedAt = (geo, i) => Array.from({ length: 4 }, (_, k) =>
    [geo.attributes.skinIndex.array[i * 4 + k], geo.attributes.skinWeight.array[i * 4 + k]]);
  const jawBone = rig.boneIndex.get("Jaw");
  const headBone = rig.boneIndex.get("Head");
  const rings = 12;
  const band = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      indices.push(a[i], a[j], b[i], a[j], b[j], b[i]);
    }
  };
  const lower = angles.map((phi, i) => {
    const p = getPoint(head, top + i), q = getPoint(head, top - stride + i);
    const next = baseAngles.findIndex((a) => a > phi + 1e-8);
    const j = next === -1 ? base.length - 1 : next - 1;
    const k = (j + 1) % base.length;
    const f = THREE.MathUtils.clamp((phi - baseAngles[j]) / ((baseAngles[k] + (k ? 0 : 2 * Math.PI)) - baseAngles[j]), 0, 1);
    const b = getPoint(body, base[j]).lerp(getPoint(body, base[k]), f);
    const c = getPoint(body, below[j]).lerp(getPoint(body, below[k]), f);
    const height = p.y - b.y;
    const tangent = (end, neighbor) => end.clone().sub(neighbor)
      .multiplyScalar(height / (end.y - neighbor.y));
    return { p, b, inSlope: tangent(b, c), outSlope: tangent(p, q),
      baseWeights: packedAt(body, base[j]), topWeights: packedAt(head, top + i) };
  });
  let previous;
  for (let r = 1; r < rings; r++) {
    const t = r / rings, blend = t * t * (3 - 2 * t);
    const current = angles.map((phi, i) => {
      const { p, b, inSlope, outSlope, baseWeights, topWeights } = lower[i];
      const v = b.clone().lerp(p, blend)
        .addScaledVector(inSlope, t * (1 - t) ** 2)
        .addScaledVector(outSlope, -(1 - t) * t ** 2);
      const envelope = 16 * t ** 2 * (1 - t) ** 2;
      const scm = 0.0028 * Math.exp(-(((Math.abs(phi) - (0.52 + 0.87 * t)) / 0.24) ** 2));
      const larynx = 0.0022 * Math.exp(-((phi / 0.26) ** 2) - (((t - 0.35) / 0.26) ** 2));
      const nape = 0.0015 * Math.exp(-(((Math.abs(phi) - 2.72) / 0.24) ** 2));
      const relief = (scm + larynx + nape) * envelope;
      v.x += Math.sin(phi) * relief;
      v.z += Math.cos(phi) * relief;
      const pairs = baseWeights.map(([bone, weight]) => [bone, weight * (1 - blend)]);
      for (const [bone, weight] of topWeights) {
        // The jaw pulls on the submental skin, not the whole throat.
        const w = weight * blend;
        const jaw = bone === jawBone ? w * t : w;
        pairs.push([bone, jaw], [headBone, w - jaw]);
      }
      const packed = normalizeAndPackWeights(pairs);
      const index = neckOffset + positions.length / 3;
      positions.push(v.x, v.y, v.z);
      uvs.push(v.x * 2 + 0.5, v.y / 1.78 + v.z);
      colors.push(1, 1, 1);
      skinIdx.push(...packed.indices);
      skinWgt.push(...packed.weights);
      return index;
    });
    if (previous) {
      band(previous, current);
    } else {
      // Zipper the coarse body ring to the denser face grid without T-junctions.
      let i = 0, j = 0;
      while (i < base.length || j < current.length) {
        const b = base[i % base.length], n = current[j % current.length];
        const nextBase = i < base.length ? baseAngles[i + 1] ?? Math.PI : Infinity;
        const nextNeck = j < current.length ? angles[j + 1] ?? Math.PI : Infinity;
        if (nextBase <= nextNeck + 1e-8) {
          indices.push(b, base[++i % base.length], n);
        } else {
          indices.push(b, current[(j + 1) % current.length], n);
          j++;
        }
      }
    }
    previous = current;
  }
  const headRim = angles.map((_, i) => headOffset + top + i);
  band(previous, headRim);
  return {
    geo: buildGeometryFromArrays(positions, uvs, colors, skinIdx, skinWgt, []),
    indices, headRim, bodyRim: base,
  };
}
