import { SIDES } from "../../../shared/sides.js";
import * as THREE from "three";
import type { PackedWeights } from "../../../rigging/api/skin-weights.js";
import type { HumanoidRig } from "../../../rigging/api/types.js";
import type { TubeSegment } from "../geometry/types.js";
import type { MeshPart } from "../types.js";

/** Height customization inputs (see height.ts); omitted for the default proportions. */
export interface BodyHeightShape {
  /** Maps canonical torso heights to the target proportions (monotonic). */
  mapY?: (y: number) => number;
  /** Length scale of each limb relative to the default. */
  limbScale?: { legs: number; arms: number };
  /** Each limb's ring frames at the default height (`userData.tubeFrames`), so the rigid hands
   *  and feet keep their exact orientation. */
  tubeFrames?: Record<string, TubeFrame>;
  /** Full height multiplier (selects the upper-arm weight layout); defaults to 1. */
  height?: number;
}

interface TubeFrame { phase: number; axes: number[][] }

/** Physical width of the low-pass applied to radius profiles that a shorter body compresses. */
const FAIRING_SIGMA = 0.03;
const gaussian = (d: number) => Math.exp(-0.5 * (d / FAIRING_SIGMA) ** 2);
const WEIGHT_SIGMA = 0.05;
const HIP_BLEND_MIN = 0.10;
const SPINE_BLEND_MIN = 0.10;
/** Deltoid-helper weight on the shoulder socket rim and the physical distance it fades over. */
const DELTOID_RIM = 0.65;
const DELTOID_REACH = 0.09;
/** Shortest fade under the arm, used for short arms whose raised root would overstretch the lat. */
const DELTOID_REACH_UNDER = 0.075;
/**
 * Per unit of arm shortening (1 - arm scale): added rim Deltoid weight and top fade distance,
 * and outward shift of the first two arm rings (fraction of the humerus).
 */
const SHORT_ARM = { rim: 0.27, reach: 0.055, ring0: 0.11, ring1: 0.127 };
/** Upper-arm shaft: humerus fractions of rings 2 and 3 and the Deltoid share of rings 0-3. */
interface ArmLayout { ring2: number; ring3: number; deltoid: [number, number, number, number] }
/**
 * The Deltoid helper turns half as far as the humerus about the same socket, so every shaft ring
 * that lags behind is displaced sideways by its distance from the socket times its lag. A share
 * that ends abruptly mid-shaft makes the shaft overshoot and snap back, kinking a raised upper arm
 * into a Z; it must fall steeply near the socket and taper slowly toward the elbow instead. Where
 * the root rings sit along the humerus depends on arm length (they keep a physical distance from
 * the socket on long arms and spread out on short ones), so each height range has its own layout,
 * interpolated between the knots of that range.
 */
const ARM_LAYOUTS: { includes: (height: number) => boolean; knots: [number, ArmLayout][] }[] = [
  { includes: (h) => h < 0.8, knots: [
    [0.5, { ring2: 0.50, ring3: 0.68, deltoid: [0.86, 0.63, 0.36, 0.10] }],
    [0.65, { ring2: 0.50, ring3: 0.62, deltoid: [0.83, 0.50, 0.30, 0.15] }],
    [0.8, { ring2: 0.50, ring3: 0.62, deltoid: [0.81, 0.40, 0.20, 0.10] }]] },
  { includes: (h) => h <= 1.4, knots: [
    [0.8, { ring2: 0.50, ring3: 0.62, deltoid: [0.81, 0.40, 0.20, 0.10] }],
    [1.0, { ring2: 0.50, ring3: 0.62, deltoid: [0.85, 0.40, 0.20, 0.10] }],
    [1.4, { ring2: 0.45, ring3: 0.68, deltoid: [0.85, 0.40, 0.15, 0.08] }]] },
  { includes: (h) => h <= 1.7, knots: [
    [1.4, { ring2: 0.45, ring3: 0.68, deltoid: [0.85, 0.40, 0.15, 0.08] }],
    [1.7, { ring2: 0.45, ring3: 0.68, deltoid: [0.85, 0.35, 0.12, 0.06] }]] },
  { includes: () => true, knots: [
    [1.7, { ring2: 0.45, ring3: 0.68, deltoid: [0.85, 0.35, 0.12, 0.06] }],
    [2.0, { ring2: 0.45, ring3: 0.62, deltoid: [0.85, 0.35, 0.10, 0.05] }]] },
];
function armLayout(height: number): ArmLayout {
  const { knots } = ARM_LAYOUTS.find((range) => range.includes(height))!;
  let k = 1;
  while (k < knots.length - 1 && knots[k][0] < height) k++;
  const [[h0, a], [h1, b]] = [knots[k - 1], knots[k]];
  const t = THREE.MathUtils.clamp((height - h0) / (h1 - h0), 0, 1);
  const mix = (x: number, y: number) => THREE.MathUtils.lerp(x, y, t);
  return { ring2: mix(a.ring2, b.ring2), ring3: mix(a.ring3, b.ring3), deltoid: a.deltoid.map((d, i) => mix(d, b.deltoid[i])) as ArmLayout["deltoid"] };
}
/** Default upper-arm taper [humerus fraction, rx, rz], sampled wherever a shaft ring is placed. */
const UPPER_ARM_TAPER = [[0.35, 0.057, 0.056], [0.50, 0.052, 0.051], [0.68, 0.047, 0.047], [0.86, 0.043, 0.043]];
function upperArmRadius(f: number): [number, number] {
  const k = THREE.MathUtils.clamp(UPPER_ARM_TAPER.findIndex(([g]) => g >= f), 1, UPPER_ARM_TAPER.length - 1);
  const [f0, x0, z0] = UPPER_ARM_TAPER[k - 1], [f1, x1, z1] = UPPER_ARM_TAPER[k];
  const t = (f - f0) / (f1 - f0);
  return [THREE.MathUtils.lerp(x0, x1, t), THREE.MathUtils.lerp(z0, z1, t)];
}
/**
 * The elbow joint ring turns rigidly with the half-angle Elbow helper instead of blending two bones
 * a full bend apart, which collapses the inner elbow toward the joint. `above` is the helper's
 * share of the two rings above the joint (the rest is UpperArm); `below` is the Forearm share of
 * the first forearm ring (the rest is the helper).
 */
