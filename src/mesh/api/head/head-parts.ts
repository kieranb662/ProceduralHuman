import { SIDES } from "../../../shared/sides.js";
import * as THREE from "three";
import { buildGeometryFromArrays, ensureUniformAttributes, weldSeamNormals } from "../geometry/attributes.js";
import { buildEarGeometry } from "./ears.js";
import { attachEarsToHead } from "./ear-attachment.js";
import { validateHeadDesign } from "./design.js";
import { buildEyebrowStrip } from "./eyebrows.js";
import { buildEyelidShell } from "./eyelids.js";
import { buildHairCap } from "./hair.js";
import { nostrilField } from "./nostril.js";
import { buildOralCavityAndTongue } from "./oral-cavity.js";
import { applyHeadDesign } from "./sculpt.js";
import { buildTeethArc } from "./teeth.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";
import { gauss, smoothstep } from "../../../shared/math.js";
import type { HumanoidRig } from "../../../rigging/api/types.js";
import type { HeadDesign, HeadParts, MouthLoopVertex } from "./types.js";
import type { MeshPart } from "../types.js";

export function buildHeadAndFaceParts(rig: HumanoidRig, design: HeadDesign | null = null): HeadParts {
  const defaults: HeadDesign = { transforms: {}, features: {}, strokes: [] };
  validateHeadDesign(design ?? defaults);
  const parts = buildBaseHeadAndFaceParts(rig, design?.attachedEarlobes);
  applyHeadDesign(parts, rig, design ?? defaults);
  attachEarsToHead(parts, rig, design ?? defaults);
  return Object.assign(parts, { design: structuredClone(design ?? defaults) });
}

