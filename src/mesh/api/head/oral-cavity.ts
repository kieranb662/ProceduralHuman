import type { KeyedMap } from "../../../rigging/api/types.js";
import type { MouthLoopVertex } from "./types.js";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { ensureUniformAttributes } from "../geometry/attributes.js";
import { loftRings } from "../geometry/loft.js";
import { buildGumArc } from "./teeth.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";
import { smoothstep } from "../../../shared/math.js";

export let ORAL_LOFT_VERTS = 0;

// Inner-mouth bag whose first ring IS the lip opening (same vertices + skin weights), tapering inward
export function buildLoopCavity(loop: MouthLoopVertex[], mouthY: number, bHead: number, bJaw: number): THREE.BufferGeometry {
  const n = loop.length;
  const c = new THREE.Vector3();
  for (const p of loop) c.add(p.pos);
  c.divideScalar(n);
  let hh = 1e-4;
  for (const p of loop) hh = Math.max(hh, Math.abs(p.pos.y - c.y));
  let halfW = 1e-4;
  for (const p of loop) halfW = Math.max(halfW, Math.abs(p.pos.x - c.x));
  const ringDefs = [
    { dz: 0, W: halfW, H: hh },
    { dz: 0.020, W: 0.027, H: 0.014 },
    { dz: 0.034, W: 0.033, H: 0.020 },
    { dz: 0.048, W: 0.030, H: 0.022 },
    { dz: 0.066, W: 0.018, H: 0.016 },
    // Oropharynx: converge and turn downward instead of ending in a flat fan facing the lips.
    { dz: 0.073, W: 0.011, H: 0.011, dy: -0.003 },
    { dz: 0.077, W: 0.005, H: 0.005, dy: -0.006 },
  ];
  const rings = ringDefs.map((d, k) => {
    const pts = [], wgts = [];
    for (const p of loop) {
      if (k === 0) {
        pts.push(p.pos.clone());
        wgts.push({ indices: p.idx, weights: p.wgt });
        continue;
      }
      const dy = p.pos.y - c.y;
      const nx = (p.pos.x - c.x) / halfW;
      const height = Math.sqrt(Math.max(0, 1 - nx * nx));
      pts.push(new THREE.Vector3(c.x + nx * d.W, mouthY + (d.dy ?? 0) + Math.sign(dy) * height * d.H, c.z - d.dz));
      // Skin weights: blend from the lip-edge weights (ring 0) toward a smooth upper=head / lower=jaw split.
      // jawT varies continuously corner-to-corner so the lower rim moves as one curve with the lower lip.
      const b = Math.min(1, [0, 0.5, 0.85][k] ?? 1);
      const jawT = THREE.MathUtils.clamp(0.45 - 0.9 * (dy / hh), 0, 1);
      const pr = [];
      for (let j = 0; j < 4; j++) pr.push([p.idx[j], p.wgt[j] * (1 - b)]);
      pr.push([bHead, b * (1 - jawT)], [bJaw, b * jawT]);
      wgts.push(normalizeAndPackWeights(pr));
    }
    return { points: pts, weights: wgts, v: k / (ringDefs.length - 1) };
  });
  const geo = loftRings(rings, false, true);
  const colors = geo.attributes.color;
  for (let i = 0; i < colors.count; i++) {
    const depth = Math.min(1, Math.floor(i / (n + 1)) / (rings.length - 1));
    const shade = THREE.MathUtils.lerp(0.48, 0.065, depth);
    colors.setXYZ(i, shade, shade * 0.65, shade * 0.70);
  }
  return geo;
}

