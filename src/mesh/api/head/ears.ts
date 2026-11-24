import * as THREE from "three";
import type { KeyedMap } from "../../../rigging/api/types.js";
import { ensureUniformAttributes } from "../geometry/attributes.js";
import { smoothstep } from "../../../shared/math.js";

export function buildEarGeometry(rootPos: THREE.Vector3, sideSign: number, boneName: string, boneIndex: KeyedMap<number>): THREE.BufferGeometry {
  const bIdx = boneIndex.get(boneName);
  const hIdx = boneIndex.get("Head");

  const earGeo = new THREE.SphereGeometry(1.0, 28, 22);
  const pos = earGeo.attributes.position;
  const count = pos.count;
  const skinIdx = new Uint16Array(count * 4);
  const skinWgt = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);

    const ry = 0.0275;
    const rz = 0.0155 * (1.0 + 0.14 * ny - 0.12 * ny * ny);
    const radial = Math.sqrt(ny * ny + nz * nz);
    const isOuter = nx * sideSign > 0;

    const helixRing = Math.exp(-Math.pow((radial - 0.84) / 0.16, 2)) * smoothstep(0.65, -0.35, nz);
    const conchaBowl = Math.exp(-(ny * ny * 3.2 + (nz - 0.08) * (nz - 0.08) * 4.2));
    const lobeRound = Math.exp(-Math.pow((ny + 0.78) / 0.25, 2)) * Math.exp(-Math.pow(nz / 0.45, 2));

    let thick = 0.0046;
    if (isOuter) {
      thick += helixRing * 0.0030 + lobeRound * 0.0014 - conchaBowl * 0.0032;
    }

    const flareOut = sideSign * (0.0042 + smoothstep(0.75, -0.85, nz) * 0.0092);
    const x = rootPos.x + flareOut + nx * thick;
    const y = rootPos.y + ny * ry;
    const z = rootPos.z - 0.004 + nz * rz;
    pos.setXYZ(i, x, y, z);

    const earW = smoothstep(-0.15, 0.65, (x - rootPos.x) * sideSign / 0.012);
    skinIdx[i * 4] = bIdx;
    skinIdx[i * 4 + 1] = hIdx;
    skinWgt[i * 4] = 0.30 + 0.70 * earW;
    skinWgt[i * 4 + 1] = 0.70 * (1 - earW);
  }

  earGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
  earGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
  earGeo.computeVertexNormals();
  return ensureUniformAttributes(earGeo);
}
