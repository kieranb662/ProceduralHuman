import type * as THREE from "three";
import type { PackedWeights } from "../../../rigging/api/skin-weights.js";

/** One cross-section for loftRings(): points around the ring, their skin weights, and the V texture coordinate. */
export interface LoftRing {
  points: THREE.Vector3[];
  weights: PackedWeights[];
  v?: number;
}

/** One station along a buildChainTube() limb: center, elliptical radii and skin weight. */
export interface TubeSegment {
  pos: THREE.Vector3;
  rx: number;
  rz: number;
  weight: PackedWeights;
  v?: number;
}

/** Flat vertex attribute arrays accumulated before building a BufferGeometry. */
export type NumberArray = ArrayLike<number> & Iterable<number>;
