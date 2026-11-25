import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { buildCervicalSurface } from "./body/cervical.js";
import { ensureUniformAttributes } from "./geometry/attributes.js";
import type { HumanoidRig } from "../../rigging/api/types.js";
import type { MeshPart } from "./types.js";

/** Merges body and head parts plus the generated cervical (neck) surface into one indexed geometry with material groups. */
export function mergeCharacterParts(parts: MeshPart[], rig: HumanoidRig): THREE.BufferGeometry {
  const headIndex = parts.findIndex((part) => part.tag === "head");
  const head = parts[headIndex].geo;
  const count = (sum: number, part: MeshPart) => sum + part.geo.attributes.position.count;
  const headOffset = parts.slice(0, headIndex).reduce(count, 0);
  const neckOffset = parts.reduce(count, 0);
  const neck = buildCervicalSurface(parts[0].geo, head, rig, headOffset, neckOffset);
  const merged = BufferGeometryUtils.mergeGeometries([...parts.map((part) => part.geo), neck.geo]
    .map(ensureUniformAttributes), true);
  if (!merged) throw new Error("Could not merge procedural character geometry.");
  parts.forEach((part, i) => { merged.groups[i].materialIndex = part.mat; });
  const neckGroup = merged.groups.at(-1)!;
  neckGroup.count = neck.indices.length;
  neckGroup.materialIndex = parts[headIndex].mat;
  const index = new Uint32Array(neckGroup.start + neckGroup.count);
  index.set(merged.index!.array);
  index.set(neck.indices, neckGroup.start);
  // Skin uses triplanar mapping, so the skull's old UV seam can share indices too.
  const stride = head.userData.skullStride;
  const group = merged.groups[headIndex];
  for (let i = group.start; i < group.start + group.count; i++) {
    if ((index[i] - headOffset) % stride === stride - 1) index[i] -= stride - 1;
  }
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  const normals = merged.attributes.normal as THREE.BufferAttribute;
  merged.deleteAttribute("normal");
  merged.computeVertexNormals();
  const welded = merged.attributes.normal;
  const setNormal = (i: number) => normals.setXYZ(i, welded.getX(i), welded.getY(i), welded.getZ(i));
  for (let i = headOffset; i < headOffset + head.attributes.position.count; i += stride) {
    setNormal(i);
  }
  const joins = [...neck.bodyRim, ...neck.headRim];
  joins.forEach(setNormal);
  for (let i = neckOffset; i < normals.count; i++) setNormal(i);
  merged.setAttribute("normal", normals);
  merged.userData.neckJoinNormals = joins.map((i) => [i, normals.getX(i), normals.getY(i), normals.getZ(i)]);
  const loop = head.userData.mouthLoopIndices;
  merged.userData.mouthRimCount = loop.length >= 8 ? loop.length + 1 : 0;
  return merged;
}

/** Restores the welded normals along the neck seam after a body or head surface update. */
export function restoreNeckJoinNormals(geometry: THREE.BufferGeometry): void {
  for (const [i, x, y, z] of geometry.userData.neckJoinNormals) {
    geometry.attributes.normal.setXYZ(i, x, y, z);
  }
}