export function buildOralCavityAndTongue(mouthY: number, bHead: number, bJaw: number, mouthLoop: MouthLoopVertex[], boneIndex: KeyedMap<number>) {
  const parts: THREE.BufferGeometry[] = [];

  const cavRings = [];
  const depthSteps = [
    { z: 0.122, rx: 0.024, ry: 0.004, yOff: 0.000 },
    { z: 0.113, rx: 0.027, ry: 0.014, yOff: 0.001 },
    { z: 0.098, rx: 0.028, ry: 0.018, yOff: 0.002 },
    { z: 0.082, rx: 0.024, ry: 0.016, yOff: 0.001 },
    { z: 0.070, rx: 0.015, ry: 0.011, yOff: -0.002 },
  ];
  const radSegs = 20;
  for (let d = 0; d < depthSteps.length; d++) {
    const st = depthSteps[d];
    const pts = [];
    const wgts = [];
    for (let s = 0; s < radSegs; s++) {
      const a = (s / radSegs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = -ca * st.rx;
      const y = mouthY + st.yOff + sa * st.ry;
      pts.push(new THREE.Vector3(x, y, st.z));
      const jawShare = smoothstep(0.15, -0.35, sa) * smoothstep(0.070, 0.116, st.z);
      wgts.push(normalizeAndPackWeights([[bHead, 1 - jawShare * 0.85], [bJaw, jawShare * 0.85]]));
    }
    cavRings.push({ points: pts, weights: wgts, v: d / (depthSteps.length - 1) });
  }
  const loftGeo = mouthLoop && mouthLoop.length >= 8
    ? buildLoopCavity(mouthLoop, mouthY, bHead, bJaw)
    : loftRings(cavRings, false, true);
  ORAL_LOFT_VERTS = loftGeo.attributes.position.count;
  parts.push(loftGeo);

  parts.push(buildGumArc(true, bHead), buildGumArc(false, bJaw));
  const tongueRings = [];
  const joints = ["TongueBase", "TongueMid", "TongueTip"].map((name) => boneIndex.get(name));
  // Muscular tongue body: root sinks into the oral floor, dorsum sits just below the lower
  // occlusal plane, lateral margins stay inside the lower arch, tip rests behind the incisors.
  const z0 = 0.056, z1 = 0.1022, ringCount = 40, segs = 36;
  for (let r = 0; r <= ringCount; r++) {
    const t = 1 - Math.pow(1 - r / ringCount, 1.35);
    const z = z0 + t * (z1 - z0);
    const tipRound = (k: number) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - k) / (1 - k), 2)));
    const rootT = Math.max(0, 1 - t / 0.2);
    const halfW = Math.max(0.0002, 0.0172 * (1 - 0.22 * rootT * rootT) * tipRound(0.58));
    const halfH = Math.max(0.0002, THREE.MathUtils.lerp(0.0068, 0.0034, smoothstep(0.35, 0.92, t)) * tipRound(0.80));
    const yc = 1.5833 + 0.0008 * smoothstep(0.7, 1, t) - 0.0045 * rootT * rootT;
    let weight;
    if (z < 0.066) {
      const f = smoothstep(z0, 0.066, z);
      weight = normalizeAndPackWeights([[bJaw, 1 - f], [joints[0], f]]);
    } else {
      const blend = THREE.MathUtils.clamp(z < 0.082 ? (z - 0.066) / 0.016 : 1 + (z - 0.082) / 0.013, 0, 2);
      const a = Math.min(1, Math.floor(blend)), f = blend - a;
      weight = normalizeAndPackWeights([[joints[a], 1 - f], [joints[a + 1], f]]);
    }
    const pts = [], wgts = [];
    for (let s = 0; s < segs; s++) {
      const angle = s / segs * Math.PI * 2;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 0.75) * halfW;
      // Convex dorsum with a shallow median sulcus; flatter underside resting on the floor.
      const sulcus = 0.0009 * Math.exp(-Math.pow(x / 0.0026, 2)) * smoothstep(0.1, 0.4, t) * (1 - smoothstep(0.75, 0.97, t));
      const y = sa >= 0
        ? yc + halfH * Math.pow(sa, 0.7) - sulcus * sa
        : yc - halfH * 0.92 * Math.pow(-sa, 0.45);
      pts.push(new THREE.Vector3(x, y, z));
      wgts.push(weight);
    }
    tongueRings.push({ points: pts, weights: wgts, v: t });
  }
  const tongue = loftRings(tongueRings, true, true);
  const tc = tongue.attributes.color;
  const tp = tongue.attributes.position;
  for (let i = 0; i < tc.count; i++) {
    const s = i % (segs + 1);
    const underside = i < (ringCount + 1) * (segs + 1) && s > segs / 2 && s < segs;
    // Darken the root, which sits in the shadowed back of the mouth.
    const depth = THREE.MathUtils.lerp(0.45, 1, smoothstep(z0, 0.080, tp.getZ(i)));
    tc.setXYZ(i, (underside ? 0.74 : 1) * depth, (underside ? 0.60 : 0.95) * depth, (underside ? 0.68 : 0.95) * depth);
  }
  return { cavity: BufferGeometryUtils.mergeGeometries(parts.map(ensureUniformAttributes), false), tongue };
}
