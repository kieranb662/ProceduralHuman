import type * as THREE from "three";

/**
 * A Map keyed by known names (bone names). `get` is typed as always returning a value: callers
 * look up the fixed bone set of the humanoid rig.
 */
export interface KeyedMap<V, K = string> extends Map<K, V> {
  get(key: K): V;
}

/** The procedural humanoid skeleton returned by createHumanoidSkeleton(). */
export interface HumanoidRig {
  bones: THREE.Bone[];
  boneMap: KeyedMap<THREE.Bone>;
  boneIndex: KeyedMap<number>;
  /** World-space rest position of every bone. */
  worldRest: KeyedMap<THREE.Vector3>;
  skeleton: THREE.Skeleton;
  handSockets: { left: THREE.Object3D; right: THREE.Object3D };
}
