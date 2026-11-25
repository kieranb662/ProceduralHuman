import * as THREE from "three";
import type { HumanoidRig } from "../../../rigging/api/types.js";
import type { MeshPart } from "../types.js";
import { buildBaseBodyParts } from "./body-parts.js";
import { restoreNeckJoinNormals } from "../merge.js";

/** Relative to the default character's full, neutral mesh height. */
export function validateHeight(height: number): number {
  if (!Number.isFinite(height) || height < 0.5 || height > 2) {
    throw new Error("Height must be a finite multiplier between 0.5 and 2.");
  }
  return height;
}

const ANKLE_Y = 0.082, NECK_Y = 1.515;
/** Shafts absorb the height change; the shoulder girdle (whose socket must still fit the
 *  unchanged humeral radius) and the pelvis (hip joints, glutes) keep most of their length. */
const smooth = THREE.MathUtils.smoothstep;
const flexibility = (y: number) => 1
  - 0.15 * smooth(y, 0.80, 0.86) * (1 - smooth(y, 0.98, 1.04))
  - 0.75 * smooth(y, 1.24, 1.30) * (1 - smooth(y, 1.46, 1.50));
const MIN_SHAFT_SCALE = 0.25;

/**
 * Monotonic map of canonical body heights (feet below the ankle and everything above the
 * neck rim are rigid). Stiff bands are relaxed toward uniform scaling only when the shafts
 * would otherwise collapse.
 */
function createHeightMap(shift: number) {
  const steps = 1024, dy = (NECK_Y - ANKLE_Y) / steps;
  const cumulative = new Float64Array(steps + 1), rigid = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) {
    const y = ANKLE_Y + (i - 0.5) * dy;
    cumulative[i] = cumulative[i - 1] + flexibility(y) * dy;
    rigid[i] = rigid[i - 1] + (1 - flexibility(y)) * dy;
  }
  const length = NECK_Y - ANKLE_Y, stiff = rigid[steps];
  // Shaft scale is 1 + shift / (length - k * stiff); keep it >= MIN_SHAFT_SCALE when shrinking.
  const k = shift >= 0 ? 1 : THREE.MathUtils.clamp((length + shift / (1 - MIN_SHAFT_SCALE)) / stiff, 0, 1);
  const total = length - k * stiff;
  const integral = (y: number) => {
    const u = THREE.MathUtils.clamp((y - ANKLE_Y) / dy, 0, steps);
    const i = Math.min(Math.floor(u), steps - 1), t = u - i;
    const w = (j: number) => cumulative[j] + (1 - k) * rigid[j];
    return THREE.MathUtils.lerp(w(i), w(i + 1), t);
  };
  return (y: number) => y <= ANKLE_Y ? y : y >= NECK_Y ? y + shift : y + shift * integral(y) / total;
}

/**
 * Lengthens centerlines, not radii. Hands, feet and everything above the body neck rim are
 * rigid. The body surface and its skin weights are regenerated at the new proportions, so
 * joints keep their shape instead of being squashed or stretched.
 */
