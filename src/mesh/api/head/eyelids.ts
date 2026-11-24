import * as THREE from "three";
import { buildGeometryFromArrays } from "../geometry/attributes.js";

export function buildEyelidShell(center, radius, isTop, boneIdx) {
  const rSegs = 12;
  const cSegs = 28;
  const stride = cSegs + 1;
  const positions = [], uvs = [], colors = [], skinIdx = [], skinWgt = [], indices = [];

  const azStart = -1.75, azEnd = 1.75;

  for (let r = 0; r <= rSegs; r++) {
    const v = r / rSegs;
    for (let c = 0; c <= cSegs; c++) {
      const u = c / cSegs;
      const az = THREE.MathUtils.lerp(azStart, azEnd, u);
      const azNorm = Math.abs(az) / 1.75;
      const cornerTaper = Math.pow(Math.max(0, 1.0 - azNorm * azNorm), 0.72);

      const elStart = isTop ? 0.34 * cornerTaper : -1.32;
      const elEnd = isTop ? 1.32 : -0.26 * cornerTaper;
      const el = THREE.MathUtils.lerp(elStart, elEnd, v);

      const rimMask = isTop ? Math.exp(-v * 4.5) : Math.exp(-(1 - v) * 4.5);
      const lidR = radius + rimMask * 0.0014;

      const x = center.x + lidR * Math.cos(el) * Math.sin(az);
      const y = center.y + lidR * Math.sin(el);
      const z = center.z + lidR * Math.cos(el) * Math.cos(az);
      positions.push(x, y, z);
      uvs.push(u, v);

      const lashDark = rimMask * 0.24;
      colors.push(1.0 - lashDark * 0.85, 1.0 - lashDark * 1.1, 1.0 - lashDark * 1.15);

      skinIdx.push(boneIdx, 0, 0, 0);
      skinWgt.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < rSegs; r++) {
    for (let c = 0; c < cSegs; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = (r + 1) * stride + c;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  return buildGeometryFromArrays(positions, uvs, colors, skinIdx, skinWgt, indices);
}