const ELBOW_HELPER = { above: [0.2, 0.6], below: 0.5 };
/** Clavicle weight over the acromion and trapezius, and its minimum physical fade below the joint. */
const GIRDLE_WEIGHT = 0.9;
const GIRDLE_DROP_MIN = 0.09;
const LEG_ROOT_SETTLE = 0.09;

/** [center, rx, rz, weight] row of a limb tube definition. */
type TubeRow = [THREE.Vector3, number, number, PackedWeights];
import { buildJointedHand } from "./hand.js";
import { handLayout } from "../../../rigging/api/hand-layout.js";
import { buildGeometryFromArrays } from "../geometry/attributes.js";
import { buildChainTube } from "../geometry/loft.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";

// Shared indices, not overlapping caps, join the shoulders and bifurcated pelvis.
/**
 * Builds the base body (torso, limbs, feet) as one shared-vertex surface plus the hands and toes.
 * `mapY` re-seats the torso's canonical heights (see height.ts); `rig` must carry the matching
 * rest pose. Weights are always evaluated at canonical heights, so the topology and weight
 * layout are identical for every height.
 */
export function buildBaseBodyParts(rig: HumanoidRig, shape: BodyHeightShape = {}): MeshPart[] {
  const mapY = shape.mapY ?? ((y: number) => y);
  const slopeAt = (y: number) => (mapY(y + 1e-3) - mapY(y - 1e-3)) / 2e-3;
  const bi = (name: string) => rig.boneIndex.get(name);
  const pk = normalizeAndPackWeights;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], skinIdx: number[] = [], skinWgt: number[] = [];
  const indices: number[] = [];
  const faceSlots: string[] = [], faceBands: (number | null)[] = [];
  const interfaces: Record<string, number[]> = {};
  const handParts: MeshPart[] = [];
  const addVertex = (p: THREE.Vector3, w: PackedWeights) => {
    const i = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    uvs.push(p.x * 2 + 0.5, p.y / 1.78 + p.z);
    colors.push(1, 1, 1);
    skinIdx.push(...w.indices);
    skinWgt.push(...w.weights);
    return i;
  };
  const point = (i: number) => new THREE.Vector3().fromArray(positions, i * 3);
  const triangle = (a: number, b: number, c: number, slot: string, band: number | null = null) => {
    indices.push(a, b, c);
    faceSlots.push(slot);
    faceBands.push(band);
  };
  const bridge = (a: number[], b: number[], slot: string, band: number | null) => {
    if (a.length !== b.length) throw new Error("Body interface ring size mismatch.");
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      triangle(a[i], a[j], b[i], slot, band);
      triangle(a[j], b[j], b[i], slot, band);
    }
  };
  const spineAnchors: [string, number][] = [["Hips", 0.96], ["Spine", 1.08], ["Spine1", 1.24],
    ["Chest", 1.38], ["Neck", 1.51], ["Head", 1.61]];
  const spineY = spineAnchors.map(([, y]) => mapY(y));
  // Each bone-to-bone blend spans at least SPINE_BLEND_MIN of physical height, so a shortened
  // torso twists smoothly instead of creasing; at default spacing this is the canonical blend.
  const spineWeight = (y: number) => {
    const py = mapY(y);
    const transition = (i: number) => {
      const mid = (spineY[i] + spineY[i + 1]) / 2;
      const half = Math.max(spineY[i + 1] - spineY[i], SPINE_BLEND_MIN) / 2;
      return THREE.MathUtils.smoothstep(py, mid - half, mid + half);
    };
    const t = spineAnchors.slice(0, -1).map((_, i) => transition(i));
    const raw = spineAnchors.map((_, j) => (j > 0 ? t[j - 1] : 1) * (j < t.length ? 1 - t[j] : 1));
    const total = raw.reduce((a, b) => a + b, 0);
    return pk(spineAnchors.map(([name], j) => [bi(name), raw[j] / total] as [number, number]));
  };
  /** Spine and thigh weights; the shoulder bones are laid over these once the sockets are seated. */
  const torsoWeight = (p: THREE.Vector3, shoulder: { clavicle: number; deltoid: number } = { clavicle: 0, deltoid: 0 }) => {
    const side = p.x >= 0 ? "L" : "R";
    // The thigh blend keeps a minimum physical height so a shortened pelvis does not crease.
    const hipRise = (mapY(p.y) - mapY(0.89)) / Math.max(mapY(1.015) - mapY(0.89), HIP_BLEND_MIN);
    const hip = (1 - THREE.MathUtils.smoothstep(hipRise, 0, 1))
      * THREE.MathUtils.smoothstep(Math.abs(p.x), 0.015, 0.12) * 0.42;
    const base = spineWeight(p.y);
    const rest = 1 - shoulder.clavicle - shoulder.deltoid - hip;
    return pk([...base.indices.map((i, k) => [i, base.weights[k] * rest]),
      [bi(`Clavicle_${side}`), shoulder.clavicle],
      [bi(`Deltoid_${side}`), shoulder.deltoid], [bi(`Thigh_${side}`), hip]]);
  };
  const table = [
    // Taper from the thigh junction into the waist without a lateral hip shelf.
    { y: 0.89, rx: 0.172, rz: 0.105, cz: -0.002 },
    { y: 0.94, rx: 0.166, rz: 0.113, cz: -0.004 },
    { y: 1.00, rx: 0.151, rz: 0.106, cz: 0 },
    { y: 1.08, rx: 0.139, rz: 0.102, cz: 0.003 },
    { y: 1.16, rx: 0.156, rz: 0.111, cz: 0.004 },
    { y: 1.25, rx: 0.182, rz: 0.120, cz: 0.007 },
    { y: 1.33, rx: 0.194, rz: 0.119, cz: 0.005 },
    { y: 1.39, rx: 0.201, rz: 0.108, cz: 0 },
    { y: 1.45, rx: 0.165, rz: 0.085, cz: -0.003 },
    { y: 1.50, rx: 0.064, rz: 0.057, cz: -0.004 },
    { y: 1.515, rx: 0.055, rz: 0.052, cz: -0.006 },
  ];
  const profile = (y: number) => {
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i], b = table[i + 1];
      if (y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        const prev = table[Math.max(0, i - 1)], next = table[Math.min(table.length - 1, i + 2)];
        const result = { rx: 0, rz: 0, cz: 0 };
        for (const key of ["rx", "rz", "cz"] as const) {
          const m0 = (b[key] - prev[key]) / (b.y - prev.y) * (b.y - a.y);
          const m1 = (next[key] - a[key]) / (next.y - a.y) * (b.y - a.y);
          result[key] = (2 * t ** 3 - 3 * t ** 2 + 1) * a[key]
            + (t ** 3 - 2 * t ** 2 + t) * m0 + (-2 * t ** 3 + 3 * t ** 2) * b[key]
            + (t ** 3 - t ** 2) * m1;
        }
        return result;
      }
    }
    return table[table.length - 1];
  };
  // Compressing the torso steepens its contours into creases, so fair the profile over a fixed
  // physical distance; the blend is zero at default or taller proportions and at the hip and neck rims.
  const fairedProfile = (y: number) => {
    const p = profile(y);
    const alpha = THREE.MathUtils.clamp(1 - slopeAt(y), 0, 1) * THREE.MathUtils.smoothstep(y, 0.89, 0.95)
      * (1 - THREE.MathUtils.smoothstep(y, 1.40, 1.46));
    if (alpha === 0) return p;
    const mean = { rx: 0, rz: 0, cz: 0 };
    let total = 0;
    for (let yk = 0.70; yk <= 1.515; yk += 0.004) {
      const w = gaussian(mapY(yk) - mapY(y)), q = profile(Math.max(yk, 0.89));
      mean.rx += q.rx * w; mean.rz += q.rz * w; mean.cz += q.cz * w;
      total += w;
    }
    return { rx: THREE.MathUtils.lerp(p.rx, mean.rx / total, alpha),
      rz: THREE.MathUtils.lerp(p.rz, mean.rz / total, alpha), cz: THREE.MathUtils.lerp(p.cz, mean.cz / total, alpha) };
  };
  /**
   * Smooths limb ring radii and skin weights along the limb in proportion to how much it was
   * shortened, so joint blends keep a physical width comparable to the limb radius.
   */
  const fairRows = (rows: TubeRow[], scale: number, fixed: (i: number) => boolean): TubeRow[] => {
    const alpha = THREE.MathUtils.clamp(1 - scale, 0, 1);
    if (alpha === 0) return rows;
    const along = rows.map((_, i) => rows.slice(1, i + 1).reduce((sum, row, k) => sum + row[0].distanceTo(rows[k][0]), 0));
    return rows.map((row, i) => {
      if (fixed(i)) return row;
      let rx = 0, rz = 0, total = 0, weightTotal = 0;
      const bones = new Map<number, number>();
      rows.forEach((other, k) => {
        const d = along[k] - along[i];
        const w = gaussian(d);
        rx += other[1] * w; rz += other[2] * w; total += w;
        const ww = Math.exp(-0.5 * (d / (WEIGHT_SIGMA * alpha)) ** 2);
        weightTotal += ww;
        other[3].indices.forEach((bone, q) => bones.set(bone, (bones.get(bone) ?? 0) + other[3].weights[q] * ww));
      });
      const own = new Map(row[3].indices.map((bone, q) => [bone, row[3].weights[q]]));
      const blended = [...new Set([...bones.keys(), ...own.keys()])].map((bone): [number, number] =>
        [bone, (own.get(bone) ?? 0) * (1 - alpha) + (bones.get(bone) ?? 0) / weightTotal * alpha]);
      return [row[0], THREE.MathUtils.lerp(row[1], rx / total, alpha), THREE.MathUtils.lerp(row[2], rz / total, alpha), pk(blended)];
    });
  };
  const baseYs = [0.89, 0.91, 0.94, 0.97, 1.00, 1.04, 1.08, 1.12, 1.16, 1.20,
    1.25, 1.30, 1.33, 1.36, 1.39, 1.42, 1.45, 1.475, 1.50, 1.5075, 1.515];
  const ys = baseYs.flatMap((y, i) => {
    if (y >= 1.50 || (y >= 1.30 && y < 1.45)) return [y];
    const dy = baseYs[i + 1] - y;
    const steps = Math.ceil(dy / 0.012);
    return Array.from({ length: steps }, (_, j) => y + dy * j / steps);
  });
  const coarseSegs = 40;
  const halfHole = 3;
  const inShoulder = (j: number) => (j + halfHole) % (coarseSegs / 2) < halfHole * 2;
  const columns = Array.from({ length: coarseSegs }, (_, j) => inShoulder(j) ? [j] : [j, j + 0.5]).flat();
  const coarseToFine = Array.from({ length: coarseSegs }, (_, j) => columns.indexOf(j));
  const segs = columns.length;
  const torso = ys.map((y, r) => {
    const p = fairedProfile(y);
    return (r ? columns : coarseToFine.map((j) => columns[j])).map((j) => {
      const a = j / coarseSegs * Math.PI * 2;
      const v = new THREE.Vector3(-Math.cos(a) * p.rx, y, p.cz + Math.sin(a) * p.rz);
      const weight = torsoWeight(v);
      v.y = mapY(y);
      return addVertex(v, weight);
    });
  });
  // Start the cervical loop at the nape, in the same angular order as the skull.
  const nape = columns.indexOf(coarseSegs * 0.75);
  const atNape = (ring: number[]) => [...ring.slice(nape), ...ring.slice(0, nape)];
  interfaces.neck = atNape(torso.at(-1)!);
  interfaces.neckBelow = atNape(torso.at(-2)!);
  const neckAngles = atNape(columns).map((j) =>
    ((j - columns[nape] + coarseSegs) % coarseSegs) / coarseSegs * Math.PI * 2 - Math.PI);
  const wrap = (j: number) => (j + segs) % segs;
  const shoulderLo = ys.indexOf(1.30), shoulderHi = ys.indexOf(1.45);
  // Stitch the dense torso to the original pelvis ring without changing its leg loops.
  for (let j = 0; j < coarseSegs; j++) {
    const k = (j + 1) % coarseSegs;
    const a = coarseToFine[j], b = coarseToFine[k], mid = wrap(a + 1);
    triangle(torso[0][j], torso[0][k], torso[1][a], "torso");
    if (mid !== b) triangle(torso[0][k], torso[1][mid], torso[1][a], "torso");
    triangle(torso[0][k], torso[1][b], torso[1][mid === b ? a : mid], "torso");
  }
  for (let r = 1; r < torso.length - 1; r++) {
    for (let j = 0; j < segs; j++) {
      const hole = r >= shoulderLo && r < shoulderHi && inShoulder(columns[j]);
      if (hole) continue;
      const k = wrap(j + 1);
      triangle(torso[r][j], torso[r][k], torso[r + 1][j], "torso");
      triangle(torso[r][k], torso[r + 1][k], torso[r + 1][j], "torso");
    }
  }
  const legScale = shape.limbScale?.legs ?? 1;
  /** Torso-to-thigh weight blend; shortened legs spread it over physical distance instead of rings. */
  const legRootBlend = (r: number, distance: number) => {
    const rings = [0.45, 0.75, 1][Math.min(r, 2)];
    if (legScale >= 1) return rings;
    const d = distance / Math.max(legScale, 0.6);
    const physical = d < 0.04 ? THREE.MathUtils.lerp(0.2, 0.45, d / 0.04)
      : d < 0.09 ? THREE.MathUtils.lerp(0.45, 0.75, (d - 0.04) / 0.05)
      : Math.min(1, THREE.MathUtils.lerp(0.75, 1, (d - 0.09) / 0.075));
    return Math.min(rings, physical);
  };
  const tubeFrames: Record<string, TubeFrame> = {};
  const extendTube = (boundary: number[], defs: TubeSegment[], slot: string) => {
    let previous = boundary;
    const center = boundary.reduce((v, i) => v.add(point(i)), new THREE.Vector3()).divideScalar(boundary.length);
    const tangent = defs[0].pos.clone().sub(center).normalize();
    const axis = slot.startsWith("legs_") ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), tangent);
    axis.addScaledVector(tangent, -axis.dot(tangent)).normalize();
    const angles = boundary.map((i) => {
      const v = point(i).sub(center);
      return Math.atan2(v.dot(new THREE.Vector3().crossVectors(tangent, axis)), v.dot(axis));
    });
    // Evenly spaced distal rings avoid inheriting a rectangular shoulder opening.
    const winding = Math.sin(angles[1] - angles[0]) >= 0 ? 1 : -1;
    const phase = shape.tubeFrames?.[slot]?.phase ?? angles[0];
    const axes: number[][] = [];
    tubeFrames[slot] = { phase, axes };
    for (let r = 0; r < defs.length; r++) {
      const d = defs[r];
      const prev = r === 0 ? center : defs[r - 1].pos;
      const next = defs[Math.min(r + 1, defs.length - 1)].pos;
      const t = next.clone().sub(prev).normalize();
      const canonicalAxis = shape.tubeFrames?.[slot]?.axes[r];
      if (canonicalAxis) axis.fromArray(canonicalAxis);
      axis.addScaledVector(t, -axis.dot(t)).normalize();
      axes.push(axis.toArray());
      const other = new THREE.Vector3().crossVectors(t, axis).normalize();
      const ring = boundary.map((_, j) => {
        const regular = phase + winding * j / boundary.length * Math.PI * 2;
        let a = angles[j];
        a += Math.round((regular - a) / (Math.PI * 2)) * Math.PI * 2;
        a = THREE.MathUtils.lerp(a, regular, Math.min(1, (r + 1) / 3));
        // The shared shoulder boundary blends into the torso; distal rings must not
        // inherit its chest weights, which collapse the deltoid when the arm is raised.
        const blend = slot.startsWith("arms_") ? 1 : legRootBlend(r, d.pos.distanceTo(center));
        const source = boundary[j];
        const weight = pk([...d.weight.indices.map((i, k) => [i, d.weight.weights[k] * blend]),
          ...skinIdx.slice(source * 4, source * 4 + 4).map((i, k) => [i, skinWgt[source * 4 + k] * (1 - blend)])]);
        const ellipse = d.pos.clone().addScaledVector(axis, Math.cos(a) * d.rx).addScaledVector(other, Math.sin(a) * d.rz);
        // Shortened thighs ease out of the torso rim's shape over a physical distance rather than
        // flaring to their full ellipse just below it.
        const settle = slot.startsWith("legs_") && legScale < 1
          ? THREE.MathUtils.smoothstep(d.pos.distanceTo(center), 0, LEG_ROOT_SETTLE) : 1;
        return addVertex(settle === 1 ? ellipse
          : point(source).setY(point(source).y + d.pos.y - center.y).lerp(ellipse, settle), weight);
      });
      bridge(previous, ring, slot, r);
      previous = ring;
    }
    if (!slot.startsWith("arms_")) {
      const last = defs[defs.length - 1];
      const cap = addVertex(last.pos, last.weight);
      for (let j = 0; j < previous.length; j++) triangle(previous[j], previous[(j + 1) % previous.length], cap, slot, defs.length);
    }
    return previous;
  };
  // The cut-out starts as a vertical rectangle on the torso wall, but the arm leaves ~38° below
  // horizontal; left as-is the junction pinches and rings the arm with a ridge. Re-seat the rim
  // on a tilted ellipse (armpit edge on the chest wall, top raised and pushed out to cap the
  // humeral head like the deltoid) and spread that offset into the surrounding torso.
  const shoulderSocket = { bottom: [0.183, 1.300], top: [0.238, 1.452], depth: 0.061, inset: 0.020, reach: 0.075 };
  const seatShoulder = (opening: number[], s: number, z0: number) => {
    const setPoint = (i: number, v: THREE.Vector3) => { positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z; };
    const { bottom, top, depth, inset, reach } = shoulderSocket;
    const lo = new THREE.Vector3(s * bottom[0], mapY(bottom[1]), z0), hi = new THREE.Vector3(s * top[0], mapY(top[1]), z0);
    const center = lo.clone().add(hi).multiplyScalar(0.5);
    const up = hi.clone().sub(lo), height = up.length() / 2;
    up.normalize();
    const rim = opening.map(point);
    const centroid = rim.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(rim.length);
    const angleOf = (v: THREE.Vector3) => Math.atan2(v.z - centroid.z, v.y - centroid.y);
    const winding = Math.sin(angleOf(rim[1]) - angleOf(rim[0])) >= 0 ? 1 : -1;
    const targets = rim.map((_, k) => {
      const a = angleOf(rim[0]) + winding * k / rim.length * Math.PI * 2;
      // Front and back of the cap curve medially around the ribcage instead of a flat plate.
      return center.clone().addScaledVector(up, Math.cos(a) * height)
        .add(new THREE.Vector3(-s * inset * Math.sin(a) ** 2, 0, Math.sin(a) * depth));
    });
    const offsets = targets.map((t, k) => t.clone().sub(rim[k]));
    const rimSet = new Set(opening);
    for (const row of torso.slice(0, -3)) for (const i of row) {
      if (rimSet.has(i)) continue;
      const p = point(i);
      if (p.x * s < 0.06) continue;
      let nearest = Infinity, total = 0;
      const shift = new THREE.Vector3();
      rim.forEach((v, k) => {
        const d2 = p.distanceToSquared(v);
        nearest = Math.min(nearest, d2);
        const w = 1 / (d2 * d2 + 1e-12);
        shift.addScaledVector(offsets[k], w);
        total += w;
      });
      const falloff = 1 - THREE.MathUtils.smoothstep(Math.sqrt(nearest), 0, reach);
      if (falloff > 0) setPoint(i, p.addScaledVector(shift, falloff / total));
    }
    opening.forEach((i, k) => setPoint(i, targets[k]));
  };
  for (const [side, s, column] of [["L", 1, coarseToFine[20]], ["R", -1, 0]] as const) {
    const opening = [];
    for (let j = column - halfHole; j < column + halfHole; j++) opening.push(torso[shoulderLo][wrap(j)]);
    for (let r = shoulderLo; r < shoulderHi; r++) opening.push(torso[r][wrap(column + halfHole)]);
    for (let j = column + halfHole; j > column - halfHole; j--) opening.push(torso[shoulderHi][wrap(j)]);
    for (let r = shoulderHi; r > shoulderLo; r--) opening.push(torso[r][wrap(column - halfHole)]);
    seatShoulder(opening, s, rig.worldRest.get(`UpperArm_${side}`).z);
    interfaces[`arm_${side}`] = opening;
    const upper = rig.worldRest.get(`UpperArm_${side}`);
    const elbow = rig.worldRest.get(`Forearm_${side}`);
    const hand = rig.worldRest.get(`Hand_${side}`);
    const at = (a: THREE.Vector3, b: THREE.Vector3, t: number) => new THREE.Vector3().lerpVectors(a, b, t);
    const w = (a: string, b: string, t: number) => pk([[bi(`${a}_${side}`), 1 - t], [bi(`${b}_${side}`), t]]);
    // Lengthened arms keep the root rings at their default physical distance from the socket, so
    // the torso-to-humerus blend isn't stretched across one long, unbendable strip.
    const armScale = shape.limbScale?.arms ?? 1;
    const root = Math.min(1, 1 / armScale);
    // Shortened arms keep their girth, so the canonical root ramp would turn the whole humeral
    // rotation within a few centimetres and fold the concave side of a raised arm. Their first
    // rings move out evenly and the Deltoid-to-UpperArm ramp continues down the shaft instead.
    const spread = THREE.MathUtils.clamp(1 - armScale, 0, 1);
    const layout = armLayout(shape.height ?? 1);
    const E = ELBOW_HELPER;
    // Shaft rings 0-3 share the humerus' rotation with the Deltoid helper; rings near the elbow
    // share the forearm's with the Elbow helper, so neither joint blends a full rotation at once.
    const humerus = (k: number) => w("UpperArm", "Deltoid", layout.deltoid[k]);
    const shaft = (k: number, f: number): TubeRow => {
      const [rx, rz] = upperArmRadius(f);
      return [at(upper, elbow, f), rx, rz, humerus(k)];
    };
    const defs = fairRows(<TubeRow[]>[
      // Ease from the torso rim into the humerus over two rings so the arm root doesn't fold.
      [at(upper, elbow, (0.20 + SHORT_ARM.ring0 * spread) * root), 0.060, 0.059, humerus(0)],
      [at(upper, elbow, (0.35 + SHORT_ARM.ring1 * spread) * root), 0.057, 0.056, humerus(1)],
      shaft(2, layout.ring2),
      shaft(3, layout.ring3),
      [at(upper, elbow, 0.86), 0.043, 0.043, w("UpperArm", "Elbow", E.above[0])],
      [at(upper, elbow, 0.96), 0.041, 0.041, w("UpperArm", "Elbow", E.above[1])],
      [elbow.clone(), 0.042, 0.042, w("Elbow", "Forearm", 0)],
      [at(elbow, hand, 0.14), 0.044, 0.043, w("Elbow", "Forearm", E.below)],
      [at(elbow, hand, 0.36), 0.041, 0.040, w("Forearm", "ForearmTwist", 0.4)],
      [at(elbow, hand, 0.68), 0.032, 0.033, w("Forearm", "ForearmTwist", 1)],
      [at(elbow, hand, 0.90), 0.024, 0.030, w("ForearmTwist", "Hand", 0.3)],
      [hand.clone(), 0.020, 0.035, w("ForearmTwist", "Hand", 0.75)],
    ], shape.limbScale?.arms ?? 1, (i) => i <= 1 || i >= 10).map(([pos, rx, rz, weight]): TubeSegment => ({ pos, rx, rz, weight }));
    const wrist = extendTube(opening, defs, `arms_${side}`);
    interfaces[`wrist_${side}`] = wrist;
    // Hands are rigid: build at the canonical wrist, then translate the wrist ring and hand together.
    const handShift = hand.clone().sub(handLayout(s).pHand);
    const moveVertex = (i: number, sign: number) => {
      for (let k = 0; k < 3; k++) positions[i * 3 + k] += sign * handShift.getComponent(k);
    };
    wrist.forEach((i) => moveVertex(i, -1));
    const firstHandVertex = positions.length / 3;
    const nails = buildJointedHand(rig, side, s, { addVertex, point, triangle, wrist });
    for (const nail of nails) nail.geo.translate(handShift.x, handShift.y, handShift.z);
    handParts.push(...nails);
    for (let i = firstHandVertex; i < positions.length / 3; i++) moveVertex(i, 1);
    wrist.forEach((i) => moveVertex(i, 1));
  }
  // Shoulder weights are laid out on the seated rest surface in physical distances. The acromion
  // and trapezius ride the clavicle, which carries the scapulohumeral rhythm (twist-helpers.ts),
  // and the Deltoid helper fades in toward the socket so the arm's rotation ramps evenly into the
  // torso instead of folding the top of the shoulder when the arm is raised.
  for (const [side, s] of SIDES) {
    const rim = interfaces[`arm_${side}`].map(point);
    const joint = rig.worldRest.get(`UpperArm_${side}`), sternal = rig.worldRest.get(`Clavicle_${side}`);
    const girdleLow = joint.y - Math.max(joint.y - mapY(1.27), GIRDLE_DROP_MIN);
    const armScale = shape.limbScale?.arms ?? 1;
    // Short arms hand more of the raised arm's rotation to the torso, over a wider band.
    const spread = THREE.MathUtils.clamp(1 - armScale, 0, 1);
    const rimWeight = DELTOID_RIM + SHORT_ARM.rim * spread;
    const topReach = DELTOID_REACH + SHORT_ARM.reach * spread;
    const underReach = THREE.MathUtils.clamp(DELTOID_REACH * armScale, DELTOID_REACH_UNDER, DELTOID_REACH);
    torso.forEach((row, r) => {
      for (const i of row) {
        const p = point(i);
        if (p.x * s <= 0) continue;
        const lateral = THREE.MathUtils.smoothstep((p.x - sternal.x) / (joint.x - sternal.x), 0, 1);
        const girdle = lateral * THREE.MathUtils.smoothstep(p.y, girdleLow, joint.y - 0.02)
          * (1 - THREE.MathUtils.smoothstep(ys[r], 1.45, 1.50));
        const rimDistance = Math.min(...rim.map((v) => v.distanceTo(p)));
        const reach = THREE.MathUtils.lerp(topReach, underReach, THREE.MathUtils.smoothstep(joint.y - p.y, 0, 0.08));
        const deltoid = rimWeight * (1 - THREE.MathUtils.smoothstep(rimDistance, 0, reach)) * lateral;
        if (girdle === 0 && deltoid === 0) continue;
        const w = torsoWeight(new THREE.Vector3(p.x, ys[r], p.z), { clavicle: GIRDLE_WEIGHT * girdle * (1 - deltoid), deltoid });
        skinIdx.splice(i * 4, 4, ...w.indices);
        skinWgt.splice(i * 4, 4, ...w.weights);
      }
    });
  }
  const bottom = torso[0];
  const crotch = [bottom[10]];
  for (let j = 1; j < 4; j++) {
    const t = j / 4;
    const p = point(bottom[10]).lerp(point(bottom[30]), t);
    p.y -= Math.sin(t * Math.PI) * (mapY(0.89) - mapY(0.848));
    crotch.push(addVertex(p, pk([[bi("Hips"), 1]])));
  }
  crotch.push(bottom[30]);
  for (const [side, s] of SIDES) {
    const opening = side === "L"
      ? [...bottom.slice(10, 31), ...crotch.slice(1, -1).reverse()]
      : [...bottom.slice(30), ...bottom.slice(0, 11), ...crotch.slice(1, -1)];
    opening.reverse();
    interfaces[`leg_${side}`] = opening;
    const thigh = rig.worldRest.get(`Thigh_${side}`);
    const knee = rig.worldRest.get(`Shin_${side}`);
    const ankle = rig.worldRest.get(`Foot_${side}`);
    const at = (a: THREE.Vector3, b: THREE.Vector3, t: number) => new THREE.Vector3().lerpVectors(a, b, t);
    const w = (a: string, b: string, t: number) => pk([[bi(`${a}_${side}`), 1 - t], [bi(`${b}_${side}`), t]]);
    const defs = fairRows(<TubeRow[]>[
      [at(thigh, knee, 0.15), 0.082, 0.087, pk([[bi("Hips"), 0.22], [bi(`Thigh_${side}`), 0.78]])],
      [at(thigh, knee, 0.28), 0.079, 0.083, pk([[bi("Hips"), 0.06], [bi(`Thigh_${side}`), 0.94]])],
      [at(thigh, knee, 0.46), 0.072, 0.076, w("Thigh", "Shin", 0)],
      [at(thigh, knee, 0.65), 0.065, 0.068, w("Thigh", "Shin", 0)],
      [at(thigh, knee, 0.84), 0.057, 0.060, w("Thigh", "Shin", 0.14)],
      [at(thigh, knee, 0.95), 0.053, 0.056, w("Thigh", "Shin", 0.38)],
      [knee.clone(), 0.053, 0.056, w("Thigh", "Shin", 0.55)],
      [at(knee, ankle, 0.12), 0.055, 0.058, w("Thigh", "Shin", 0.84)],
      [at(knee, ankle, 0.30), 0.057, 0.061, w("Shin", "Foot", 0)],
      [at(knee, ankle, 0.58), 0.046, 0.048, w("Shin", "Foot", 0)],
      [at(knee, ankle, 0.78), 0.035, 0.039, w("Shin", "Foot", 0.10)],
      [at(knee, ankle, 0.93), 0.030, 0.036, w("Shin", "Foot", 0.45)],
      [ankle.clone(), 0.031, 0.037, w("Shin", "Foot", 0.75)],
      [new THREE.Vector3(ankle.x, 0.045, -0.005), 0.034, 0.037, w("Shin", "Foot", 1)],
      [new THREE.Vector3(ankle.x, 0.038, 0.042), 0.039, 0.029, w("Foot", "Toe", 0.05)],
      [new THREE.Vector3(ankle.x, 0.030, 0.087), 0.048, 0.023, w("Foot", "Toe", 0.18)],
      [new THREE.Vector3(ankle.x, 0.026, 0.121), 0.052, 0.020, w("Foot", "Toe", 0.50)],
      [new THREE.Vector3(ankle.x, 0.024, 0.138), 0.049, 0.018, w("Foot", "Toe", 0.82)],
    ], shape.limbScale?.legs ?? 1, (i) => i >= 11).map(([pos, rx, rz, weight]): TubeSegment => ({ pos, rx, rz, weight }));
    extendTube(opening, defs, `legs_${side}`);
  }
  // Vertices inside the shoulder cutouts are intentionally unused; compact them.
  const used = [...new Set(indices)];
  const remap = new Map(used.map((i, j) => [i, j]));
  const take = (array: number[], size: number) => used.flatMap((i) => array.slice(i * size, (i + 1) * size));
  const geo = buildGeometryFromArrays(take(positions, 3), take(uvs, 2), take(colors, 3),
    take(skinIdx, 4), take(skinWgt, 4), indices.map((i) => remap.get(i)!));
  const pAttr = geo.attributes.position;
  const neighbors = Array.from({ length: pAttr.count }, () => new Set<number>());
  const geoIndex = geo.index!;
  for (let j = 0; j < geoIndex.count; j += 3) {
    const face = [geoIndex.getX(j), geoIndex.getX(j + 1), geoIndex.getX(j + 2)];
    for (const a of face) for (const b of face) if (a !== b) neighbors[a].add(b);
  }
  const isShoulder = (i: number) => {
    const y = pAttr.getY(i), x = Math.abs(pAttr.getX(i));
    return y > shoulderBand[0] && y < shoulderBand[1] && x > 0.12;
  };
  const shoulderBand = [mapY(1.26), mapY(1.49)], pelvisBand = [mapY(0.80), mapY(1.015)];
  const smoothVertices = used.map((_, i) => i).filter((i) => {
    const y = pAttr.getY(i), x = Math.abs(pAttr.getX(i));
    return (y > pelvisBand[0] && y < pelvisBand[1] && x < 0.24) || isShoulder(i);
  });
  const shoulderVertices = smoothVertices.filter(isShoulder);
  // Local Taubin relaxation rounds the junctions without opening seams or shrinking the body;
  // the shoulder gets extra passes to fair the rim into the first arm rings.
  const taubin = [0.45, -0.46, 0.45, -0.46, 0.45, -0.46];
  const passes: [number[], number][] = [...taubin.map((f): [number[], number] => [smoothVertices, f]), ...taubin.map((f): [number[], number] => [shoulderVertices, f])];
  for (const [verts, factor] of passes) {
    const updates = verts.map((i) => {
      const p = new THREE.Vector3().fromBufferAttribute(pAttr, i);
      const mean = new THREE.Vector3();
      for (const j of neighbors[i]) mean.add(new THREE.Vector3().fromBufferAttribute(pAttr, j));
      return p.lerp(mean.divideScalar(neighbors[i].size), factor);
    });
    verts.forEach((i, j) => pAttr.setXYZ(i, updates[j].x, updates[j].y, updates[j].z));
  }
  geo.computeVertexNormals();
  geo.userData.faceSlots = faceSlots;
  geo.userData.faceBands = faceBands;
  geo.userData.interfaces = Object.fromEntries(Object.entries(interfaces).map(([name, loop]) =>
    [name, loop.map((i) => remap.get(i))]));
  geo.userData.neckAngles = neckAngles;
  geo.userData.tubeFrames = tubeFrames;
  const parts: MeshPart[] = [{ geo, mat: 0, tag: "body" }, ...handParts];
  for (const [side, s] of SIDES) {
    const x = rig.worldRest.get(`Foot_${side}`).x;
    const toes = [
      { offset: -0.035, radius: 0.0135, length: 0.061 },
      { offset: -0.010, radius: 0.0105, length: 0.065 },
      { offset: 0.011, radius: 0.0095, length: 0.057 },
      { offset: 0.030, radius: 0.0085, length: 0.046 },
      { offset: 0.046, radius: 0.0070, length: 0.035 },
    ];
    toes.forEach((toe, index) => {
      const defs = [0, 0.25, 0.55, 0.82, 0.95, 1].map((t) => ({
        pos: new THREE.Vector3(x + s * toe.offset, 0.024 - t * 0.003, 0.128 + t * toe.length),
        rx: toe.radius * (t === 1 ? 0.12 : 1 - t * 0.3),
        rz: toe.radius * (t === 1 ? 0.12 : 0.85 - t * 0.2),
        weight: pk([[bi(`Foot_${side}`), (1 - t) * 0.2], [bi(`Toe_${side}`), 0.8 + t * 0.2]]),
      }));
      const toeGeo = buildChainTube(defs, 12, true, true);
      toeGeo.userData.faceSlots = Array(toeGeo.index!.count / 3).fill(`feet_${side}`);
      parts.push({ geo: toeGeo, mat: 0, tag: `toe_${side}_${index + 1}` });
    });
  }
  return parts;
}
