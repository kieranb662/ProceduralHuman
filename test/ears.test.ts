import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyHeadDesign, buildEarGeometry, buildHeadAndFaceParts, createHumanoidSkeleton, type EarAdjustments } from "../src/index.js";

function ear(side: "L" | "R" = "L", attached = false) {
  const rig = createHumanoidSkeleton();
  return buildEarGeometry(rig.worldRest.get(`Ear_${side}`), side === "L" ? 1 : -1, `Ear_${side}`, rig.boneIndex, attached);
}

function sample(geo: THREE.BufferGeometry, u: number, v: number) {
  const uv = geo.attributes.uv;
  let closest = 0, distance = Infinity;
  for (let i = 0; i < uv.count / 2; i++) {
    const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
    if (d < distance) { closest = i; distance = d; }
  }
  return new THREE.Vector3().fromBufferAttribute(geo.attributes.position, closest);
}

describe("polar ear geometry", () => {
  it.each([["L", false], ["R", false], ["L", true], ["R", true]] as const)("builds a closed, outward-wound %s shell (attached: %s)", (side, attached) => {
    const geo = ear(side, attached);
    const pos = geo.attributes.position, idx = geo.index!;
    const edges = new Map<string, { count: number; direction: number }>();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let volume = 0, minArea = Infinity;
    for (let i = 0; i < idx.count; i += 3) {
      const tri = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      a.fromBufferAttribute(pos, tri[0]); b.fromBufferAttribute(pos, tri[1]); c.fromBufferAttribute(pos, tri[2]);
      volume += a.dot(cross.crossVectors(b, c)) / 6;
      minArea = Math.min(minArea, cross.crossVectors(b.sub(a), c.sub(a)).length() / 2);
      for (let j = 0; j < 3; j++) {
        const from = tri[j], to = tri[(j + 1) % 3];
        const key = `${Math.min(from, to)},${Math.max(from, to)}`;
        const edge = edges.get(key) ?? { count: 0, direction: 0 };
        edge.count++;
        edge.direction += from < to ? 1 : -1;
        edges.set(key, edge);
      }
    }
    expect(volume).toBeGreaterThan(0.000001);
    expect(minArea).toBeGreaterThan(1e-10);
    expect([...edges.values()].every((edge) => edge.count === 2 && edge.direction === 0)).toBe(true);
    for (const attr of Object.values(geo.attributes)) expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
    const weights = geo.attributes.skinWeight;
    for (let i = 0; i < weights.count; i++) {
      expect(weights.getX(i) + weights.getY(i)).toBeCloseTo(1);
    }
    expect(geo.attributes.normal.getX(0) * (side === "L" ? 1 : -1)).toBeGreaterThan(0.5);
    geo.dispose();
  });

  describe("ear size and placement", () => {
    const extremes = [false, true].flatMap((attachedEarlobes) => [0.7, 1.3].flatMap((size) =>
      [-20, 20].flatMap((verticalOffset) => [-15, 15].map((depthOffset) =>
        ({ attachedEarlobes, ears: { size, verticalOffset, depthOffset } })))));
    it.each(extremes)("keeps the ear base intersecting the actual skull at slider extremes: %o", (adjustment) => {
      const rig = createHumanoidSkeleton();
      const parts = buildHeadAndFaceParts(rig, { ...adjustment, transforms: {}, features: {}, strokes: [] });
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const head = new THREE.Mesh(parts.find((part) => part.tag === "head")!.geo, material);
      const ray = new THREE.Raycaster();
      for (const [side, sign] of [["L", 1], ["R", -1]] as const) {
        const geo = parts.find((part) => part.tag === `ear_${side}`)!.geo;
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        const half = pos.count / 2;
        for (const angle of [0.65, 0.75, 0.85]) {
          let closest = 0, distance = Infinity;
          for (let i = 0; i < half; i++) {
            const d = (uv.getX(i) - 0.95) ** 2 + (uv.getY(i) - angle) ** 2;
            if (d < distance) { closest = i; distance = d; }
          }
          const back = closest + half;
          ray.set(new THREE.Vector3(sign, pos.getY(back), pos.getZ(back)), new THREE.Vector3(-sign, 0, 0));
          const hit = ray.intersectObject(head)[0];
          expect(hit, `Missing skull under ${side} ear`).toBeDefined();
          expect(sign * (pos.getX(back) - hit.point.x)).toBeLessThan(-0.0005);
          expect(sign * (pos.getX(closest) - hit.point.x)).toBeGreaterThan(0.0001);
          expect(geo.attributes.skinWeight.getX(back)).toBe(0);
          expect(geo.attributes.skinWeight.getY(back)).toBe(1);
        }
        expect(rig.worldRest.get(`Ear_${side}`).z).toBeCloseTo(-0.008 + adjustment.ears.depthOffset / 1000);
        expect(rig.worldRest.get(`Ear_${side}`).y).toBeCloseTo(1.656 + adjustment.ears.verticalOffset / 1000);
      }
      for (const part of parts) part.geo.dispose();
      rig.skeleton.dispose();
      material.dispose();
    });

    it.each([0, 30, 45, 90])("turns both ear surfaces toward the face by %i degrees", (facingAngle) => {
      const rig = createHumanoidSkeleton();
      const parts = (["L", "R"] as const).map((side) => ({
        tag: `ear_${side}`, mat: 5,
        geo: buildEarGeometry(rig.worldRest.get(`Ear_${side}`), side === "L" ? 1 : -1, `Ear_${side}`, rig.boneIndex),
      }));
      applyHeadDesign(parts, rig, {
        ears: { size: 1.2, verticalOffset: -5, depthOffset: 4, facingAngle },
        transforms: {}, features: {}, strokes: [],
      });
      for (const [index, side] of (["L", "R"] as const).entries()) {
        const pos = parts[index].geo.attributes.position;
        const outward = new THREE.Vector3().fromBufferAttribute(pos, 0)
          .sub(new THREE.Vector3().fromBufferAttribute(pos, pos.count / 2)).normalize();
        const sign = side === "L" ? 1 : -1;
        expect(outward.x).toBeCloseTo(sign * Math.cos(THREE.MathUtils.degToRad(facingAngle)), 4);
        expect(outward.z).toBeCloseTo(Math.sin(THREE.MathUtils.degToRad(facingAngle)), 4);
        const angle = THREE.MathUtils.degToRad(facingAngle);
        expect(rig.worldRest.get(`Ear_${side}`).z).toBeCloseTo(
          -0.004 + 1.2 * (0.012 * (1 - Math.cos(angle)) - 0.002 * Math.sin(angle)), 7,
        );
        parts[index].geo.dispose();
      }
      rig.skeleton.dispose();
    });

    const facingExtremes = [45, 90].flatMap((facingAngle) => extremes.map((design) => ({
      ...design, ears: { ...design.ears, facingAngle },
    })));
    it.each(facingExtremes)("keeps the rotated ears attached at size and placement extremes: %o", (adjustment) => {
      const rig = createHumanoidSkeleton();
      const parts = buildHeadAndFaceParts(rig, { ...adjustment, transforms: {}, features: {}, strokes: [] });
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const head = new THREE.Mesh(parts.find((part) => part.tag === "head")!.geo, material);
      const ray = new THREE.Raycaster();
      for (const [side, sign] of [["L", 1], ["R", -1]] as const) {
        const geo = parts.find((part) => part.tag === `ear_${side}`)!.geo;
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        const half = pos.count / 2;
        const at = (u: number, v: number) => {
          let closest = 0, distance = Infinity;
          for (let i = 0; i < half; i++) {
            const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
            if (d < distance) { closest = i; distance = d; }
          }
          return closest;
        };
        const surfaceDistance = (vertex: number) => {
          ray.set(new THREE.Vector3(sign, pos.getY(vertex), pos.getZ(vertex)), new THREE.Vector3(-sign, 0, 0));
          const hit = ray.intersectObject(head)[0];
          expect(hit, `Missing skull under ${side} ear`).toBeDefined();
          return sign * (pos.getX(vertex) - hit.point.x);
        };
        const anterior = at(0.95, 0.75), posterior = at(0.95, 0.25);
        expect(surfaceDistance(anterior + half)).toBeLessThan(-0.0005);
        expect(surfaceDistance(posterior)).toBeGreaterThan(0.003);
        expect(geo.attributes.skinWeight.getX(anterior + half)).toBe(0);

        const front = 0, back = half;
        const lateral = surfaceDistance(front) - surfaceDistance(back);
        const forward = pos.getZ(front) - pos.getZ(back);
        expect(THREE.MathUtils.radToDeg(Math.atan2(forward, lateral))).toBeCloseTo(adjustment.ears.facingAngle, 1);
      }
      for (const part of parts) part.geo.dispose();
      rig.skeleton.dispose();
      material.dispose();
    });

    it("leaves the neutral ear unchanged when all adjustments are at their defaults", () => {
      const rig = createHumanoidSkeleton();
      const geo = buildEarGeometry(rig.worldRest.get("Ear_L"), 1, "Ear_L", rig.boneIndex);
      const position = geo.attributes.position.array.slice(), normal = geo.attributes.normal.array.slice();
      applyHeadDesign([{ tag: "ear_L", mat: 5, geo }], rig, {
        ears: { size: 1, depthOffset: 0, verticalOffset: 0, facingAngle: 0 }, transforms: {}, features: {}, strokes: [],
      });
      expect(geo.attributes.position.array).toEqual(position);
      expect(geo.attributes.normal.array).toEqual(normal);
      geo.dispose();
    });

    const adjustments: EarAdjustments[] = [
      { size: 1.3 },
      { size: 0.7 },
      { verticalOffset: 12 },
      { depthOffset: 8 },
      { size: 1.15, verticalOffset: -6, depthOffset: -4 },
    ];
    it.each(adjustments)("adjusts each ear and its bone symmetrically: %o", (adjustment) => {
      const rig = createHumanoidSkeleton();
      const roots = {
        L: rig.worldRest.get("Ear_L").clone(),
        R: rig.worldRest.get("Ear_R").clone(),
      };
      const parts = (["L", "R"] as const).map((side) => ({
        tag: `ear_${side}`, mat: 5,
        geo: buildEarGeometry(roots[side], side === "L" ? 1 : -1, `Ear_${side}`, rig.boneIndex, true),
      }));
      const original = parts.map((part) => part.geo.attributes.position.clone());
      applyHeadDesign(parts, rig, { ears: adjustment, transforms: {}, features: {}, strokes: [] });

      const { size = 1, verticalOffset = 0, depthOffset = 0 } = adjustment;
      for (const [index, side] of (["L", "R"] as const).entries()) {
        const translation = new THREE.Vector3(0, verticalOffset / 1000, depthOffset / 1000);
        const position = parts[index].geo.attributes.position;
        for (const vertex of [0, 600, 2400, position.count - 1]) {
          const expected = new THREE.Vector3().fromBufferAttribute(original[index], vertex)
            .sub(roots[side]).multiplyScalar(size).add(roots[side]).add(translation);
          const actual = new THREE.Vector3().fromBufferAttribute(position, vertex);
          expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
        }
        expect(rig.worldRest.get(`Ear_${side}`).distanceTo(roots[side].clone().add(translation))).toBeLessThan(1e-9);
        const expectedLocal = roots[side].clone().add(translation).sub(rig.worldRest.get("Head"));
        expect(rig.boneMap.get(`Ear_${side}`).position.distanceTo(expectedLocal)).toBeLessThan(1e-9);
        parts[index].geo.dispose();
      }
      expect(rig.worldRest.get("Head").toArray()).toEqual([0, 1.56, 0.004]);
    });

    it("composes ear adjustments with existing whole-head and ear transforms", () => {
      const rig = createHumanoidSkeleton();
      const root = rig.worldRest.get("Ear_L").clone();
      const geo = buildEarGeometry(root, 1, "Ear_L", rig.boneIndex);
      const before = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, 2400);
      const wholePivot = new THREE.Vector3(0, 1.662, 0.008);
      const earPivot = new THREE.Vector3(0, 1.656, -0.008);
      const transform = (p: THREE.Vector3, pivot: THREE.Vector3, sx: number, sy: number, x: number, y: number) =>
        p.sub(pivot).multiply(new THREE.Vector3(sx, sy, 1)).add(pivot).add(new THREE.Vector3(x / 1000, y / 1000, 0));
      const expected = before.sub(root).multiplyScalar(1.2).add(root).add(new THREE.Vector3(0, 0.006, 0.004));
      transform(expected, wholePivot, 1.05, 0.95, 2, 3);
      transform(earPivot, wholePivot, 1.05, 0.95, 2, 3);
      transform(expected, earPivot, 1.1, 0.9, -1, 2);
      applyHeadDesign([{ tag: "ear_L", mat: 5, geo }], rig, {
        ears: { size: 1.2, depthOffset: 4, verticalOffset: 6 },
        transforms: { all: { sx: 1.05, sy: 0.95, x: 2, y: 3 }, ears: { sx: 1.1, sy: 0.9, x: -1, y: 2 } },
        features: {}, strokes: [],
      });
      expect(new THREE.Vector3().fromBufferAttribute(geo.attributes.position, 2400).distanceTo(expected)).toBeLessThan(1e-6);
      geo.dispose();
    });
  });

  it("sculpts the concha, branching antihelix and backward-curling helix", () => {
    const geo = ear();
    expect(sample(geo, 0.6, 0.25).x - sample(geo, 0.25, 0.25).x).toBeGreaterThan(0.003);
    expect(sample(geo, 0.9, 0).x - sample(geo, 0.8, 0).x).toBeGreaterThan(0.003);
    expect(sample(geo, 0.9, 0).x - sample(geo, 1, 0).x).toBeGreaterThan(0.005);
    // Both superior branches rise above the triangular fossa between them.
    for (const [a, b] of [[0.2, 0.72], [-0.27, 0.54]]) {
      const v = (Math.atan2(a, b) / (Math.PI * 2) + 1) % 1;
      expect(sample(geo, Math.hypot(a, b), v).x - sample(geo, 0.65, 0).x).toBeGreaterThan(0.0015);
    }
    const upperWidth = Math.abs(sample(geo, 1, 0.125).z - sample(geo, 1, 0.875).z);
    const lowerWidth = Math.abs(sample(geo, 1, 0.375).z - sample(geo, 1, 0.625).z);
    expect(upperWidth).toBeGreaterThan(lowerWidth * 1.15);
    geo.dispose();
  });

  it("mirrors the anatomy and changes only the lower ear when attaching lobes", () => {
    const free = ear(), attached = ear("L", true), right = ear("R");
    const p = free.attributes.position, q = right.attributes.position;
    for (let i = 0; i < p.count; i++) {
      expect(p.getX(i)).toBeCloseTo(-q.getX(i), 7);
      expect(p.getY(i)).toBe(q.getY(i));
      expect(p.getZ(i)).toBe(q.getZ(i));
    }
    expect(sample(attached, 1, 0)).toEqual(sample(free, 1, 0));
    const freeLobe = sample(free, 1, 0.5), attachedLobe = sample(attached, 1, 0.5);
    expect(freeLobe.x - attachedLobe.x).toBeGreaterThan(0.007);
    expect(attachedLobe.y - freeLobe.y).toBeGreaterThan(0.003);
    expect(attachedLobe.z - freeLobe.z).toBeGreaterThan(0.003);
    for (const geo of [free, attached, right]) geo.dispose();
  });
});
