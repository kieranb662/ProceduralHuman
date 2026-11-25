import * as THREE from "three";
import type { KeyedMap } from "../../../rigging/api/types.js";
import { buildGeometryFromArrays, weldSeamNormals } from "../geometry/attributes.js";
import { smoothstep } from "../../../shared/math.js";

export function buildHairCap(headCenter: THREE.Vector3, boneIndex: KeyedMap<number>): THREE.BufferGeometry {
  const latSegs = 28;
  const lonSegs = 56;
  const stride = lonSegs + 1;
  const positions = [], uvs = [], colors = [], skinIdx = [], skinWgt = [], indices = [];
  const hIdx = boneIndex.get("Head");

  function evalMaxTheta(phi: number) {
    const a = Math.abs(phi);
    let maxT = THREE.MathUtils.lerp(Math.PI * 0.29, Math.PI * 0.59, smoothstep(0.45, 2.35, a));
    const templeRecess = Math.exp(-Math.pow((a - 0.62) / 0.20, 2));
    maxT -= templeRecess * Math.PI * 0.045;
    const sideburn = Math.exp(-Math.pow((a - 1.10) / 0.13, 2));
    maxT += sideburn * Math.PI * 0.095;
    const earArch = Math.exp(-Math.pow((a - 1.62) / 0.28, 2));
    maxT -= earArch * Math.PI * 0.135;
    return maxT;
  }

  for (let r = 0; r <= latSegs; r++) {
    const v = r / latSegs;
    for (let c = 0; c <= lonSegs; c++) {
      const u = c / lonSegs;
      const phi = (u - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi), cosP = Math.cos(phi);

      const maxTheta = evalMaxTheta(phi);
      const theta = v * maxTheta;
      const sinT = Math.sin(theta), cosT = Math.cos(theta);

      const topMask = Math.pow(Math.max(0, cosT), 1.6);
      const sidePart = 1.0 - 0.22 * Math.exp(-Math.pow((phi - 0.42) / 0.18, 2)) * smoothstep(0.15, 0.85, topMask);
      const topBoost = topMask * 0.014 * sidePart;
      const sideTrim = 0.0038 + topMask * 0.004;
      const wave = Math.sin(phi * 16 + theta * 9) * 0.0008 * smoothstep(0.15, 0.85, v);
      const edgeTuck = smoothstep(0.84, 1.0, v) * (sideTrim + 0.0025);

      const rx = 0.088 + sideTrim + topBoost * 0.35 + wave - edgeTuck;
      const ry = 0.118 + sideTrim * 0.8 + topBoost + wave - edgeTuck * 0.4;
      const rz = 0.106 + sideTrim + topBoost * 0.45 + wave - edgeTuck;

      const x = headCenter.x + sinT * sinP * rx;
      const y = headCenter.y + cosT * ry + 0.002;
      let z = headCenter.z + sinT * cosP * rz;

      const dy = y - headCenter.y;
      const frontMaskSmooth = smoothstep(-0.05, 0.30, cosP);
      z += Math.exp(-Math.pow((dy - 0.045) / 0.052, 2)) * Math.pow(Math.max(0, cosP), 1.4) * frontMaskSmooth * 0.011;
      if (cosP < 0 && dy > -0.03) {
        z -= Math.pow(-cosP, 1.4) * smoothstep(-0.03, 0.05, dy) * 0.011;
      }

      positions.push(x, y, z);
      uvs.push(u, 1 - v);
      colors.push(1, 1, 1);
      skinIdx.push(hIdx, 0, 0, 0);
      skinWgt.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < latSegs; r++) {
    for (let c = 0; c < lonSegs; c++) {
      const a0 = r * stride + c;
      const a1 = a0 + 1;
      const b0 = (r + 1) * stride + c;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const hairGeo = buildGeometryFromArrays(positions, uvs, colors, skinIdx, skinWgt, indices);
  weldSeamNormals(hairGeo, latSegs + 1, lonSegs);
  return hairGeo;
}
