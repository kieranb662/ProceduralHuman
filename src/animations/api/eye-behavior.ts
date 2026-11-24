import * as THREE from "three";
import type { HumanoidRig } from "../../rigging/api/types.js";
import type { FaceSliders } from "./face-sliders.js";

// Clamp a bone's yaw/pitch so procedural gaze can never exceed anatomical limits
const limitBone = (b: THREE.Bone, max: number) => {
  const e = new THREE.Euler().setFromQuaternion(b.quaternion, "YXZ");
  e.y = THREE.MathUtils.clamp(e.y, -max, max);
  e.x = THREE.MathUtils.clamp(e.x, -max, max);
  b.quaternion.setFromEuler(e);
};

/**
 * Eye micro-saccades with coupled head/neck follow, plus periodic blinking.
 * `rng` drives all timing so replays can be made deterministic.
 */
export function createEyeBehavior(rig: HumanoidRig, faceSliders: FaceSliders, triggerBlink: () => void, rng: () => number) {
  const bm = rig.boneMap;
  const gazeState = {
    targetX: 0, targetY: 0, currentX: 0, currentY: 0,
    headYaw: 0, headPitch: 0, saccadeTimer: 1.2,
  };
  let blinkTimer = 2.4;

  /** Saccades and head/neck follow. Run after the body layers, before the face layer. */
  function updateGaze(dt: number, autoGaze: boolean, autoBlink: boolean) {
    const manualGazeActive = Math.abs(faceSliders.eyeX) > 0.01 || Math.abs(faceSliders.eyeY) > 0.01;
    if (autoGaze && !manualGazeActive) {
      gazeState.saccadeTimer -= dt;
      if (gazeState.saccadeTimer <= 0) {
        const prevX = gazeState.targetX;
        const prevY = gazeState.targetY;
        if (rng() < 0.45) {
          gazeState.targetX = (rng() - 0.5) * 0.14;
          gazeState.targetY = (rng() - 0.5) * 0.10;
        } else {
          gazeState.targetX = (rng() - 0.5) * 0.72;
          gazeState.targetY = (rng() - 0.5) * 0.44;
        }
        const shiftMag = Math.hypot(gazeState.targetX - prevX, gazeState.targetY - prevY);
        if (shiftMag > 0.42 && autoBlink) {
          triggerBlink();
          blinkTimer = 2.4 + rng() * 2.8;
        }
        gazeState.saccadeTimer = 0.75 + rng() * 2.2;
      }
    } else {
      gazeState.targetX = 0;
      gazeState.targetY = 0;
    }

    gazeState.currentX = THREE.MathUtils.damp(gazeState.currentX, gazeState.targetX, 28, dt);
    gazeState.currentY = THREE.MathUtils.damp(gazeState.currentY, gazeState.targetY, 28, dt);
    const desiredHeadYaw = gazeState.targetX * 0.16 + faceSliders.eyeX * 0.60;
    const desiredHeadPitch = -(gazeState.targetY * 0.11 + faceSliders.eyeY * 0.36);
    gazeState.headYaw = THREE.MathUtils.damp(gazeState.headYaw, desiredHeadYaw, 4.5, dt);
    gazeState.headPitch = THREE.MathUtils.damp(gazeState.headPitch, desiredHeadPitch, 4.5, dt);

    if (Math.abs(gazeState.headYaw) > 1e-4 || Math.abs(gazeState.headPitch) > 1e-4) {
      const neckQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(gazeState.headPitch * 0.4, gazeState.headYaw * 0.4, 0, "YXZ"));
      const headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(gazeState.headPitch * 0.6, gazeState.headYaw * 0.6, gazeState.headYaw * -0.15, "YXZ"));
      bm.get("Neck").quaternion.multiply(neckQ);
      bm.get("Head").quaternion.multiply(headQ);
      limitBone(bm.get("Neck"), 0.5);
      limitBone(bm.get("Head"), 0.7);
    }
  }

  /** Periodic blinks. */
  function updateBlink(dt: number, autoBlink: boolean) {
    if (autoBlink) {
      blinkTimer -= dt;
      if (blinkTimer <= 0) {
        triggerBlink();
        blinkTimer = 2.6 + rng() * 3.4;
      }
    }
  }

  return {
    updateGaze, updateBlink,
    /** Current procedural eye offset, added to the eyeX/eyeY sliders. */
    get gaze() { return { x: gazeState.currentX, y: gazeState.currentY }; },
  };
}
