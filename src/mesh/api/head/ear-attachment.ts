import * as THREE from "three";
import type { HumanoidRig } from "../../../rigging/api/types.js";
import { smoothstep } from "../../../shared/math.js";
import type { MeshPart } from "../types.js";
import type { HeadDesign } from "./types.js";

export const EAR_HINGE_DEPTH = 0.012;
export const EAR_HINGE_LATERAL = 0.002;

/** Seats the ear shells on the final skull, retaining their cartilage relief and lobe shape. */
export function attachEarsToHead(parts: MeshPart[], rig: HumanoidRig, design: HeadDesign): void {
  const head = parts.find((part) => part.tag === "head");
  if (!head) throw new Error("Ear attachment requires a head surface.");
  const pos = head.geo.attributes.position, indices = head.geo.index!;
  const cellSize = 0.008;
  const cells = new Map<string, number[]>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < indices.count; i += 3) {
    a.fromBufferAttribute(pos, indices.getX(i));
    b.fromBufferAttribute(pos, indices.getX(i + 1));
    c.fromBufferAttribute(pos, indices.getX(i + 2));
    const minY = Math.floor(Math.min(a.y, b.y, c.y) / cellSize);
    const maxY = Math.floor(Math.max(a.y, b.y, c.y) / cellSize);
    const minZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
    const maxZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
    for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      const key = `${y},${z}`;
      const cell = cells.get(key);
      if (cell) cell.push(i);
      else cells.set(key, [i]);
    }
  }

  // Barycentric interpolation in the YZ projection finds the outer skull on either side.
  function surfaceX(y: number, z: number, side: number): number {
    let outer = -Infinity;
    for (const i of cells.get(`${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`) ?? []) {
      a.fromBufferAttribute(pos, indices.getX(i));
      b.fromBufferAttribute(pos, indices.getX(i + 1));
      c.fromBufferAttribute(pos, indices.getX(i + 2));
      const det = (b.z - c.z) * (a.y - c.y) + (c.y - b.y) * (a.z - c.z);
      if (Math.abs(det) < 1e-14) continue;
      const u = ((b.z - c.z) * (y - c.y) + (c.y - b.y) * (z - c.z)) / det;
      const v = ((c.z - a.z) * (y - c.y) + (a.y - c.y) * (z - c.z)) / det;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      outer = Math.max(outer, side * (u * a.x + v * b.x + (1 - u - v) * c.x));
    }
    if (!Number.isFinite(outer)) {
      throw new Error("Cannot attach ear: size or position extends beyond the head surface.");
    }
    return side * outer;
  }

  const lateralScale = (design.ears?.size ?? 1) * (design.transforms.all?.sx ?? 1) * (design.transforms.ears?.sx ?? 1);
  const angle = THREE.MathUtils.degToRad(design.ears?.facingAngle ?? 0);
  const hingeOffset = lateralScale * (EAR_HINGE_DEPTH * Math.sin(angle) + EAR_HINGE_LATERAL * (1 - Math.cos(angle)));
  for (const [tag, boneName, side] of [["ear_L", "Ear_L", 1], ["ear_R", "Ear_R", -1]] as const) {
    const ear = parts.find((part) => part.tag === tag);
    if (!ear) continue;
    const anchor = rig.worldRest.get(boneName);
    const originalX = anchor.x;
    const position = ear.geo.attributes.position, uv = ear.geo.attributes.uv;
    const weights = ear.geo.attributes.skinWeight;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      position.setX(i, x + surfaceX(y, z, side) - originalX + side * (hingeOffset - 0.0035 * lateralScale));
      const anterior = -uv.getX(i) * Math.sin(uv.getY(i) * Math.PI * 2);
      const attachment = smoothstep(0.3, 0.75, anterior);
      const earWeight = weights.getX(i) * (1 - attachment);
      weights.setXY(i, earWeight, 1 - earWeight);
    }
    anchor.x = surfaceX(anchor.y, anchor.z, side) + side * (hingeOffset - 0.0035 * lateralScale);
    rig.boneMap.get(boneName).position.copy(anchor).sub(rig.worldRest.get("Head"));
    position.needsUpdate = weights.needsUpdate = true;
    ear.geo.computeVertexNormals();
  }
}
