import type * as THREE from "three";

/** The procedural humanoid skeleton returned by createHumanoidSkeleton(). */
export interface HumanoidRig {
  bones: THREE.Bone[];
  boneMap: Map<string, THREE.Bone>;
  boneIndex: Map<string, number>;
  /** World-space rest position of every bone. */
  worldRest: Map<string, THREE.Vector3>;
  skeleton: THREE.Skeleton;
  handSockets: { left: THREE.Object3D; right: THREE.Object3D };
}
