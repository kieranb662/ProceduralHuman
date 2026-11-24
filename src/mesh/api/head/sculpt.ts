import * as THREE from "three";
import { headTargetTags, validateHeadDesign } from "./design.js";
import { gauss, smoothstep } from "../../../shared/math.js";

export function headSculptTopology(geo) {
  if (geo.userData.sculptTopology) return geo.userData.sculptTopology;
  const pos = geo.attributes.position;
  const buckets = new Map();
  const owner = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(7)},${pos.getY(i).toFixed(7)},${pos.getZ(i).toFixed(7)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    const group = buckets.get(key);
    group.push(i);
    owner[i] = group[0];
  }
  const neighbors = new Map([...buckets.values()].map((group) => [group[0], new Set()]));
  const idx = geo.index;
  for (let i = 0; i < idx.count; i += 3) {
    const tri = [owner[idx.getX(i)], owner[idx.getX(i + 1)], owner[idx.getX(i + 2)]];
    for (const a of tri) for (const b of tri) if (a !== b) neighbors.get(a).add(b);
  }
  const topology = { groups: [...buckets.values()], neighbors, owner };
  geo.userData.sculptTopology = topology;
  return topology;
}

export function updateHeadPartNormals(part) {
  part.geo.computeVertexNormals();
  const normals = part.geo.attributes.normal;
  const average = new THREE.Vector3(), n = new THREE.Vector3();
  for (const group of headSculptTopology(part.geo).groups) {
    if (group.length < 2) continue;
    average.set(0, 0, 0);
    for (const i of group) average.add(n.fromBufferAttribute(normals, i));
    average.normalize();
    for (const i of group) normals.setXYZ(i, average.x, average.y, average.z);
  }
  normals.needsUpdate = true;
}

export function syncHeadMouthRim(parts) {
  const head = parts.find((part) => part.tag === "head");
  const cavity = parts.find((part) => part.tag === "cavity");
  const loop = head.geo.userData.mouthLoopIndices;
  if (loop.length < 8) return;
  const h = head.geo.attributes.position, c = cavity.geo.attributes.position;
  for (let i = 0; i <= loop.length; i++) {
    const vi = loop[i % loop.length];
    c.setXYZ(i, h.getX(vi), h.getY(vi), h.getZ(vi));
  }
  c.needsUpdate = true;
}

export function applyHeadSculptStroke(parts, stroke) {
  const tags = headTargetTags(stroke.target);
  const center = new THREE.Vector3(...stroke.center);
  const mirrored = center.clone(); mirrored.x = 2 * (stroke.mirrorX ?? 0) - center.x;
  const displacement = new THREE.Vector3(...stroke.delta);
  const mirroredDelta = displacement.clone(); mirroredDelta.x *= -1;
  const p = new THREE.Vector3(), average = new THREE.Vector3(), neighbor = new THREE.Vector3();
  let changed = 0;
  for (const part of parts) {
    if (!tags.includes(part.tag)) continue;
    const pos = part.geo.attributes.position;
    const before = stroke.mode === "smooth" ? new Float32Array(pos.array) : null;
    const topology = before ? headSculptTopology(part.geo) : null;
    const attachment = part.geo.userData.neckAttachment;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const d1 = p.distanceToSquared(center);
      const d2 = stroke.mirror ? p.distanceToSquared(mirrored) : Infinity;
      const distance = Math.min(d1, d2);
      if (distance >= stroke.radius * stroke.radius) continue;
      const weight = Math.pow(1 - distance / (stroke.radius * stroke.radius), 2) * (attachment?.[i] ?? 1);
      if (!weight) continue;
      if (before) {
        const neighbors = topology.neighbors.get(topology.owner[i]);
        if (!neighbors.size) continue;
        average.set(0, 0, 0);
        for (const vi of neighbors) average.add(neighbor.fromArray(before, vi * 3));
        average.divideScalar(neighbors.size);
        p.lerp(average, weight * stroke.strength * 0.35);
      } else {
        p.addScaledVector(d2 < d1 ? mirroredDelta : displacement, weight);
      }
      pos.setXYZ(i, p.x, p.y, p.z);
      changed++;
    }
    pos.needsUpdate = true;
  }
  if (changed) syncHeadMouthRim(parts);
  return changed;
}

