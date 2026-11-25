import * as THREE from "three";
import type { HumanoidRig } from "../../../rigging/api/types.js";
import type { MeshPart } from "../types.js";
import { buildClothingGeometry, fitClothingToBody } from "./build.js";
import { CLOTHING_ITEMS, type ClothingItem, type ClothingSlot, type Outfit } from "./items.js";

export interface ClothingSlotState {
  items: Record<string, string>;
  item: string;
  mesh: THREE.SkinnedMesh | null;
}

/**
 * Removable garments skinned to the body's skeleton. Body triangles under a garment are
 * degenerated (not removed) so group offsets and facial morph topology stay intact.
 */
export function createClothingController(rig: HumanoidRig, skinnedMesh: THREE.SkinnedMesh, bodyParts: MeshPart[]) {
  const root = new THREE.Group();
  root.name = "ClothingSlots";
  const slots = Object.fromEntries(Object.entries(CLOTHING_ITEMS).map(([name, items]) =>
    [name, { items: { ...items }, item: "none", mesh: null }])) as unknown as Record<ClothingSlot, ClothingSlotState>;
  const baseBodyIndices = skinnedMesh.geometry.index!.array.slice(0, bodyParts.reduce((sum, part) => sum + part.geo.index!.count, 0));
  const materials = () => skinnedMesh.material as THREE.Material[];

  /** Re-applies triangle coverage for the worn garments to the body's current index buffer. */
  function updateCoverage() {
    const index = skinnedMesh.geometry.index!;
    index.array.set(baseBodyIndices);
    for (const slot of Object.values(slots)) {
      if (!slot.mesh) continue;
      for (const j of slot.mesh.geometry.userData.coveredTriangles) {
        // Degenerate only covered triangles, preserving group offsets and facial morph topology.
        index.array[j + 1] = index.array[j + 2] = index.array[j];
      }
    }
    index.needsUpdate = true;
  }

  const validate = (slot: string, item: string) => {
    if (!Object.hasOwn(CLOTHING_ITEMS, slot) || !Object.hasOwn(CLOTHING_ITEMS[slot as ClothingSlot], item)) {
      throw new Error(`Unknown clothing item ${slot}: ${item}.`);
    }
  };

  function setClothing<S extends ClothingSlot>(slotName: S, item: ClothingItem<S>) {
    validate(slotName, item as string);
    const slot = slots[slotName];
    if (slot.item === item) return;
    let mesh = null;
    if (item !== "none") {
      const geo = buildClothingGeometry(bodyParts, slotName, item as string);
      const materialIndex = slotName === "legs" ? 2 : slotName === "feet" ? 7 : 1;
      geo.userData.materialIndex = materialIndex;
      mesh = new THREE.SkinnedMesh(geo, materials()[materialIndex]);
      mesh.name = `Clothing_${slotName}_${String(item)}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      // Never recalculate inverses in an animated pose: every garment uses the original bind matrix.
      mesh.bind(rig.skeleton, skinnedMesh.bindMatrix);
    }
    if (slot.mesh) {
      root.remove(slot.mesh);
      slot.mesh.geometry.dispose();
    }
    slot.mesh = mesh;
    slot.item = item as string;
    if (mesh) root.add(mesh);
    updateCoverage();
  }

  function setOutfit(outfit: Outfit = {}) {
    for (const [slot, item] of Object.entries(outfit)) validate(slot, item);
    for (const slot of Object.keys(slots) as ClothingSlot[]) setClothing(slot, (outfit[slot] ?? "none") as ClothingItem<typeof slot>);
  }

  /** Re-points garments at skinnedMesh.material after the materials are replaced. */
  function refreshMaterials() {
    for (const slot of Object.values(slots)) {
      if (slot.mesh) slot.mesh.material = materials()[slot.mesh.geometry.userData.materialIndex as number];
    }
  }

  /** Re-fits worn garments to the body surface after it is re-sculpted. */
  function refit() {
    for (const slot of Object.values(slots)) {
      if (slot.mesh) {
        fitClothingToBody(slot.mesh.geometry, skinnedMesh.geometry);
        (slot.mesh as any).boundingBox = (slot.mesh as any).boundingSphere = null;
      }
    }
  }

  /** Re-binds garments to the skeleton (after the body is re-bound). */
  function rebind() {
    for (const slot of Object.values(slots)) {
      if (slot.mesh) slot.mesh.bind(rig.skeleton, skinnedMesh.bindMatrix);
    }
  }

  /** Removes and frees every garment (materials are owned by the body). */
  function dispose() {
    for (const slot of Object.values(slots)) {
      if (!slot.mesh) continue;
      slot.mesh.removeFromParent();
      slot.mesh.geometry.dispose();
      slot.mesh = null;
      slot.item = "none";
    }
    root.removeFromParent();
  }

  return { root, slots, setClothing, setOutfit, refreshMaterials, refit, rebind, updateCoverage, dispose };
}

export type ClothingController = ReturnType<typeof createClothingController>;