export function buildBaseHeadAndFaceParts(rig: HumanoidRig, attachedEarlobes = false): MeshPart[] {
  const { boneIndex, worldRest } = rig;
  const headCenter = new THREE.Vector3(0, 1.662, 0.008);
  const eyeL = worldRest.get("Eye_L");
  const eyeR = worldRest.get("Eye_R");
  const mouthY = 1.595;

  const evalForeheadSurfaceZ = (x: number, y: number) => {
    const dy = y - headCenter.y;
    const rx = 0.088, ry = 0.120, rz = 0.106;
    const cosT = THREE.MathUtils.clamp(dy / ry, -0.99, 0.99);
    const sinT = Math.sqrt(Math.max(0.0001, 1 - cosT * cosT));
    const sinP = THREE.MathUtils.clamp(x / (sinT * rx), -0.99, 0.99);
    const cosP = Math.sqrt(Math.max(0.0001, 1 - sinP * sinP));
    const frontMaskSmooth = smoothstep(-0.05, 0.30, cosP);
    let z = headCenter.z + sinT * cosP * rz;
    z += Math.exp(-Math.pow((dy - 0.045) / 0.052, 2)) * Math.pow(Math.max(0, cosP), 1.4) * frontMaskSmooth * 0.011;
    const faceMask = smoothstep(0.05, 0.32, cosP);
    const brow = gauss(Math.abs(x) - 0.031, y - 1.692, 0, 0.028, 0.011, 1);
    z += brow * 0.0065 * faceMask;
    return z;
  };

  // Keep the skull grid, concentrating sub-millimeter samples on the facial contours.
  const baseTheta = Math.acos((1.583 - headCenter.y) / 0.120);
  const thetaSamples = Array.from({ length: 105 }, (_, r) => {
    const v = r / 104;
    return THREE.MathUtils.clamp((v - 0.055 * Math.sin(v * Math.PI * 2)) * Math.PI, 0.001, Math.PI - 0.001);
  }).filter((theta) => theta < baseTheta);
  thetaSamples.push(baseTheta);
  for (let y = 1.584; y <= 1.678; y += 0.0005) {
    thetaSamples.push(Math.acos((y - headCenter.y) / 0.120));
  }
  const phiSamples = Array.from({ length: 113 }, (_, c) => (c / 112 - 0.5) * Math.PI * 2);
  for (let c = -72; c <= 72; c++) phiSamples.push(c * 0.0075);
  const sortedSamples = (samples: number[]) => samples.sort((a, b) => a - b)
    .filter((value, i, sorted) => i === 0 || value - sorted[i - 1] > 0.0001);
  const thetas = sortedSamples(thetaSamples);
  const jawRows = 28;
  const phis = sortedSamples(phiSamples);
  const latSegs = thetas.length - 1 + jawRows;
  const lonSegs = phis.length - 1;
  const stride = lonSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const faceSurface: number[] = [];
  const skinIdx: number[] = [];
  const skinWgt: number[] = [];
  const indices: number[] = [];
  const neckAttachment: number[] = [];

  const bHead = boneIndex.get("Head");
  const bNeck = boneIndex.get("Neck");
  const bJaw = boneIndex.get("Jaw");
  const bULC = boneIndex.get("UpperLip_C");
  const bULL = boneIndex.get("UpperLip_L");
  const bULR = boneIndex.get("UpperLip_R");
  const bLLC = boneIndex.get("LowerLip_C");
  const bLLL = boneIndex.get("LowerLip_L");
  const bLLR = boneIndex.get("LowerLip_R");
  const bMCL = boneIndex.get("MouthCorner_L");
  const bMCR = boneIndex.get("MouthCorner_R");
  const bBrowL = boneIndex.get("Brow_L");
  const bBrowR = boneIndex.get("Brow_R");
  const bNose = boneIndex.get("NoseTip");
  const bNosL = boneIndex.get("Nostril_L");
  const bNosR = boneIndex.get("Nostril_R");

  const jawChildren = new Set([bLLC, bLLL, bLLR]);
  const roots = new Set([bHead, bNeck, bJaw]);
  // Merge the weakest facial influences into their parent (Jaw or Head) instead of letting the 4-influence cap
  // drop them; otherwise neighbouring vertices keep different bones and tear apart when the jaw opens.
  const foldIntoRoots = (pairs: number[][]) => {
    const merged = new Map<number, number>();
    for (const [bone, weight] of pairs) merged.set(bone, (merged.get(bone) ?? 0) + weight);
    while (merged.size > 4) {
      let weakest = -1;
      for (const [bone, weight] of merged) {
        if (!roots.has(bone) && (weakest < 0 || weight < merged.get(weakest)!)) weakest = bone;
      }
      if (weakest < 0) break;
      const root = jawChildren.has(weakest) ? bJaw : bHead;
      merged.set(root, (merged.get(root) ?? 0) + merged.get(weakest)!);
      merged.delete(weakest);
    }
    return [...merged];
  };

  for (let r = 0; r <= latSegs; r++) {
    for (let c = 0; c <= lonSegs; c++) {
      const phi = phis[c];
      const u = phi / (Math.PI * 2) + 0.5;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      // Retain the chin, then sweep the cut up behind the jaw into the nape.
      const cutY = 1.575 - 0.026 * Math.pow(Math.max(0, cosP), 2.4);
      const cutTheta = Math.acos((cutY - headCenter.y) / 0.120);
      const theta = r < thetas.length ? thetas[r]
        : THREE.MathUtils.lerp(baseTheta, cutTheta, (r - thetas.length + 1) / jawRows);
      const v = theta / Math.PI;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const aboveCut = headCenter.y + 0.120 * cosT - cutY;
      // Keep the first two rings fixed so sculpting cannot break the join or its tangent.
      neckAttachment.push(r >= latSegs - 1 ? 0 : smoothstep(0, 0.013, aboveCut));

      const rx = 0.088;
      const ry = 0.120;
      const rz = 0.106;

      let x = sinT * sinP * rx;
      let y = cosT * ry;
      let z = sinT * cosP * rz;

      const frontMaskSmooth = smoothstep(-0.05, 0.30, cosP);

      const foreheadFull = Math.exp(-Math.pow((y - 0.045) / 0.052, 2)) * Math.pow(Math.max(0, cosP), 1.4) * frontMaskSmooth;
      z += foreheadFull * 0.011;

      if (y < 0.015) {
        const low = smoothstep(0.015, -0.112, y);
        const frontMask = smoothstep(-0.20, 0.45, cosP);
        x *= 1.0 - low * (0.09 + 0.12 * frontMask * smoothstep(-0.055, -0.112, y));

        if (cosP > -0.15) {
          const fPow = Math.pow(Math.max(0, (cosP + 0.15) / 1.15), 1.35);
          const maxillaProj = smoothstep(0.015, -0.075, y) * (1.0 - smoothstep(-0.095, -0.118, y));
          z += maxillaProj * fPow * 0.022;
          const chinProj = Math.exp(-Math.pow((y + 0.098) / 0.024, 2)) * Math.pow(Math.max(0, cosP), 1.7);
          z += chinProj * 0.036;
          if (y < -0.100) {
            const under = smoothstep(-0.100, -0.118, y);
            y += under * (1.0 - Math.max(0, cosP)) * 0.006;
          }
        }
        const gonion = Math.exp(-Math.pow((y + 0.068) / 0.024, 2)) * Math.exp(-Math.pow((Math.abs(phi) - 1.12) / 0.36, 2));
        x += Math.sign(x) * gonion * 0.0085;
        z += gonion * 0.006;
      }

      if (cosP < 0 && y > -0.03) {
        z -= Math.pow(-cosP, 1.4) * smoothstep(-0.03, 0.05, y) * 0.011;
      }

      const wx0 = headCenter.x + x;
      const wy0 = headCenter.y + y;
      const wz0 = headCenter.z + z;

      let dx = 0, dy = 0, dz = 0;
      let lipMask = 0;
      let mouthPocket = 0;

      const faceRegionMask = smoothstep(0.05, 0.32, cosP);
      if (faceRegionMask > 0.001) {
        const brow = gauss(Math.abs(wx0) - 0.031, wy0 - 1.692, 0, 0.028, 0.011, 1);
        dz += brow * 0.0065 * faceRegionMask;

        const cheek = gauss(Math.abs(wx0) - 0.050, wy0 - 1.638, 0, 0.024, 0.020, 1);
        dx += Math.sign(wx0) * cheek * 0.0055 * faceRegionMask;
        dz += cheek * 0.0065 * faceRegionMask;

        const sockL = gauss(wx0 - eyeL.x, wy0 - eyeL.y, 0, 0.0175, 0.0120, 1);
        const sockR = gauss(wx0 - eyeR.x, wy0 - eyeR.y, 0, 0.0175, 0.0120, 1);
        const sock = Math.max(sockL, sockR);
        dz -= sock * 0.0165 * faceRegionMask;

        const bridge = gauss(wx0, wy0 - 1.653, 0, 0.0105, 0.021, 1);
        const noseTip = gauss(wx0, wy0 - 1.633, 0, 0.0130, 0.0110, 1);
        const alaL = gauss(wx0 - 0.0135, wy0 - 1.6245, 0, 0.0075, 0.0060, 1);
        const alaR = gauss(wx0 + 0.0135, wy0 - 1.6245, 0, 0.0075, 0.0060, 1);
        const nostrilPit = nostrilField(Math.abs(wx0), wy0);
        const columella = gauss(wx0, wy0 - 1.6205, 0, 0.0030, 0.0050, 1);
        dz += (bridge * 0.0135 + noseTip * 0.0220 + (alaL + alaR) * 0.0100 +
          columella * 0.0040 - nostrilPit * 0.0085) * faceRegionMask;
        // Recess in depth only: lifting a narrow pit folds the surface over its rim.
        dy -= noseTip * 0.0012 * faceRegionMask;

        const philtrum = gauss(wx0, wy0 - 1.612, 0, 0.0055, 0.0075, 1);
        dz -= philtrum * 0.0022 * faceRegionMask;

        const mouthWidth = 0.030;
        const mxNorm = Math.abs(wx0) / mouthWidth;
        if (mxNorm < 1.35 && Math.abs(wy0 - mouthY) < 0.028) {
          const along = smoothstep(1.22, 0.0, mxNorm);
          const cupidsBow = (0.0014 * (
            gauss(wx0 - 0.006, 0, 0, 0.0045, 1, 1) +
            gauss(wx0 + 0.006, 0, 0, 0.0045, 1, 1)) -
            0.0008 * gauss(wx0, 0, 0, 0.0035, 1, 1)) * along;
          const uLipY = mouthY + 0.0062 * along + cupidsBow;
          const lLipY = mouthY - 0.0070 * along;

          const uLip = Math.exp(-Math.pow((wy0 - uLipY) / 0.0056, 2)) * along;
          const lLip = Math.exp(-Math.pow((wy0 - lLipY) / 0.0058, 2)) * along;
          const seam = Math.exp(-Math.pow((wy0 - mouthY) / 0.0024, 2)) * Math.pow(along, 0.7);
          const uBorder = Math.exp(-Math.pow((wy0 - (uLipY + 0.0032)) / 0.0030, 2)) * along * 0.4;

          dz += (uLip * 0.0100 + lLip * 0.0125 + uBorder * 0.0016 - seam * 0.0145) * faceRegionMask;
          lipMask = Math.min(1, Math.pow(Math.min(1, (uLip + lLip) * 1.18), 0.78) * faceRegionMask);
          mouthPocket = seam * faceRegionMask;
        }

        const chinCrease = gauss(wx0, wy0 - 1.576, 0, 0.021, 0.006, 1);
        dz -= chinCrease * 0.0034 * faceRegionMask;

        // --- Extra facial sculpting ---
        const ax = Math.abs(wx0), sg = Math.sign(wx0) || 1, fm = faceRegionMask;
        // cheekbone + buccal hollow
        const zyg = gauss(ax - 0.056, wy0 - 1.652, 0, 0.020, 0.012, 1);
        dz += zyg * 0.0055 * fm; dx += sg * zyg * 0.0025 * fm;
        dz -= gauss(ax - 0.050, wy0 - 1.616, 0, 0.018, 0.014, 1) * 0.0040 * fm;
        // nasolabial fold (distance to line from nostril wing to mouth corner)
        {
          const px = ax - 0.021, py = wy0 - 1.624, lx = 0.015, ly = -0.032;
          const tt = THREE.MathUtils.clamp((px * lx + py * ly) / (lx * lx + ly * ly), 0, 1);
          const d = Math.hypot(px - tt * lx, py - tt * ly);
          dz += (-Math.exp(-Math.pow(d / 0.0035, 2)) * 0.0032 + Math.exp(-Math.pow((d - 0.009) / 0.005, 2)) * 0.0022) * fm * smoothstep(1.575, 1.61, wy0);
        }
        // eyelid crease, under-eye bag, temple hollow
        dz -= gauss(ax - 0.033, wy0 - 1.6785, 0, 0.016, 0.0025, 1) * 0.0024 * fm;
        dz += gauss(ax - 0.033, wy0 - 1.648, 0, 0.017, 0.005, 1) * 0.0022 * fm;
        dz -= gauss(ax - 0.075, wy0 - 1.690, 0, 0.012, 0.022, 1) * 0.0030 * fm;
        // nasion dip, alar groove, philtrum columns
        dz -= gauss(wx0, wy0 - 1.6745, 0, 0.011, 0.006, 1) * 0.0030 * fm;
        dz -= gauss(ax - 0.0175, wy0 - 1.6265, 0, 0.0035, 0.007, 1) * 0.0035 * fm;
        dz += gauss(ax - 0.0065, wy0 - 1.612, 0, 0.0025, 0.0065, 1) * 0.0016 * fm;
      }

      const fx = wx0 + dx;
      const fy = wy0 + dy;
      const fz = wz0 + dz;
      positions.push(fx, fy, fz);
      uvs.push(u, 1 - v);
      faceSurface.push(wx0, wy0, faceRegionMask);

      let cr = 1.0, cg = 1.0, cb = 1.0;
      if (lipMask > 0.04) {
        const lm = smoothstep(0.04, 0.85, lipMask);
        cr = THREE.MathUtils.lerp(1.0, 0.94, lm * 0.85);
        cg = THREE.MathUtils.lerp(1.0, 0.56, lm * 0.85);
        cb = THREE.MathUtils.lerp(1.0, 0.52, lm * 0.85);
      }
      if (mouthPocket > 0.14) {
        const p = smoothstep(0.14, 0.68, mouthPocket);
        cr = THREE.MathUtils.lerp(cr, 0.24, p);
        cg = THREE.MathUtils.lerp(cg, 0.09, p);
        cb = THREE.MathUtils.lerp(cb, 0.10, p);
      }
      // Skin tone detail: cheek flush, nose redness, under-eye shading, eye sockets, light stubble
      {
        const fm2 = faceRegionMask, axx = Math.abs(wx0);
        const flush = gauss(axx - 0.050, wy0 - 1.632, 0, 0.022, 0.018, 1) * fm2;
        const noseRed = gauss(wx0, wy0 - 1.630, 0, 0.012, 0.012, 1) * fm2;
        const bag = gauss(axx - 0.033, wy0 - 1.648, 0, 0.017, 0.007, 1) * fm2;
        const socket = Math.max(
          gauss(wx0 - eyeL.x, wy0 - eyeL.y, 0, 0.022, 0.016, 1),
          gauss(wx0 - eyeR.x, wy0 - eyeR.y, 0, 0.022, 0.016, 1)
        ) * fm2;
        const stub = smoothstep(mouthY + 0.004, mouthY - 0.012, wy0) * smoothstep(1.52, 1.57, wy0) * fm2 * (1 - lipMask);
        cr *= 1 + flush * 0.05 + noseRed * 0.05 - bag * 0.06 - socket * 0.10 - stub * 0.14;
        cg *= 1 - flush * 0.08 - noseRed * 0.07 - bag * 0.08 - socket * 0.12 - stub * 0.16;
        cb *= 1 - flush * 0.06 - noseRed * 0.05 - bag * 0.02 - socket * 0.10 - stub * 0.12;
      }
      colors.push(cr, cg, cb);

      const pairs = [];
      const isFront = smoothstep(-0.02, 0.35, cosP);

      const wNeck = (1 - smoothstep(0, 0.040, aboveCut)) * (0.24 - 0.16 * isFront);
      // Fade gently: the chin underside is nearly flat in y, so a steep falloff folds it over when the jaw opens.
      const jawFollow = THREE.MathUtils.lerp(0.6, 1, smoothstep(1.50, 1.60, fy));
      const jawZone = smoothstep(mouthY + 0.001, mouthY - 0.006, fy)
        * smoothstep(0.005, 0.065, fz) * isFront * jawFollow;

      let wULC = 0, wULL = 0, wULR = 0;
      if (fy >= mouthY - 0.001 && isFront > 0.1) {
        const upMask = smoothstep(mouthY - 0.001, mouthY + 0.0025, fy);
        wULC = gauss(fx, fy - (mouthY + 0.008), 0, 0.012, 0.010, 1) * upMask * isFront * 0.95;
        wULL = gauss(fx - 0.016, fy - (mouthY + 0.006), 0, 0.012, 0.010, 1) * upMask * isFront * 0.90;
        wULR = gauss(fx + 0.016, fy - (mouthY + 0.006), 0, 0.012, 0.010, 1) * upMask * isFront * 0.90;
      }

      let wLLC = 0, wLLL = 0, wLLR = 0;
      if (fy <= mouthY + 0.001 && isFront > 0.1) {
        const loMask = smoothstep(mouthY + 0.001, mouthY - 0.0025, fy);
        wLLC = gauss(fx, fy - (mouthY - 0.009), 0, 0.013, 0.011, 1) * loMask * isFront * 0.95;
        wLLL = gauss(fx - 0.016, fy - (mouthY - 0.007), 0, 0.012, 0.010, 1) * loMask * isFront * 0.90;
        wLLR = gauss(fx + 0.016, fy - (mouthY - 0.007), 0, 0.012, 0.010, 1) * loMask * isFront * 0.90;
      }

      const cornerFollowJaw = smoothstep(mouthY + 0.003, mouthY - 0.003, fy) * 0.45;
      const wMCL = gauss(fx - 0.030, fy - mouthY, 0, 0.013, 0.013, 1) * isFront * 0.95;
      const wMCR = gauss(fx + 0.030, fy - mouthY, 0, 0.013, 0.013, 1) * isFront * 0.95;
      const wBrowL = gauss(fx - 0.032, fy - 1.693, 0, 0.025, 0.014, 1) * isFront * 0.90;
      const wBrowR = gauss(fx + 0.032, fy - 1.693, 0, 0.025, 0.014, 1) * isFront * 0.90;
      const wNose = gauss(fx, fy - 1.632, 0, 0.014, 0.016, 1) * isFront * 0.95;
      const wNosL = gauss(fx - 0.014, fy - 1.625, 0, 0.011, 0.011, 1) * isFront * 0.90;
      const wNosR = gauss(fx + 0.014, fy - 1.625, 0, 0.011, 0.011, 1) * isFront * 0.90;

      const featureSum = wULC + wULL + wULR + wLLC + wLLL + wLLR + wMCL + wMCR + wBrowL + wBrowR + wNose + wNosL + wNosR;
      const jawNet = Math.max(0, jawZone * 0.95 - (wLLC + wLLL + wLLR) * 0.65 + (wMCL + wMCR) * cornerFollowJaw);
      const headNet = Math.max(0.05, 1.0 - Math.min(0.95, wNeck + jawNet + featureSum * 0.85));

      pairs.push([bHead, headNet]);
      if (wNeck > 0.01) pairs.push([bNeck, wNeck]);
      if (jawNet > 0.01) pairs.push([bJaw, jawNet]);
      if (wULC > 0.01) pairs.push([bULC, wULC]);
      if (wULL > 0.01) pairs.push([bULL, wULL]);
      if (wULR > 0.01) pairs.push([bULR, wULR]);
      if (wLLC > 0.01) pairs.push([bLLC, wLLC]);
      if (wLLL > 0.01) pairs.push([bLLL, wLLL]);
      if (wLLR > 0.01) pairs.push([bLLR, wLLR]);
      if (wMCL > 0.01) pairs.push([bMCL, wMCL]);
      if (wMCR > 0.01) pairs.push([bMCR, wMCR]);
      if (wBrowL > 0.01) pairs.push([bBrowL, wBrowL]);
      if (wBrowR > 0.01) pairs.push([bBrowR, wBrowR]);
      if (wNose > 0.01) pairs.push([bNose, wNose]);
      if (wNosL > 0.01) pairs.push([bNosL, wNosL]);
      if (wNosR > 0.01) pairs.push([bNosR, wNosR]);

      const packed = normalizeAndPackWeights(foldIntoRoots(pairs));
      skinIdx.push(...packed.indices);
      skinWgt.push(...packed.weights);
    }
  }

  for (let r = 0; r < latSegs; r++) {
    for (let c = 0; c < lonSegs; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = (r + 1) * stride + c;
      const e = d + 1;

      const midX = 0.5 * (positions[a * 3] + positions[e * 3]);
      const midY = 0.5 * (positions[a * 3 + 1] + positions[e * 3 + 1]);
      const midZ = 0.5 * (positions[a * 3 + 2] + positions[e * 3 + 2]);
      if (midZ > 0.085 && Math.abs(midX) < 0.0215 && Math.abs(midY - mouthY) < 0.0022) {
        continue;
      }

      indices.push(a, d, b, b, d, e);
    }
  }
  const headGeo = buildGeometryFromArrays(positions, uvs, colors, skinIdx, skinWgt, indices);
  headGeo.setAttribute("faceSurface", new THREE.Float32BufferAttribute(faceSurface, 3));
  weldSeamNormals(headGeo, latSegs + 1, lonSegs);
  headGeo.userData.neckAttachment = neckAttachment;
  headGeo.userData.neckAngles = phis.slice(0, -1);
  headGeo.userData.neckStart = latSegs * stride;
  headGeo.userData.skullStride = stride;

  // Trace the real boundary loop of the mouth opening so the inner mouth shares the lips' exact vertices
  const edgeCount = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const p = indices[i + k], q = indices[i + ((k + 1) % 3)];
      const key = p < q ? p + "_" + q : q + "_" + p;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  const nearMouth = (v: number) => Math.abs(positions[v * 3]) < 0.04 && Math.abs(positions[v * 3 + 1] - mouthY) < 0.012 && positions[v * 3 + 2] > 0.08;
  const adj = new Map<number, number[]>();
  for (const [key, n] of edgeCount) {
    if (n !== 1) continue;
    const [p, q] = key.split("_").map(Number);
    if (!nearMouth(p) || !nearMouth(q)) continue;
    if (!adj.has(p)) adj.set(p, []);
    if (!adj.has(q)) adj.set(q, []);
    adj.get(p)!.push(q);
    adj.get(q)!.push(p);
  }
  const loopIdx: number[] = [];
  if (adj.size) {
    const seen = new Set<number>();
    let cur = adj.keys().next().value;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loopIdx.push(cur);
      cur = adj.get(cur)!.find((nb) => !seen.has(nb));
    }
  }
  const mouthLoop: MouthLoopVertex[] = loopIdx.map((v) => ({
    pos: new THREE.Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]),
    idx: skinIdx.slice(v * 4, v * 4 + 4),
    wgt: skinWgt.slice(v * 4, v * 4 + 4),
  }));
  headGeo.userData.mouthLoopIndices = loopIdx;

  const parts: MeshPart[] = [{ geo: headGeo, mat: 0, tag: "head" }];

  const eyeRadius = 0.0130;
  for (const [side, s] of SIDES) {
    const center = worldRest.get(`Eye_${side}`);
    const eyeGeo = new THREE.SphereGeometry(eyeRadius, 28, 20);
    eyeGeo.rotateY(-Math.PI / 2);
    const uv = eyeGeo.attributes.uv;
    const pos = eyeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) / eyeRadius;
      const py = pos.getY(i) / eyeRadius;
      const pz = pos.getZ(i) / eyeRadius;
      if (pz > 0) {
        uv.setXY(i, 0.5 + px * 0.45, 0.5 + py * 0.45);
      } else {
        uv.setXY(i, 0.05, 0.05);
      }
    }
    eyeGeo.translate(center.x, center.y, center.z);
    const eCount = eyeGeo.attributes.position.count;
    const eIdx = new Uint16Array(eCount * 4);
    const eWgt = new Float32Array(eCount * 4);
    const bEye = boneIndex.get(`Eye_${side}`);
    for (let i = 0; i < eCount; i++) {
      eIdx[i * 4] = bEye;
      eWgt[i * 4] = 1;
    }
    eyeGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(eIdx, 4));
    eyeGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(eWgt, 4));
    parts.push({ geo: ensureUniformAttributes(eyeGeo), mat: 4, tag: `eye_${side}` });

    parts.push({ geo: buildEyelidShell(center, eyeRadius + 0.0022, true, boneIndex.get(`EyelidTop_${side}`)), mat: 5, tag: `lidTop_${side}` });
    parts.push({ geo: buildEyelidShell(center, eyeRadius + 0.0020, false, boneIndex.get(`EyelidBot_${side}`)), mat: 5, tag: `lidBot_${side}` });

    parts.push({ geo: buildEyebrowStrip(s, `Brow_${side}`, boneIndex, evalForeheadSurfaceZ), mat: 3, tag: `brow_${side}` });
  }

  for (const [side, s] of SIDES) {
    const earRoot = worldRest.get(`Ear_${side}`);
    parts.push({ geo: buildEarGeometry(earRoot, s, `Ear_${side}`, boneIndex, attachedEarlobes), mat: 5, tag: `ear_${side}` });
  }

  parts.push({ geo: buildTeethArc(true, bHead), mat: 6, tag: "teethTop" });
  parts.push({ geo: buildTeethArc(false, bJaw), mat: 6, tag: "teethBot" });
  const oral = buildOralCavityAndTongue(mouthY, bHead, bJaw, mouthLoop, boneIndex);
  parts.push({ geo: oral.cavity, mat: 9, tag: "cavity" });
  parts.push({ geo: oral.tongue, mat: 10, tag: "tongue" });

  parts.push({ geo: buildHairCap(headCenter, boneIndex), mat: 3, tag: "hair" });

  return parts;
}
