import * as THREE from "three";
import type { KeyedMap } from "../../../rigging/api/types.js";
import { ensureUniformAttributes } from "../geometry/attributes.js";
import { smoothstep } from "../../../shared/math.js";

const RADIAL_SEGMENTS = 40;
const ANGULAR_SEGMENTS = 96;

export function buildEarGeometry(
  rootPos: THREE.Vector3, sideSign: number, boneName: string, boneIndex: KeyedMap<number>, attachedEarlobes = false,
): THREE.BufferGeometry {
  const bIdx = boneIndex.get(boneName);
  const hIdx = boneIndex.get("Head");
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const skinIdx: number[] = [], skinWgt: number[] = [];
  const gaussian = (value: number, center: number, width: number) => Math.exp(-(((value - center) / width) ** 2));

  // Distances to the three branches of the antihelix Y in the polar disk.
  const ridge = (a: number, b: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay;
    const t = THREE.MathUtils.clamp(((a - ax) * dx + (b - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.exp(-((a - ax - t * dx) ** 2 + (b - ay - t * dy) ** 2) / 0.0064);
  };

  function vertex(u: number, v: number, back: boolean) {
    const a = u * Math.sin(v), b = u * Math.cos(v);
    const cartilage = smoothstep(-0.85, -0.35, Math.cos(v));
    const lobe = smoothstep(0.35, 0.95, -b);
    const width = 0.0155 * (1 + 0.18 * Math.cos(v) - 0.12 * Math.cos(v) ** 2);
    const helix = 0.0044 * gaussian(u, 0.9, 0.065) * cartilage;
    const antihelix = 0.0028 * Math.max(
      ridge(a, b, 0.48, -0.50, 0.53, 0.20),
      ridge(a, b, 0.53, 0.20, 0.20, 0.72),
      ridge(a, b, 0.53, 0.20, -0.27, 0.54),
    );
    const concha = -0.0045 * (1 - smoothstep(0, 0.25, u) * (1 - gaussian(u, 0.25, 0.24)));
    const tragus = 0.0032 * Math.exp(-(((a + 0.38) / 0.13) ** 2) - ((b + 0.1) / 0.22) ** 2);
    const detail = concha + smoothstep(0, 0.14, u) * (helix + antihelix + tragus);
    const flare = 0.0035 * a;
    const attachment = attachedEarlobes ? 0.008 * lobe : 0;
    const depth = back
      ? 0.002 + flare - attachment * 0.3
      : 0.009 + flare + detail + 0.0015 * lobe - attachment;

    // The local depth normal is lateral (+/-X). Roll the rim inward in the disk
    // and backward along that normal, leaving the soft lobe uncurled.
    const curl = smoothstep(0.9, 1, u) * cartilage;
    const radius = u - 0.045 * curl;
    const y = rootPos.y - 0.003 + radius * Math.cos(v) * 0.028
      + (attachedEarlobes ? 0.003 : -0.001) * lobe;
    const z = rootPos.z - 0.001 - radius * Math.sin(v) * width
      + (attachedEarlobes ? 0.004 : 0) * lobe;
    const x = rootPos.x + sideSign * (depth - (back ? 0 : 0.0028 * curl));
    positions.push(x, y, z);
    uvs.push(u, v / (Math.PI * 2));
    const earW = 0.30 + 0.70 * smoothstep(0.001, 0.014, (x - rootPos.x) * sideSign);
    skinIdx.push(bIdx, hIdx, 0, 0);
    skinWgt.push(earW, 1 - earW, 0, 0);
  }

  const surfaceSize = 1 + RADIAL_SEGMENTS * ANGULAR_SEGMENTS;
  const ringVertex = (r: number, c: number) => 1 + (r - 1) * ANGULAR_SEGMENTS + c % ANGULAR_SEGMENTS;
  const triangle = (a: number, b: number, c: number, reverse: boolean) => {
    indices.push(a, reverse ? c : b, reverse ? b : c);
  };
  for (const back of [false, true]) {
    const offset = back ? surfaceSize : 0;
    vertex(0, 0, back);
    for (let r = 1; r <= RADIAL_SEGMENTS; r++) {
      for (let c = 0; c < ANGULAR_SEGMENTS; c++) vertex(r / RADIAL_SEGMENTS, c / ANGULAR_SEGMENTS * Math.PI * 2, back);
    }
    const reverse = back === (sideSign < 0);
    for (let c = 0; c < ANGULAR_SEGMENTS; c++) {
      triangle(offset, offset + ringVertex(1, c), offset + ringVertex(1, c + 1), reverse);
      for (let r = 1; r < RADIAL_SEGMENTS; r++) {
        const a = offset + ringVertex(r, c), b = offset + ringVertex(r + 1, c);
        const d = offset + ringVertex(r, c + 1), e = offset + ringVertex(r + 1, c + 1);
        triangle(a, b, e, reverse);
        triangle(a, e, d, reverse);
      }
    }
  }
  for (let c = 0; c < ANGULAR_SEGMENTS; c++) {
    const a = ringVertex(RADIAL_SEGMENTS, c), b = ringVertex(RADIAL_SEGMENTS, c + 1);
    triangle(a, a + surfaceSize, b + surfaceSize, sideSign > 0);
    triangle(a, b + surfaceSize, b, sideSign > 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return ensureUniformAttributes(geo);
}