export function applyHeadDesign(parts, rig, design) {
  validateHeadDesign(design);
  const pivots = {
    all: [0, 1.662, 0.008], skin: [0, 1.662, 0.008], eyes: [0, 1.666, 0.10],
    lidTop: [0, 1.666, 0.10], lidBot: [0, 1.666, 0.10], brows: [0, 1.693, 0.112],
    ears: [0, 1.656, -0.008], hair: [0, 1.662, 0.008],
    teeth: [0, 1.595, 0.112], cavity: [0, 1.595, 0.10],
  };
  const transformPoint = (point, pivot, t) => {
    if (!t) return point;
    point.sub(pivot).multiply(new THREE.Vector3(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1)).add(pivot);
    return point.add(new THREE.Vector3((t.x ?? 0) / 1000, (t.y ?? 0) / 1000, (t.z ?? 0) / 1000));
  };
  const contour = (point) => {
    const { x, y, z } = point;
    const ax = Math.abs(x), side = Math.sign(x);
    const f = design.features;
    const front = smoothstep(0.01, 0.07, z);
    const g = (cx, cy, sx, sy) => gauss(cx, y - cy, 0, sx, sy, 1) * front / 1000;
    point.x += side * ((f.noseWidth ?? 0) * g(ax - 0.013, 1.628, 0.012, 0.016) +
      (f.jawWidth ?? 0) * g(ax - 0.055, 1.594, 0.030, 0.027));
    point.z += (f.forehead ?? 0) * g(x, 1.710, 0.070, 0.034) +
      (f.noseTip ?? 0) * g(x, 1.632, 0.014, 0.016) +
      (f.cheeks ?? 0) * g(ax - 0.050, 1.644, 0.025, 0.023) +
      (f.chin ?? 0) * g(x, 1.563, 0.030, 0.018) +
      (f.lips ?? 0) * g(x, 1.595, 0.028, 0.011);
    return point;
  };
  const shapePoint = (point, tag, useContour) => {
    if (useContour) contour(point);
    transformPoint(point, new THREE.Vector3(...pivots.all), design.transforms.all);
    for (const [target, t] of Object.entries(design.transforms)) {
      if (target === "all" || !headTargetTags(target).includes(tag)) continue;
      const pivot = transformPoint(new THREE.Vector3(...pivots[target]), new THREE.Vector3(...pivots.all), design.transforms.all);
      transformPoint(point, pivot, t);
    }
    return point;
  };
  const hasEdits = Object.keys(design.transforms).length || Object.keys(design.features).length || design.strokes.length;
  if (!hasEdits) return;
  const p = new THREE.Vector3();
  const rest = new THREE.Vector3();
  for (const part of parts) {
    const pos = part.geo.attributes.position;
    const attachment = part.geo.userData.neckAttachment;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      rest.copy(p);
      shapePoint(p, part.tag, ["head", "cavity", "tongue", "brow_L", "brow_R"].includes(part.tag));
      if (attachment) p.lerpVectors(rest, p, attachment[i]);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
  }
  syncHeadMouthRim(parts);
  for (const stroke of design.strokes) applyHeadSculptStroke(parts, stroke);
  for (const part of parts) updateHeadPartNormals(part);

  const boneTags = {
    Head: null, Jaw: "head", UpperLip_C: "head", UpperLip_L: "head", UpperLip_R: "head",
    TongueBase: "tongue", TongueMid: "tongue", TongueTip: "tongue",
    LowerLip_C: "head", LowerLip_L: "head", LowerLip_R: "head", MouthCorner_L: "head", MouthCorner_R: "head",
    NoseTip: "head", Nostril_L: "head", Nostril_R: "head",
    Eye_L: "eye_L", Eye_R: "eye_R", EyelidTop_L: "lidTop_L", EyelidTop_R: "lidTop_R",
    EyelidBot_L: "lidBot_L", EyelidBot_R: "lidBot_R", Brow_L: "brow_L", Brow_R: "brow_R",
    Ear_L: "ear_L", Ear_R: "ear_R",
  };
  for (const [name, tag] of Object.entries(boneTags)) {
    const point = rig.worldRest.get(name);
    shapePoint(point, tag, tag === "head" || tag === "tongue" || tag?.startsWith("brow"));
    for (const stroke of design.strokes) {
      if (stroke.mode === "smooth" || !headTargetTags(stroke.target).includes(tag)) continue;
      const center = new THREE.Vector3(...stroke.center);
      const mirror = center.clone(); mirror.x = 2 * (stroke.mirrorX ?? 0) - center.x;
      const d1 = point.distanceToSquared(center), d2 = stroke.mirror ? point.distanceToSquared(mirror) : Infinity;
      if (Math.min(d1, d2) >= stroke.radius * stroke.radius) continue;
      const delta = new THREE.Vector3(...stroke.delta);
      if (d2 < d1) delta.x *= -1;
      point.addScaledVector(delta, Math.pow(1 - Math.min(d1, d2) / (stroke.radius * stroke.radius), 2));
    }
  }
  for (const bone of rig.bones) {
    if (!(bone.name in boneTags)) continue;
    bone.position.copy(rig.worldRest.get(bone.name));
    if (bone.parent?.isBone) bone.position.sub(rig.worldRest.get(bone.parent.name));
  }
}
