import type * as THREE from "three";
import { SIDES } from "../../shared/sides.js";
import type { HumanoidRig } from "./types.js";

/**
 * Linear blend skinning collapses when one seam blends a large rotation difference.
 * Helpers split it into half-angle seams: Deltoid takes half of UpperArm's rotation,
 * ForearmTwist takes half of Hand's twist about the forearm axis.
 */
export function createTwistHelpers(rig: HumanoidRig) {
  const bm = rig.boneMap;
  const forearmTwistAxes: Record<string, THREE.Vector3> = Object.fromEntries(SIDES.map(([side]) => [side,
    rig.worldRest.get(`Hand_${side}`).clone().sub(rig.worldRest.get(`Forearm_${side}`)).normalize()]));

  /** Drive the helper bones from the current arm pose. Call after all arm/hand posing. */
  function update() {
    for (const [side] of SIDES) {
      bm.get(`Deltoid_${side}`).quaternion.identity().slerp(bm.get(`UpperArm_${side}`).quaternion, 0.5);
      const hq = bm.get(`Hand_${side}`).quaternion, axis = forearmTwistAxes[side];
      let twist = 2 * Math.atan2(hq.x * axis.x + hq.y * axis.y + hq.z * axis.z, hq.w);
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      bm.get(`ForearmTwist_${side}`).quaternion.setFromAxisAngle(axis, twist * 0.5);
    }
  }
  return { update };
}
