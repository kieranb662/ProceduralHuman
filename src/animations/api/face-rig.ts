import * as THREE from "three";
import { FACIAL_BONES } from "../../rigging/api/bone-names.js";
import type { RestPose } from "../../rigging/api/rest-pose.js";
import type { HumanoidRig } from "../../rigging/api/types.js";
import type { FaceSliders } from "./face-sliders.js";

/** Facial bone/morph control: reset to rest before the face mixer, then layer the manual sliders on top. */
export function createFaceRig(rig: HumanoidRig, skinnedMesh: THREE.SkinnedMesh, restPose: RestPose, faceSliders: FaceSliders) {
  function resetToRest() {
    restPose.reset(FACIAL_BONES);
    if (skinnedMesh.morphTargetInfluences) {
      skinnedMesh.morphTargetInfluences.fill(0);
    }
  }

  /** Applies the face sliders plus the procedural gaze offset (`gazeX/gazeY`, -1..1). */
  function applySliders(gazeX: number, gazeY: number) {
    const bm = rig.boneMap;
    const dict = skinnedMesh.morphTargetDictionary;
    const inf = skinnedMesh.morphTargetInfluences;
    const addMorph = (name, val) => {
      const idx = dict?.[name];
      if (idx !== undefined && inf) {
        inf[idx] = THREE.MathUtils.clamp(inf[idx] + val, 0, 1);
      }
    };
    const addRot = (name, rx, ry, rz) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
      bm.get(name).quaternion.multiply(q);
    };
    const addPos = (name, dx, dy, dz) => {
      const b = bm.get(name);
      b.position.x += dx;
      b.position.y += dy;
      b.position.z += dz;
    };

    if (faceSliders.jaw !== 0) addRot("Jaw", faceSliders.jaw * 0.42, 0, 0);
    const tongueOut = THREE.MathUtils.clamp(faceSliders.tongueOut, 0, 1);
    const tongueCurl = THREE.MathUtils.clamp(faceSliders.tongueCurl, -1, 1);
    if (tongueOut > 0 || tongueCurl !== 0) {
      const jaw = bm.get("Jaw");
      const opening = new THREE.Euler().setFromQuaternion(jaw.quaternion, "XYZ").x;
      const clearance = 0.26 * tongueOut;
      if (opening < clearance) addRot("Jaw", clearance - opening, 0, 0);
      addRot("TongueBase", -0.30 * tongueOut, 0, 0);
      addPos("TongueMid", 0, 0.003 * tongueOut, 0.020 * tongueOut);
      addPos("TongueTip", 0, 0, 0.028 * tongueOut);
      addRot("TongueMid", -0.30 * tongueCurl, 0, 0);
      addRot("TongueTip", -0.50 * tongueCurl, 0, 0);
    }
    if (faceSliders.smile !== 0) {
      addMorph("mouthSmile_L", faceSliders.smile);
      addMorph("mouthSmile_R", faceSliders.smile);
    }
    if (faceSliders.pucker !== 0) addMorph("mouthPucker", faceSliders.pucker);
    if (faceSliders.browUp !== 0) {
      addMorph("browInnerUp", faceSliders.browUp);
      addMorph("browOuterUp_L", faceSliders.browUp * 0.7);
      addMorph("browOuterUp_R", faceSliders.browUp * 0.7);
    }
    if (faceSliders.browDown !== 0) {
      addMorph("browDown_L", faceSliders.browDown);
      addMorph("browDown_R", faceSliders.browDown);
    }
    if (faceSliders.cheek !== 0) {
      addMorph("cheekSquint_L", faceSliders.cheek);
      addMorph("cheekSquint_R", faceSliders.cheek);
    }
    if (faceSliders.upperLip !== 0) {
      addPos("UpperLip_C", 0, faceSliders.upperLip * 0.008, faceSliders.upperLip * 0.004);
      addPos("UpperLip_L", 0, faceSliders.upperLip * 0.005, faceSliders.upperLip * 0.002);
      addPos("UpperLip_R", 0, faceSliders.upperLip * 0.005, faceSliders.upperLip * 0.002);
    }
    if (faceSliders.lowerLip !== 0) {
      addPos("LowerLip_C", 0, -faceSliders.lowerLip * 0.009, faceSliders.lowerLip * 0.005);
      addPos("LowerLip_L", 0, -faceSliders.lowerLip * 0.005, faceSliders.lowerLip * 0.002);
      addPos("LowerLip_R", 0, -faceSliders.lowerLip * 0.005, faceSliders.lowerLip * 0.002);
    }
    if (faceSliders.lidTop !== 0) {
      addRot("EyelidTop_L", faceSliders.lidTop * 0.72, 0, 0);
      addRot("EyelidTop_R", faceSliders.lidTop * 0.72, 0, 0);
    }
    if (faceSliders.lidBot !== 0) {
      addRot("EyelidBot_L", -faceSliders.lidBot * 0.34, 0, 0);
      addRot("EyelidBot_R", -faceSliders.lidBot * 0.34, 0, 0);
    }

    const totalEyeX = THREE.MathUtils.clamp(faceSliders.eyeX + gazeX, -1, 1);
    const totalEyeY = THREE.MathUtils.clamp(faceSliders.eyeY + gazeY, -1, 1);
    if (Math.abs(totalEyeX) > 1e-4 || Math.abs(totalEyeY) > 1e-4) {
      const ey = totalEyeX * 0.42;
      const ex = -totalEyeY * 0.30;
      bm.get("Eye_L").quaternion.setFromEuler(new THREE.Euler(ex, ey, 0, "YXZ"));
      bm.get("Eye_R").quaternion.setFromEuler(new THREE.Euler(ex, ey, 0, "YXZ"));
      addRot("EyelidTop_L", ex * 0.32, 0, 0);
      addRot("EyelidTop_R", ex * 0.32, 0, 0);
    }

    if (faceSliders.nose !== 0) {
      addPos("NoseTip", 0, faceSliders.nose * 0.005, -faceSliders.nose * 0.002);
      addPos("Nostril_L", faceSliders.nose * 0.004, faceSliders.nose * 0.004, 0.001);
      addPos("Nostril_R", -faceSliders.nose * 0.004, faceSliders.nose * 0.004, 0.001);
    }
    if (faceSliders.ears !== 0) {
      addRot("Ear_L", 0, -faceSliders.ears * 0.30, faceSliders.ears * 0.16);
      addRot("Ear_R", 0, faceSliders.ears * 0.30, -faceSliders.ears * 0.16);
    }
  }

  return { resetToRest, applySliders };
}
