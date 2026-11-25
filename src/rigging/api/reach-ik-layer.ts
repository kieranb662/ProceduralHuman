import * as THREE from "three";
import { solveRightArmReachIK } from "./ik.js";
import type { HumanoidRig, KeyedMap } from "./types.js";

const IK_BLEND_BONES = ["Chest", "Clavicle_R", "UpperArm_R", "Forearm_R", "Hand_R"];

/** Smoothly blended, post-mixer 2-bone IK that reaches the right hand toward a world target. */
export function createReachIkLayer(rig: HumanoidRig, characterRoot: THREE.Object3D) {
  const bm = rig.boneMap;
  const preIkQuats = new Map<string, THREE.Quaternion>() as KeyedMap<THREE.Quaternion>;
  for (const name of IK_BLEND_BONES) preIkQuats.set(name, new THREE.Quaternion());
  let reachBlend = 0;

  function update(dt: number, active: boolean, target: THREE.Vector3 | null | undefined) {
    const targetReach = (active && target) ? 1 : 0;
    reachBlend = THREE.MathUtils.damp(reachBlend, targetReach, 10, dt);

    if (reachBlend > 0.001 && target) {
      for (const name of IK_BLEND_BONES) {
        preIkQuats.get(name).copy(bm.get(name).quaternion);
      }
      solveRightArmReachIK(rig, target, characterRoot);
      if (reachBlend < 0.999) {
        for (const name of IK_BLEND_BONES) {
          const b = bm.get(name);
          const ikQ = b.quaternion.clone();
          b.quaternion.copy(preIkQuats.get(name)).slerp(ikQ, reachBlend);
        }
      }
    }
  }
  return { update };
}
