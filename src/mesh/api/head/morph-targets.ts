import type { HumanoidRig } from "../../../rigging/api/types.js";
import type { HeadDesign, HeadTarget } from "./types.js";
import * as THREE from "three";
import { FACS_MORPH_NAMES } from "../../../animations/api/facs.js";
import { ORAL_LOFT_VERTS } from "./oral-cavity.js";
import { gauss, smoothstep } from "../../../shared/math.js";

// --- 2F. Procedural FACS Morph Target Generator ---
/**
 * Adds the FACS morph targets to the merged character geometry. Shapes are computed on the neutral
 * `referenceGeo` and scaled by the head design's part transforms.
 */
export function buildFacialMorphTargets(
  mergedGeo: THREE.BufferGeometry, rig: HumanoidRig, headGroupIdx: number, cavGroupIdx: number,
  referenceGeo: THREE.BufferGeometry = mergedGeo, design: HeadDesign | null = null,
): void {
  const posAttr = referenceGeo.attributes.position;
  const editedPos = mergedGeo.attributes.position;
  const normAttr = mergedGeo.attributes.normal;

  const headGroup = mergedGeo.groups[headGroupIdx];
  const idxAttr = mergedGeo.index!;
  const headVertSet = new Set<number>();
  for (let i = headGroup.start; i < headGroup.start + headGroup.count; i++) {
    headVertSet.add(idxAttr.getX(i));
  }

  const mouthY = 1.595;
  const eyeL = rig.worldRest.get("Eye_L");
  const eyeR = rig.worldRest.get("Eye_R");

  // Let the inner-mouth bag follow the lip morphs so the two never separate
  const cavGroup = mergedGeo.groups[cavGroupIdx];
  let cavMin = Infinity;
  for (let i = cavGroup.start; i < cavGroup.start + cavGroup.count; i++) cavMin = Math.min(cavMin, idxAttr.getX(i));
  for (let i = cavGroup.start; i < cavGroup.start + cavGroup.count; i++) {
    const vi = idxAttr.getX(i);
    if (vi - cavMin < ORAL_LOFT_VERTS) headVertSet.add(vi);
  }
  const headScale = new THREE.Vector3(1, 1, 1);
  const cavityScale = new THREE.Vector3(1, 1, 1);
  for (const target of ["all", "skin"]) {
    const t = design?.transforms[target as HeadTarget];
    if (t) headScale.multiply(new THREE.Vector3(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1));
  }
  cavityScale.copy(headScale);
  const ct = design?.transforms.cavity;
  if (ct) cavityScale.multiply(new THREE.Vector3(ct.sx ?? 1, ct.sy ?? 1, ct.sz ?? 1));
  const lipRimCount = referenceGeo.userData.mouthRimCount ?? 0;

  const morphPosAttrs = [];
  const morphNormAttrs = [];
  const nTmp = new THREE.Vector3();

  for (const shapeName of FACS_MORPH_NAMES) {
    const pArr = new Float32Array(editedPos.array.length);
    const nArr = new Float32Array(normAttr.array.length);

    for (const vi of headVertSet) {
      const x = posAttr.getX(vi);
      const y = posAttr.getY(vi);
      const z = posAttr.getZ(vi);
      if (z < 0.01) continue;

      const front = smoothstep(0.01, 0.065, z);
      let dx = 0, dy = 0, dz = 0;

      if (shapeName === "browInnerUp") {
        const m = gauss(x, y - 1.694, 0, 0.022, 0.014, 1) * front;
        dy += m * 0.0065;
        dz += m * 0.0012;
      } else if (shapeName === "browOuterUp_L" || shapeName === "browOuterUp_R") {
        const s = shapeName.endsWith("_L") ? 1 : -1;
        const m = gauss(x - s * 0.044, y - 1.691, 0, 0.018, 0.013, 1) * front;
        dy += m * 0.0060;
      } else if (shapeName === "browDown_L" || shapeName === "browDown_R") {
        const s = shapeName.endsWith("_L") ? 1 : -1;
        const m = gauss(x - s * 0.024, y - 1.691, 0, 0.022, 0.014, 1) * front;
        dx -= s * m * 0.0038;
        dy -= m * 0.0055;
        dz += m * 0.0022;
      } else if (shapeName === "cheekSquint_L" || shapeName === "cheekSquint_R") {
        const s = shapeName.endsWith("_L") ? 1 : -1;
        const eyeCenter = s > 0 ? eyeL : eyeR;
        const cheek = gauss(x - s * 0.044, y - 1.638, 0, 0.024, 0.019, 1) * front;
        const infra = gauss(x - eyeCenter.x, y - (eyeCenter.y - 0.015), 0, 0.018, 0.009, 1) * front;
        dy += cheek * 0.0052 + infra * 0.0034;
        dz += cheek * 0.0046 + infra * 0.0020;
        dx += s * cheek * 0.0018;
      } else if (shapeName === "mouthSmile_L" || shapeName === "mouthSmile_R") {
        const s = shapeName.endsWith("_L") ? 1 : -1;
        const corner = gauss(x - s * 0.028, y - mouthY, 0, 0.016, 0.014, 1) * front;
        const cheekPull = gauss(x - s * 0.042, y - (mouthY + 0.018), 0, 0.020, 0.018, 1) * front;
        dx += s * (corner * 0.0075 + cheekPull * 0.0025);
        dy += corner * 0.0072 + cheekPull * 0.0032;
        dz += -corner * 0.0042 + cheekPull * 0.0028;
      } else if (shapeName === "mouthFrown_L" || shapeName === "mouthFrown_R") {
        const s = shapeName.endsWith("_L") ? 1 : -1;
        const corner = gauss(x - s * 0.028, y - mouthY, 0, 0.015, 0.014, 1) * front;
        dx -= s * corner * 0.0025;
        dy -= corner * 0.0075;
        dz += corner * 0.0015;
      } else if (shapeName === "mouthPucker") {
        const ring = gauss(x, y - mouthY, 0, 0.026, 0.016, 1) * front;
        dx -= x * ring * 0.34;
        dy -= (y - mouthY) * ring * 0.14;
        dz += ring * 0.0095;
      } else if (shapeName === "mouthFunnel") {
        const uLip = gauss(x, y - (mouthY + 0.007), 0, 0.022, 0.008, 1) * front;
        const lLip = gauss(x, y - (mouthY - 0.008), 0, 0.022, 0.009, 1) * front;
        const sideIn = gauss(Math.abs(x) - 0.026, y - mouthY, 0, 0.012, 0.012, 1) * front;
        dx -= Math.sign(x) * sideIn * 0.0055;
        dy += uLip * 0.0038 - lLip * 0.0045;
        dz += (uLip + lLip) * 0.0078;
      } else if (shapeName === "mouthStretch") {
        const side = gauss(Math.abs(x) - 0.028, y - mouthY, 0, 0.015, 0.015, 1) * front;
        dx += Math.sign(x) * side * 0.0070;
        dy -= side * 0.0028;
        dz -= side * 0.0035;
      } else if (shapeName === "noseSneer_L" || shapeName === "noseSneer_R") {
        const s = shapeName.endsWith("_L") ? 1 : -1;
        const ala = gauss(x - s * 0.015, y - 1.627, 0, 0.013, 0.013, 1) * front;
        const up = gauss(x - s * 0.014, y - (mouthY + 0.011), 0, 0.013, 0.010, 1) * front;
        dx += s * ala * 0.0028;
        dy += ala * 0.0055 + up * 0.0045;
        dz += ala * 0.0022;
      }

      if (dx !== 0 || dy !== 0 || dz !== 0) {
        const scale = vi >= cavMin + lipRimCount && vi - cavMin < ORAL_LOFT_VERTS ? cavityScale : headScale;
        const faceFade = smoothstep(1.575, 1.585, y);
        dx *= scale.x * faceFade; dy *= scale.y * faceFade; dz *= scale.z * faceFade;
        pArr[vi * 3] = dx;
        pArr[vi * 3 + 1] = dy;
        pArr[vi * 3 + 2] = dz;

        nTmp.set(
          normAttr.getX(vi) + dx * 18,
          normAttr.getY(vi) + dy * 18,
          normAttr.getZ(vi) + dz * 18
        ).normalize();
        nArr[vi * 3] = nTmp.x - normAttr.getX(vi);
        nArr[vi * 3 + 1] = nTmp.y - normAttr.getY(vi);
        nArr[vi * 3 + 2] = nTmp.z - normAttr.getZ(vi);
      }
    }

    const pAttr = new THREE.Float32BufferAttribute(pArr, 3);
    pAttr.name = shapeName;
    const nAttr = new THREE.Float32BufferAttribute(nArr, 3);
    nAttr.name = shapeName;
    morphPosAttrs.push(pAttr);
    morphNormAttrs.push(nAttr);
  }

  mergedGeo.morphAttributes.position = morphPosAttrs;
  mergedGeo.morphAttributes.normal = morphNormAttrs;
  // Facial morphs must not pull a sculpted torso back toward its original surface.
  mergedGeo.morphTargetsRelative = true;
}
