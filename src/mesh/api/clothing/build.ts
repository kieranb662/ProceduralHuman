import * as THREE from "three";
import type { MeshPart } from "../types.js";
import type { ClothingSlot } from "./items.js";
import { buildGeometryFromArrays } from "../geometry/attributes.js";

/**
 * Builds a garment by offsetting the body faces tagged for `slot`/`item` along their normals.
 * userData.coveredTriangles lists the body index offsets the garment hides.
 */
export function buildClothingGeometry(bodyParts: MeshPart[], slot: ClothingSlot, item: string): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [];
  const skinIdx: number[] = [], skinWgt: number[] = [], indices: number[] = [];
  const coveredTriangles: number[] = [], sourceVertices: number[] = [];
  const offset = slot === "torso" || slot === "arms" ? 0.010 : 0.007;
  let indexOffset = 0, vertexOffset = 0;
  bodyParts.forEach((part) => {
    const geo = part.geo, index = geo.index!;
    const slots = geo.userData.faceSlots;
    const p = geo.attributes.position, n = geo.attributes.normal;
    const vertexMap = new Map();
    if (slots) for (let j = 0; j < index.count; j += 3) {
      const face = [index.getX(j), index.getX(j + 1), index.getX(j + 2)];
      const region = slots[j / 3];
      const band = geo.userData.faceBands?.[j / 3];
      const y = face.reduce((sum, i) => sum + p.getY(i), 0) / 3;
      const matches = slot === "torso" ? region === "torso" && y >= (item === "cropped" ? 1.16 : 1.00) && y < 1.50
        : slot === "arms" ? region.startsWith("arms_") && band <= (item === "short" ? 2 : 10)
        : slot === "legs" ? (region === "torso" && y < 1.02)
          || (region.startsWith("legs_") && band <= (item === "shorts" ? 3 : 10))
        : region.startsWith("legs_") && band >= 11 && band <= 17;
      if (!matches) continue;
      coveredTriangles.push(indexOffset + j);
      for (const i of face) {
        if (!vertexMap.has(i)) {
          const v = positions.length / 3;
          vertexMap.set(i, v);
          sourceVertices.push(vertexOffset + i);
          positions.push(p.getX(i) + n.getX(i) * offset, p.getY(i) + n.getY(i) * offset, p.getZ(i) + n.getZ(i) * offset);
          normals.push(n.getX(i), n.getY(i), n.getZ(i));
          uvs.push(geo.attributes.uv.getX(i), geo.attributes.uv.getY(i));
          colors.push(1, 1, 1);
          for (let k = 0; k < 4; k++) {
            skinIdx.push(geo.attributes.skinIndex.array[i * 4 + k]);
            skinWgt.push(geo.attributes.skinWeight.array[i * 4 + k]);
          }
        }
        indices.push(vertexMap.get(i));
      }
    }
    indexOffset += index.count;
    vertexOffset += p.count;
  });
  if (!indices.length) throw new Error(`No geometry for clothing slot ${slot}: ${item}.`);
  const geo = buildGeometryFromArrays(positions, uvs, colors, skinIdx, skinWgt, indices);
  geo.userData.coveredTriangles = coveredTriangles;
  geo.userData.sourceVertices = sourceVertices;
  geo.userData.surfaceOffset = offset;
  // Keep the base normals at openings; recalculating a cut shell makes its hem visibly faceted.
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

/** Re-projects a garment onto the (re-sculpted) body surface it was built from. */
export function fitClothingToBody(geo: THREE.BufferGeometry, body: THREE.BufferGeometry): void {
  const { sourceVertices, surfaceOffset } = geo.userData;
  const { position, normal } = geo.attributes;
  const { position: p, normal: n } = body.attributes;
  (sourceVertices as number[]).forEach((j, i) => {
    const x = n.getX(j), y = n.getY(j), z = n.getZ(j);
    position.setXYZ(i, p.getX(j) + x * surfaceOffset, p.getY(j) + y * surfaceOffset, p.getZ(j) + z * surfaceOffset);
    normal.setXYZ(i, x, y, z);
  });
  position.needsUpdate = normal.needsUpdate = true;
  geo.boundingBox = geo.boundingSphere = null;
}
