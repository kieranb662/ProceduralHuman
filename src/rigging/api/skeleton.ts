import { SIDES } from "../../shared/sides.js";
import * as THREE from "three";
import { handLayout } from "./hand-layout.js";
import type { HumanoidRig, KeyedMap } from "./types.js";

// --- 1. Skeleton Builder (body + 3-joint fingers & thumb) ---
export function createHumanoidSkeleton(): HumanoidRig {
  const bones: THREE.Bone[] = [];
  const boneMap = new Map<string, THREE.Bone>() as KeyedMap<THREE.Bone>;
  const boneIndex = new Map<string, number>() as KeyedMap<number>;
  const worldRest = new Map<string, THREE.Vector3>() as KeyedMap<THREE.Vector3>;

  function addBone(name: string, parentName: string | null, wx: number, wy: number, wz: number) {
    const bone = new THREE.Bone();
    bone.name = name;
    const wp = new THREE.Vector3(wx, wy, wz);
    worldRest.set(name, wp);
    if (parentName) {
      const parent = boneMap.get(parentName);
      const pwp = worldRest.get(parentName);
      bone.position.copy(wp).sub(pwp);
      parent.add(bone);
    } else {
      bone.position.copy(wp);
    }
    boneIndex.set(name, bones.length);
    boneMap.set(name, bone);
    bones.push(bone);
    return bone;
  }

  addBone("Root", null, 0, 0, 0);
  addBone("Hips", "Root", 0, 0.94, 0);
  addBone("Spine", "Hips", 0, 1.08, 0);
  addBone("Spine1", "Spine", 0, 1.24, 0.005);
  addBone("Chest", "Spine1", 0, 1.38, 0.002);
  addBone("Neck", "Chest", 0, 1.48, -0.002);
  addBone("Head", "Neck", 0, 1.56, 0.004);

  addBone("Jaw", "Head", 0, 1.622, 0.018);
  addBone("TongueBase", "Jaw", 0, 1.5830, 0.066);
  addBone("TongueMid", "TongueBase", 0, 1.5833, 0.082);
  addBone("TongueTip", "TongueMid", 0, 1.5837, 0.095);
  addBone("LowerLip_C", "Jaw", 0, 1.586, 0.116);
  addBone("LowerLip_L", "Jaw", 0.015, 1.588, 0.112);
  addBone("LowerLip_R", "Jaw", -0.015, 1.588, 0.112);
  addBone("UpperLip_C", "Head", 0, 1.604, 0.117);
  addBone("UpperLip_L", "Head", 0.015, 1.602, 0.113);
  addBone("UpperLip_R", "Head", -0.015, 1.602, 0.113);
  addBone("MouthCorner_L", "Head", 0.029, 1.596, 0.103);
  addBone("MouthCorner_R", "Head", -0.029, 1.596, 0.103);

  const eyeX = 0.033, eyeY = 1.666, eyeZ = 0.10;
  addBone("Eye_L", "Head", eyeX, eyeY, eyeZ);
  addBone("Eye_R", "Head", -eyeX, eyeY, eyeZ);
  addBone("EyelidTop_L", "Head", eyeX, eyeY, eyeZ);
  addBone("EyelidTop_R", "Head", -eyeX, eyeY, eyeZ);
  addBone("EyelidBot_L", "Head", eyeX, eyeY, eyeZ);
  addBone("EyelidBot_R", "Head", -eyeX, eyeY, eyeZ);

  addBone("Brow_L", "Head", 0.033, 1.693, 0.112);
  addBone("Brow_R", "Head", -0.033, 1.693, 0.112);
  addBone("NoseTip", "Head", 0, 1.630, 0.125);
  addBone("Nostril_L", "Head", 0.013, 1.625, 0.112);
  addBone("Nostril_R", "Head", -0.013, 1.625, 0.112);
  addBone("Ear_L", "Head", 0.084, 1.656, -0.008);
  addBone("Ear_R", "Head", -0.084, 1.656, -0.008);

  for (const [side, s] of SIDES) {
    addBone(`Clavicle_${side}`, "Chest", s * 0.07, 1.415, 0.004);
    addBone(`UpperArm_${side}`, `Clavicle_${side}`, s * 0.195, 1.405, -0.006);
    addBone(`Forearm_${side}`, `UpperArm_${side}`, s * 0.425, 1.225, -0.014);
    addBone(`Hand_${side}`, `Forearm_${side}`, s * 0.560, 1.025, 0.008);
    addBone(`Fingers_${side}`, `Hand_${side}`, s * 0.585, 0.960, 0.014);

    // Jointed fingers (3 phalanges each) + 2 extra thumb joints
    const hl = handLayout(s);
    addBone(`Thumb_${side}`, `Hand_${side}`, hl.thumb.tStart.x, hl.thumb.tStart.y, hl.thumb.tStart.z);
    for (const f of hl.fingers) {
      addBone(`${f.name}1_${side}`, `Hand_${side}`, f.P.x, f.P.y, f.P.z);
      addBone(`${f.name}2_${side}`, `${f.name}1_${side}`, f.J1.x, f.J1.y, f.J1.z);
      addBone(`${f.name}3_${side}`, `${f.name}2_${side}`, f.J2.x, f.J2.y, f.J2.z);
    }
    addBone(`Thumb2_${side}`, `Thumb_${side}`, hl.thumb.tMid.x, hl.thumb.tMid.y, hl.thumb.tMid.z);
    addBone(`Thumb3_${side}`, `Thumb2_${side}`, hl.thumb.tJ3.x, hl.thumb.tJ3.y, hl.thumb.tJ3.z);
    // Shoulder helper driven to half of UpperArm's rotation in update().
    addBone(`Deltoid_${side}`, `Clavicle_${side}`, s * 0.195, 1.405, -0.006);
    // Mid-forearm helper driven to half of Hand's twist (pronation) in update().
    addBone(`ForearmTwist_${side}`, `Forearm_${side}`, s * 0.4925, 1.125, -0.003);
  }

  for (const [side, s] of SIDES) {
    addBone(`Thigh_${side}`, "Hips", s * 0.102, 0.905, 0.0);
    addBone(`Shin_${side}`, `Thigh_${side}`, s * 0.105, 0.495, 0.006);
    addBone(`Foot_${side}`, `Shin_${side}`, s * 0.106, 0.082, -0.012);
    addBone(`Toe_${side}`, `Foot_${side}`, s * 0.106, 0.025, 0.125);
  }

  const handSocketL = new THREE.Object3D();
  handSocketL.name = "HandSocket_L";
  handSocketL.position.copy(handLayout(1).palmDir).multiplyScalar(0.0731)
    .addScaledVector(handLayout(1).palmNormal, 0.0207).addScaledVector(handLayout(1).across, -0.0072);
  boneMap.get("Hand_L").add(handSocketL);

  const handSocketR = new THREE.Object3D();
  handSocketR.name = "HandSocket_R";
  handSocketR.position.copy(handLayout(-1).palmDir).multiplyScalar(0.0731)
    .addScaledVector(handLayout(-1).palmNormal, 0.0207).addScaledVector(handLayout(-1).across, -0.0072);
  boneMap.get("Hand_R").add(handSocketR);

  return {
    bones, boneMap, boneIndex, worldRest,
    skeleton: new THREE.Skeleton(bones),
    handSockets: { left: handSocketL, right: handSocketR },
  };
}
