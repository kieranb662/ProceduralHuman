import type * as THREE from "three";
import { restoreNeckJoinNormals } from "../merge.js";
import { configureTorsoDetails, sculptTorso, type TorsoDetailChanges, type TorsoDetails } from "./torso.js";

/**
 * Live torso sculpting. Re-sculpts the unmerged body part from its neutral positions and copies
 * the surface into the merged character geometry.
 */
export function createTorsoController(
  bodyGeo: THREE.BufferGeometry,
  initial: TorsoDetailChanges | undefined,
  /** The merged character mesh (looked up lazily: the body is sculpted before merging). */
  getSkinnedMesh: () => THREE.SkinnedMesh,
  onSurfaceChanged: () => void,
) {
  const neutralBody = bodyGeo.attributes.position.array.slice();
  let torsoDetails = configureTorsoDetails(null, initial);
  sculptTorso(bodyGeo, neutralBody, torsoDetails);

  /** Copies the canonical body surface and weights into a merged character geometry. */
  function copyBodySurface(geometry: THREE.BufferGeometry) {
    for (const name of ["position", "normal", "skinIndex", "skinWeight"]) {
      geometry.attributes[name].array.set(bodyGeo.attributes[name].array);
      geometry.attributes[name].needsUpdate = true;
    }
    restoreNeckJoinNormals(geometry);
    geometry.boundingBox = geometry.boundingSphere = null;
  }

  function apply(next: TorsoDetails) {
    const skinnedMesh = getSkinnedMesh();
    sculptTorso(bodyGeo, neutralBody, next);
    torsoDetails = next;
    copyBodySurface(skinnedMesh.geometry);
    (skinnedMesh as any).boundingBox = (skinnedMesh as any).boundingSphere = null;
    onSurfaceChanged();
  }

  return {
    copyBodySurface,
    setTorsoDetails: (changes: TorsoDetailChanges) => apply(configureTorsoDetails(torsoDetails, changes)),
    resetTorsoDetails: () => apply(configureTorsoDetails()),
    get details() { return structuredClone(torsoDetails); },
  };
}
