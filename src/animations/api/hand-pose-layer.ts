import type * as THREE from "three";
import type { HumanoidRig, KeyedMap } from "../../rigging/api/types.js";
import { SIDES } from "../../shared/sides.js";
import { HAND_GESTURES, handPoseQuaternions, type HandGesture } from "./hand-gestures.js";

/**
 * Per-hand finger posing that eases toward the selected gesture each frame.
 * Creating the layer puts both hands in the relaxed pose, which becomes part of the rest pose.
 */
export function createHandPoseLayer(rig: HumanoidRig) {
  const bm = rig.boneMap;
  const handGestures: { L: HandGesture; R: HandGesture } = { L: "auto", R: "auto" };
  const currentHandQuats = new Map<string, THREE.Quaternion>() as KeyedMap<THREE.Quaternion>;
  const openThumbQuats: Record<"L" | "R", Map<string, THREE.Quaternion>> = { L: handPoseQuaternions("L", HAND_GESTURES.open), R: handPoseQuaternions("R", HAND_GESTURES.open) };
  for (const [side] of SIDES) {
    for (const [name, q] of handPoseQuaternions(side, HAND_GESTURES.relaxed)) {
      bm.get(name).quaternion.copy(q);
      currentHandQuats.set(name, q.clone());
    }
  }

  function setHandGesture(name: HandGesture, side: "both" | "L" | "R" = "both") {
    if (name !== "auto" && !Object.hasOwn(HAND_GESTURES, name)) throw new Error(`Unknown hand gesture: ${name}.`);
    if (!["both", "L", "R"].includes(side)) throw new Error(`Unknown hand side: ${side}.`);
    for (const key of side === "both" ? ["L", "R"] as const : [side]) handGestures[key] = name;
  }

  /** Eases fingers toward their gestures. `upperBlend` > 0 lets an upper-body clip drive the auto right hand. */
  function update(dt: number, upperBlend: number) {
    for (const [side] of SIDES) {
      const gesture = handGestures[side];
      const overlay = gesture === "auto" && side === "R" && upperBlend > 0.001;
      const target = handPoseQuaternions(side, HAND_GESTURES[gesture === "auto" ? "relaxed" : gesture]);
      // While fingers are still travelling, the thumb moves clear (open-hand thumb) so curling or
      // uncurling fingers never sweep through it; it settles into its target once they arrive.
      let fingerError = 0;
      for (const [name, q] of target) if (!name.startsWith("Thumb")) fingerError = Math.max(fingerError, currentHandQuats.get(name).angleTo(q));
      const clearThumb = !overlay && fingerError > 0.3;
      const k = 1 - Math.exp(-14 * dt);
      for (const [name, q] of target) {
        const bone = bm.get(name), current = currentHandQuats.get(name);
        const goal = overlay ? bone.quaternion : clearThumb && name.startsWith("Thumb") ? openThumbQuats[side].get(name)! : q;
        current.slerp(goal, k);
        bone.quaternion.copy(current);
      }
    }
  }

  return {
    setHandGesture, update,
    get gestures() { return { ...handGestures }; },
  };
}
