import { SIDES } from "../../../shared/sides.js";
import * as THREE from "three";
import { buildJointedHand } from "./hand.js";
import { buildGeometryFromArrays } from "../geometry/attributes.js";
import { buildChainTube } from "../geometry/loft.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";

// Shared indices, not overlapping caps, join the shoulders and bifurcated pelvis.
export function buildBaseBodyParts(rig) {
  const bi = (name) => rig.boneIndex.get(name);
  const pk = normalizeAndPackWeights;
  const positions = [], uvs = [], colors = [], skinIdx = [], skinWgt = [], indices = [];
  const faceSlots = [], faceBands = [];
  const interfaces: Record<string, number[]> = {};
  const handParts = [];
  const addVertex = (p, w) => {
    const i = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    uvs.push(p.x * 2 + 0.5, p.y / 1.78 + p.z);
    colors.push(1, 1, 1);
    skinIdx.push(...w.indices);
    skinWgt.push(...w.weights);
    return i;
  };
  const point = (i) => new THREE.Vector3().fromArray(positions, i * 3);
  const triangle = (a, b, c, slot, band = null) => {
    indices.push(a, b, c);
    faceSlots.push(slot);
    faceBands.push(band);
  };
  const bridge = (a, b, slot, band) => {
    if (a.length !== b.length) throw new Error("Body interface ring size mismatch.");
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      triangle(a[i], a[j], b[i], slot, band);
      triangle(a[j], b[j], b[i], slot, band);
    }
  };
  const spineWeight = (y) => {
    const anchors: [string, number][] = [["Hips", 0.96], ["Spine", 1.08], ["Spine1", 1.24],
      ["Chest", 1.38], ["Neck", 1.51], ["Head", 1.61]];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [a, ay] = anchors[i], [b, by] = anchors[i + 1];
      if (y <= by) {
        const t = THREE.MathUtils.smoothstep(y, ay, by);
        return pk([[bi(a), 1 - t], [bi(b), t]]);
      }
    }
    return pk([[bi("Head"), 1]]);
  };
  const torsoWeight = (p) => {
    const side = p.x >= 0 ? "L" : "R";
    const shoulder = THREE.MathUtils.smoothstep(Math.abs(p.x), 0.125, 0.205)
      * THREE.MathUtils.smoothstep(p.y, 1.27, 1.36)
      * (1 - THREE.MathUtils.smoothstep(p.y, 1.45, 1.50));
    const hip = (1 - THREE.MathUtils.smoothstep(p.y, 0.89, 1.015))
      * THREE.MathUtils.smoothstep(Math.abs(p.x), 0.015, 0.12) * 0.42;
    const base = spineWeight(p.y);
    return pk([...base.indices.map((i, k) => [i, base.weights[k] * (1 - shoulder * 0.75 - hip)]),
      [bi(`Clavicle_${side}`), shoulder * 0.30],
      [bi(`Deltoid_${side}`), shoulder * 0.45], [bi(`Thigh_${side}`), hip]]);
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
  const profile = (y) => {
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
  const inShoulder = (j) => (j + halfHole) % (coarseSegs / 2) < halfHole * 2;
  const columns = Array.from({ length: coarseSegs }, (_, j) => inShoulder(j) ? [j] : [j, j + 0.5]).flat();
  const coarseToFine = Array.from({ length: coarseSegs }, (_, j) => columns.indexOf(j));
  const segs = columns.length;
  const torso = ys.map((y, r) => {
    const p = profile(y);
    return (r ? columns : coarseToFine.map((j) => columns[j])).map((j) => {
      const a = j / coarseSegs * Math.PI * 2;
      const v = new THREE.Vector3(-Math.cos(a) * p.rx, y, p.cz + Math.sin(a) * p.rz);
      return addVertex(v, torsoWeight(v));
    });
  });
  // Start the cervical loop at the nape, in the same angular order as the skull.
  const nape = columns.indexOf(coarseSegs * 0.75);
  const atNape = (ring) => [...ring.slice(nape), ...ring.slice(0, nape)];
  interfaces.neck = atNape(torso.at(-1));
  interfaces.neckBelow = atNape(torso.at(-2));
  const neckAngles = atNape(columns).map((j) =>
    ((j - columns[nape] + coarseSegs) % coarseSegs) / coarseSegs * Math.PI * 2 - Math.PI);
  const wrap = (j) => (j + segs) % segs;
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
  const extendTube = (boundary, defs, slot) => {
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
    for (let r = 0; r < defs.length; r++) {
      const d = defs[r];
      const prev = r === 0 ? center : defs[r - 1].pos;
      const next = defs[Math.min(r + 1, defs.length - 1)].pos;
      const t = next.clone().sub(prev).normalize();
      axis.addScaledVector(t, -axis.dot(t)).normalize();
      const other = new THREE.Vector3().crossVectors(t, axis).normalize();
      const ring = boundary.map((_, j) => {
        const regular = angles[0] + winding * j / boundary.length * Math.PI * 2;
        let a = angles[j];
        a += Math.round((regular - a) / (Math.PI * 2)) * Math.PI * 2;
        a = THREE.MathUtils.lerp(a, regular, Math.min(1, (r + 1) / 3));
        // The shared shoulder boundary blends into the torso; distal rings must not
        // inherit its chest weights, which collapse the deltoid when the arm is raised.
        const blend = slot.startsWith("arms_") ? 1
          : [0.45, 0.75, 1][Math.min(r, 2)];
        const source = boundary[j];
        const weight = pk([...d.weight.indices.map((i, k) => [i, d.weight.weights[k] * blend]),
          ...skinIdx.slice(source * 4, source * 4 + 4).map((i, k) => [i, skinWgt[source * 4 + k] * (1 - blend)])]);
        return addVertex(d.pos.clone().addScaledVector(axis, Math.cos(a) * d.rx)
          .addScaledVector(other, Math.sin(a) * d.rz), weight);
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
  const seatShoulder = (opening, s, z0) => {
    const setPoint = (i, v) => { positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z; };
    const { bottom, top, depth, inset, reach } = shoulderSocket;
    const lo = new THREE.Vector3(s * bottom[0], bottom[1], z0), hi = new THREE.Vector3(s * top[0], top[1], z0);
    const center = lo.clone().add(hi).multiplyScalar(0.5);
    const up = hi.clone().sub(lo), height = up.length() / 2;
    up.normalize();
    const rim = opening.map(point);
    const centroid = rim.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(rim.length);
    const angleOf = (v) => Math.atan2(v.z - centroid.z, v.y - centroid.y);
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
    const at = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);
    const w = (a, b, t) => pk([[bi(`${a}_${side}`), 1 - t], [bi(`${b}_${side}`), t]]);
    const defs = [
      // Ease from the torso rim into the humerus over two rings so the arm root doesn't fold.
      [at(upper, elbow, 0.20), 0.060, 0.059, w("Deltoid", "UpperArm", 0.30)],
      [at(upper, elbow, 0.35), 0.057, 0.056, w("Deltoid", "UpperArm", 0.72)],
      [at(upper, elbow, 0.50), 0.052, 0.051, w("UpperArm", "Forearm", 0)],
      [at(upper, elbow, 0.68), 0.047, 0.047, w("UpperArm", "Forearm", 0.04)],
      [at(upper, elbow, 0.86), 0.043, 0.043, w("UpperArm", "Forearm", 0.22)],
      [at(upper, elbow, 0.96), 0.041, 0.041, w("UpperArm", "Forearm", 0.43)],
      [elbow.clone(), 0.042, 0.042, w("UpperArm", "Forearm", 0.55)],
      [at(elbow, hand, 0.14), 0.044, 0.043, w("UpperArm", "Forearm", 0.82)],
      [at(elbow, hand, 0.36), 0.041, 0.040, w("Forearm", "ForearmTwist", 0.4)],
      [at(elbow, hand, 0.68), 0.032, 0.033, w("Forearm", "ForearmTwist", 1)],
      [at(elbow, hand, 0.90), 0.024, 0.030, w("ForearmTwist", "Hand", 0.3)],
      [hand.clone(), 0.020, 0.035, w("ForearmTwist", "Hand", 0.75)],
    ].map(([pos, rx, rz, weight]) => ({ pos, rx, rz, weight }));
    const wrist = extendTube(opening, defs, `arms_${side}`);
    interfaces[`wrist_${side}`] = wrist;
    handParts.push(...buildJointedHand(rig, side, s, { addVertex, point, triangle, wrist }));
  }
  const bottom = torso[0];
  const crotch = [bottom[10]];
  for (let j = 1; j < 4; j++) {
    const t = j / 4;
    const p = point(bottom[10]).lerp(point(bottom[30]), t);
    p.y -= Math.sin(t * Math.PI) * 0.042;
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
    const at = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);
    const w = (a, b, t) => pk([[bi(`${a}_${side}`), 1 - t], [bi(`${b}_${side}`), t]]);
    const defs = [
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
    ].map(([pos, rx, rz, weight]) => ({ pos, rx, rz, weight }));
    extendTube(opening, defs, `legs_${side}`);
  }
  // Vertices inside the shoulder cutouts are intentionally unused; compact them.
  const used = [...new Set(indices)];
  const remap = new Map(used.map((i, j) => [i, j]));
  const take = (array, size) => used.flatMap((i) => array.slice(i * size, (i + 1) * size));
  const geo = buildGeometryFromArrays(take(positions, 3), take(uvs, 2), take(colors, 3),
    take(skinIdx, 4), take(skinWgt, 4), indices.map((i) => remap.get(i)));
  const pAttr = geo.attributes.position;
  const neighbors = Array.from({ length: pAttr.count }, () => new Set<number>());
  for (let j = 0; j < geo.index.count; j += 3) {
    const face = [geo.index.getX(j), geo.index.getX(j + 1), geo.index.getX(j + 2)];
    for (const a of face) for (const b of face) if (a !== b) neighbors[a].add(b);
  }
  const isShoulder = (i) => {
    const y = pAttr.getY(i), x = Math.abs(pAttr.getX(i));
    return y > 1.26 && y < 1.49 && x > 0.12;
  };
  const smoothVertices = used.map((_, i) => i).filter((i) => {
    const y = pAttr.getY(i), x = Math.abs(pAttr.getX(i));
    return (y > 0.80 && y < 1.015 && x < 0.24) || isShoulder(i);
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
  const parts = [{ geo, mat: 0, tag: "body" }, ...handParts];
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
      toeGeo.userData.faceSlots = Array(toeGeo.index.count / 3).fill(`feet_${side}`);
      parts.push({ geo: toeGeo, mat: 0, tag: `toe_${side}_${index + 1}` });
    });
  }
  return parts;
}
