import type * as THREE from "three";

/** One generated surface before merging: its geometry, material slot index and part tag. */
export interface MeshPart {
  geo: THREE.BufferGeometry;
  mat: number;
  tag: string;
}
