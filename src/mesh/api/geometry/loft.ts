import * as THREE from "three";
import type { PackedWeights } from "../../../rigging/api/skin-weights.js";
import { buildGeometryFromArrays, weldSeamNormals } from "./attributes.js";
import type { LoftRing, TubeSegment } from "./types.js";

export function loftRings(rings: LoftRing[], capBottom = false, capTop = false): THREE.BufferGeometry {
  const numRings = rings.length;
  const segs = rings[0].points.length;
  const stride = segs + 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const skinIdx: number[] = [];
  const skinWgt: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < numRings; r++) {
    const ring = rings[r];
    const vCoord = ring.v ?? r / Math.max(1, numRings - 1);
    for (let s = 0; s <= segs; s++) {
      const i = s % segs;
      const p = ring.points[i];
      positions.push(p.x, p.y, p.z);
      uvs.push(s / segs, vCoord);
      colors.push(1, 1, 1);
      const w = ring.weights[i];
      skinIdx.push(...w.indices);
      skinWgt.push(...w.weights);
    }
  }

  for (let r = 0; r < numRings - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = (r + 1) * stride + s;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const addCap = (ringIdx: number, flip: boolean) => {
    const ring = rings[ringIdx];
    const center = new THREE.Vector3();
    for (const p of ring.points) center.add(p);
    center.divideScalar(segs);
    const cIdx = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    uvs.push(0.5, ringIdx === 0 ? 0 : 1);
    colors.push(1, 1, 1);
    skinIdx.push(...ring.weights[0].indices);
    skinWgt.push(...ring.weights[0].weights);
    const base = ringIdx * stride;
    for (let s = 0; s < segs; s++) {
      if (flip) indices.push(cIdx, base + s + 1, base + s);
      else indices.push(cIdx, base + s, base + s + 1);
    }
  };

  if (capBottom) addCap(0, true);
  if (capTop) addCap(numRings - 1, false);

  const geo = buildGeometryFromArrays(positions, uvs, colors, skinIdx, skinWgt, indices);
  weldSeamNormals(geo, numRings, segs);
  return geo;
}

// --- 2B. Limb Chain Lofting Helper ---
export function buildChainTube(segmentsDef: TubeSegment[], radSegs: number, capStart = true, capEnd = true): THREE.BufferGeometry {
  const rings: LoftRing[] = [];
  const upRef = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < segmentsDef.length; i++) {
    const cur = segmentsDef[i];
    const prev = segmentsDef[Math.max(0, i - 1)];
    const next = segmentsDef[Math.min(segmentsDef.length - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(next.pos, prev.pos);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, -1, 0);
    tangent.normalize();

    let sideA = new THREE.Vector3().crossVectors(upRef, tangent);
    if (sideA.lengthSq() < 1e-4) sideA.set(1, 0, 0);
    sideA.normalize();
    const sideB = new THREE.Vector3().crossVectors(tangent, sideA).normalize();

    const pts: THREE.Vector3[] = [];
    const wgts: PackedWeights[] = [];
    for (let s = 0; s < radSegs; s++) {
      const a = (s / radSegs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const p = cur.pos.clone()
        .addScaledVector(sideA, ca * cur.rx)
        .addScaledVector(sideB, sa * cur.rz);
      pts.push(p);
      wgts.push(cur.weight);
    }
    rings.push({ points: pts, weights: wgts, v: cur.v ?? i / Math.max(1, segmentsDef.length - 1) });
  }
  return loftRings(rings, capStart, capEnd);
}