export function createHeightShape(rig: HumanoidRig, bodyParts: MeshPart[], defaultHeight: number, height: number) {
  const shift = defaultHeight * (validateHeight(height) - 1);
  const mapY = createHeightMap(shift);
  const mapPoint = (p: THREE.Vector3) => p.set(p.x, mapY(p.y), p.z);
  const armScale = (side: string) => {
    const upper = rig.worldRest.get(`UpperArm_${side}`).y, hand = rig.worldRest.get(`Hand_${side}`).y;
    // Arms hang beside the torso, so they share its average scale over their span.
    return (mapY(upper) - mapY(hand)) / (upper - hand);
  };
  const scales = { L: armScale("L"), R: armScale("R") };
  const armCenter = (p: THREE.Vector3, side: "L" | "R") => {
    const upper = rig.worldRest.get(`UpperArm_${side}`);
    return p.sub(upper).multiplyScalar(scales[side]).add(mapPoint(upper.clone()));
  };
  const hands = {
    L: armCenter(rig.worldRest.get("Hand_L").clone(), "L").sub(rig.worldRest.get("Hand_L")),
    R: armCenter(rig.worldRest.get("Hand_R").clone(), "R").sub(rig.worldRest.get("Hand_R")),
  };
  const hips = rig.worldRest.get("Hips").y, thigh = rig.worldRest.get("Thigh_L").y;
  const limbScale = { legs: (mapY(thigh) - ANKLE_Y) / (thigh - ANKLE_Y), arms: (scales.L + scales.R) / 2 };
  const lengthScale = (mapY(hips) - ANKLE_Y) / (hips - ANKLE_Y);

  function bonePosition(bone: THREE.Bone): THREE.Vector3 {
    const p = rig.worldRest.get(bone.name).clone();
    let ancestor: THREE.Object3D | null = bone;
    while (ancestor?.isObject3D) {
      if (ancestor.name === "Head") return p.add(new THREE.Vector3(0, shift, 0));
      if (ancestor.name === "Hand_L" || ancestor.name === "Hand_R") return p.add(hands[ancestor.name.endsWith("_L") ? "L" : "R"]);
      if (ancestor.name.startsWith("UpperArm_") || ancestor.name.startsWith("Forearm_")) {
        return armCenter(p, ancestor.name.endsWith("_L") ? "L" : "R");
      }
      ancestor = ancestor.parent;
    }
    return mapPoint(p);
  }

  /**
   * Rewrites a merged character geometry captured at the default height: body parts are
   * regenerated (keeping any sculpted offsets such as torso details) and the head and neck
   * surface translate with the skull.
   */
  function geometry(geo: THREE.BufferGeometry) {
    const count = geo.attributes.position.count;
    const heightOffset = new Float32Array(count * 3);
    geo.setAttribute("heightOffset", new THREE.Float32BufferAttribute(heightOffset, 3));
    if (height === 1) return;
    const worldRest = new Map(rig.bones.map((bone) => [bone.name, bonePosition(bone)]));
    const canonical = buildBaseBodyParts(rig);
    const tubeFrames = canonical[0].geo.userData.tubeFrames;
    const target = buildBaseBodyParts({ ...rig, worldRest: worldRest as HumanoidRig["worldRest"] }, { mapY, limbScale, tubeFrames, height });
    const slopeAt = (y: number) => (mapY(y + 1e-3) - mapY(y - 1e-3)) / 2e-3;
    const { position, skinIndex, skinWeight } = geo.attributes;
    let offset = 0;
    target.forEach((part, p) => {
      const to = part.geo.attributes, from = canonical[p].geo.attributes;
      for (let i = 0; i < to.position.count; i++) {
        const j = offset + i;
        // Sculpted relief (torso details) keeps its aspect ratio where the torso is shortened.
        const relief = Math.min(1, slopeAt(from.position.getY(i)));
        for (let k = 0; k < 3; k++) {
          const sculpted = position.getComponent(j, k) - from.position.getComponent(i, k);
          position.setComponent(j, k, to.position.getComponent(i, k) + sculpted * relief);
          heightOffset[j * 3 + k] = to.position.getComponent(i, k) - from.position.getComponent(i, k);
        }
        for (let k = 0; k < 4; k++) {
          skinIndex.setComponent(j, k, to.skinIndex.getComponent(i, k));
          skinWeight.setComponent(j, k, to.skinWeight.getComponent(i, k));
        }
      }
      offset += to.position.count;
      part.geo.dispose();
      canonical[p].geo.dispose();
    });
    if (offset !== bodyParts.reduce((sum, part) => sum + part.geo.attributes.position.count, 0)) {
      throw new Error("Height rebuild changed the body topology.");
    }
    // The cervical surface is translated with the skull, including every facial accessory.
    for (let i = offset; i < count; i++) {
      position.setY(i, position.getY(i) + shift);
      heightOffset[i * 3 + 1] = shift;
    }
    position.needsUpdate = skinIndex.needsUpdate = skinWeight.needsUpdate = true;
    const headNormals = geo.attributes.normal.array.slice(offset * 3);
    geo.computeVertexNormals();
    geo.attributes.normal.array.set(headNormals, offset * 3);
    if (geo.userData.neckJoinNormals) restoreNeckJoinNormals(geo);
    geo.attributes.normal.needsUpdate = true;
    geo.boundingBox = geo.boundingSphere = null;
  }

  return { geometry, bonePosition, lengthScale, shift };
}
