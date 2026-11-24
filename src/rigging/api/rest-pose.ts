import type * as THREE from "three";
import type { HumanoidRig } from "./types.js";

/** Local rest transforms of every bone, captured once and restored before each animation frame. */
export interface RestPose {
  position: Map<string, THREE.Vector3>;
  quaternion: Map<string, THREE.Quaternion>;
  /** Restores the named bones (default: all bones) to their rest transform. */
  reset(names?: Iterable<string>): void;
}

export function captureRestPose(rig: HumanoidRig): RestPose {
  const position = new Map<string, THREE.Vector3>();
  const quaternion = new Map<string, THREE.Quaternion>();
  for (const b of rig.bones) {
    position.set(b.name, b.position.clone());
    quaternion.set(b.name, b.quaternion.clone());
  }
  function reset(names?: Iterable<string>) {
    for (const name of names ?? rig.bones.map((b) => b.name)) {
      const b = rig.boneMap.get(name);
      b.position.copy(position.get(name));
      b.quaternion.copy(quaternion.get(name));
    }
  }
  return { position, quaternion, reset };
}
