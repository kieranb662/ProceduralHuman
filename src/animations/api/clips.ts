import * as THREE from "three";
import { HAND_GESTURES, handPoseQuaternions, type HandPose } from "./hand-gestures.js";
import { handLayout } from "../../rigging/api/hand-layout.js";
import { makeOrthonormalBasisQuat } from "../../rigging/api/ik.js";
import type { HumanoidRig } from "../../rigging/api/types.js";
import type { ClipName } from "./names.js";

// --- 3. Procedural AnimationClip Synthesizer ---
export function createHumanoidAnimations(rig: HumanoidRig): Record<ClipName, THREE.AnimationClip> {
  const { boneMap } = rig;
  const eulerQ = (rx: number, ry: number, rz: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));

  const elbowFlexQ = (sideSign: number, rad: number) => {
    const axis = new THREE.Vector3(0.84, sideSign * 0.54, 0).normalize();
    return new THREE.Quaternion().setFromAxisAngle(axis, -rad);
  };

  const makeQuatTrack = (boneName: string, times: number[], quats: Iterable<THREE.Quaternion>) => {
    const vals: number[] = [];
    for (const q of quats) vals.push(q.x, q.y, q.z, q.w);
    return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, vals);
  };

  const makePosTrack = (boneName: string, times: number[], offsets: readonly (readonly number[])[], smooth = false) => {
    const rest = boneMap.get(boneName).position;
    const vals: number[] = [];
    for (const o of offsets) vals.push(rest.x + o[0], rest.y + o[1], rest.z + o[2]);
    const track = new THREE.VectorKeyframeTrack(`${boneName}.position`, times, vals);
    if (smooth) track.setInterpolation(THREE.InterpolateSmooth);
    return track;
  };

  const makeMorphTrack = (morphName: string, times: number[], values: number[], smooth = true) => {
    const track = new THREE.NumberKeyframeTrack(`.morphTargetInfluences[${morphName}]`, times, values);
    if (smooth) track.setInterpolation(THREE.InterpolateSmooth);
    return track;
  };

  // Per-joint finger/thumb curl tracks (curl = radians, bends toward the palm)
  const fingerCurlTracks = (side: "L" | "R", times: number[], fingerCurls: HandPose["curl"], thumbCurls: HandPose["thumb"], thumbPose: Partial<HandPose> = {}) => {
    const pose = Array.isArray(fingerCurls[0]) || fingerCurls[0] > 0.5 ? HAND_GESTURES.grip : HAND_GESTURES.open;
    const quats = handPoseQuaternions(side, { ...pose, ...thumbPose, curl: fingerCurls, thumb: thumbCurls });
    return [...quats].map(([name, q]) => makeQuatTrack(name, times, times.map(() => q)));
  };

  const clips = {} as Record<ClipName, THREE.AnimationClip>;

  // 1. IDLE
  {
    const t = [0, 0.8, 1.6, 2.4, 3.2];
    clips.idle = new THREE.AnimationClip("idle", 3.2, [
      makePosTrack("Hips", t, [[0, 0, 0], [0.005, 0.007, 0], [0, 0.003, 0], [-0.005, 0.007, 0], [0, 0, 0]], true),
      makeQuatTrack("Spine", t, [eulerQ(0, 0, 0), eulerQ(-0.022, 0.01, -0.01), eulerQ(-0.01, 0, 0), eulerQ(-0.022, -0.01, 0.01), eulerQ(0, 0, 0)]),
      makeQuatTrack("Chest", t, [eulerQ(0, 0, 0), eulerQ(-0.032, 0, 0), eulerQ(-0.008, 0, 0), eulerQ(-0.032, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Head", t, [eulerQ(0, 0, 0), eulerQ(0.015, 0.035, 0), eulerQ(0.005, 0, 0), eulerQ(0.015, -0.035, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("UpperArm_L", t, [eulerQ(0, 0, -0.42), eulerQ(0.02, 0, -0.39), eulerQ(0, 0, -0.42), eulerQ(0.02, 0, -0.40), eulerQ(0, 0, -0.42)]),
      makeQuatTrack("UpperArm_R", t, [eulerQ(0, 0, 0.42), eulerQ(0.02, 0, 0.39), eulerQ(0, 0, 0.42), eulerQ(0.02, 0, 0.40), eulerQ(0, 0, 0.42)]),
      makeQuatTrack("Forearm_L", t, [elbowFlexQ(1, 0.14), elbowFlexQ(1, 0.17), elbowFlexQ(1, 0.14), elbowFlexQ(1, 0.17), elbowFlexQ(1, 0.14)]),
      makeQuatTrack("Forearm_R", t, [elbowFlexQ(-1, 0.14), elbowFlexQ(-1, 0.17), elbowFlexQ(-1, 0.14), elbowFlexQ(-1, 0.17), elbowFlexQ(-1, 0.14)]),
    ]);
  }

  // 2. WALKING & 3. RUNNING
  function buildGaitClip(name: string, duration: number, stride: number, kneeLift: number, armSwing: number, armBend: number, spineLean: number, bobAmp: number) {
    const steps = 16;
    const times = [];
    const hipsP = [], hipsQ = [], spineQ = [], chestQ = [];
    const thL = [], shL = [], ftL = [], toL = [];
    const thR = [], shR = [], ftR = [], toR = [];
    const uaL = [], faL = [], uaR = [], faR = [];

    const isRun = name === "running";
    const armAdduct = isRun ? 0.56 : 0.44;
    const shoulderYaw = isRun ? 0.18 : 0.08;

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const ph = u * Math.PI * 2;
      times.push(u * duration);

      const bob = Math.abs(Math.sin(ph)) * bobAmp - bobAmp * 0.35;
      hipsP.push([Math.sin(ph) * 0.020, bob, 0]);
      hipsQ.push(eulerQ(spineLean * 0.35, Math.sin(ph) * 0.12, Math.cos(ph) * 0.045));
      spineQ.push(eulerQ(spineLean * 0.45, -Math.sin(ph) * 0.08, 0));
      chestQ.push(eulerQ(spineLean * 0.35, -Math.sin(ph) * 0.12, 0));

      const lHip = -Math.sin(ph) * stride;
      const rHip = Math.sin(ph) * stride;
      const lKnee = Math.max(0, Math.cos(ph - 0.5)) * kneeLift + 0.08;
      const rKnee = Math.max(0, Math.cos(ph + Math.PI - 0.5)) * kneeLift + 0.08;
      const lToe = Math.max(0, Math.sin(ph - 0.8)) * (isRun ? 0.45 : 0.32);
      const rToe = Math.max(0, Math.sin(ph + Math.PI - 0.8)) * (isRun ? 0.45 : 0.32);

      thL.push(eulerQ(lHip, 0, 0));
      shL.push(eulerQ(lKnee, 0, 0));
      ftL.push(eulerQ(-lHip * 0.35 - lKnee * 0.35, 0, 0));
      toL.push(eulerQ(-lToe, 0, 0));

      thR.push(eulerQ(rHip, 0, 0));
      shR.push(eulerQ(rKnee, 0, 0));
      ftR.push(eulerQ(-rHip * 0.35 - rKnee * 0.35, 0, 0));
      toR.push(eulerQ(-rToe, 0, 0));

      uaL.push(eulerQ(Math.sin(ph) * armSwing, -shoulderYaw, -armAdduct));
      uaR.push(eulerQ(-Math.sin(ph) * armSwing, shoulderYaw, armAdduct));
      faL.push(elbowFlexQ(1, armBend + Math.max(0, -Math.sin(ph)) * 0.22));
      faR.push(elbowFlexQ(-1, armBend + Math.max(0, Math.sin(ph)) * 0.22));
    }

    return new THREE.AnimationClip(name, duration, [
      makePosTrack("Hips", times, hipsP, true),
      makeQuatTrack("Hips", times, hipsQ),
      makeQuatTrack("Spine", times, spineQ),
      makeQuatTrack("Chest", times, chestQ),
      makeQuatTrack("Thigh_L", times, thL),
      makeQuatTrack("Shin_L", times, shL),
      makeQuatTrack("Foot_L", times, ftL),
      makeQuatTrack("Toe_L", times, toL),
      makeQuatTrack("Thigh_R", times, thR),
      makeQuatTrack("Shin_R", times, shR),
      makeQuatTrack("Foot_R", times, ftR),
      makeQuatTrack("Toe_R", times, toR),
      makeQuatTrack("UpperArm_L", times, uaL),
      makeQuatTrack("Forearm_L", times, faL),
      makeQuatTrack("UpperArm_R", times, uaR),
      makeQuatTrack("Forearm_R", times, faR),
    ]);
  }

  clips.walking = buildGaitClip("walking", 1.05, 0.50, 0.85, 0.44, 0.30, 0.06, 0.032);
  clips.running = buildGaitClip("running", 0.64, 0.86, 1.45, 0.82, 1.48, 0.20, 0.082);

  // 4. JUMPING
  {
    const t = [0, 0.25, 0.62, 1.0, 1.3];
    clips.jumping = new THREE.AnimationClip("jumping", 1.3, [
      makePosTrack("Hips", t, [[0, 0, 0], [0, -0.22, -0.02], [0, 0.34, 0], [0, -0.18, 0], [0, 0, 0]], true),
      makeQuatTrack("Spine", t, [eulerQ(0, 0, 0), eulerQ(0.28, 0, 0), eulerQ(-0.10, 0, 0), eulerQ(0.24, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Thigh_L", t, [eulerQ(0, 0, 0), eulerQ(-0.92, 0, 0), eulerQ(-0.62, 0, 0), eulerQ(-0.80, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Thigh_R", t, [eulerQ(0, 0, 0), eulerQ(-0.92, 0, 0), eulerQ(-0.55, 0, 0), eulerQ(-0.80, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Shin_L", t, [eulerQ(0, 0, 0), eulerQ(1.45, 0, 0), eulerQ(1.15, 0, 0), eulerQ(1.28, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Shin_R", t, [eulerQ(0, 0, 0), eulerQ(1.45, 0, 0), eulerQ(1.05, 0, 0), eulerQ(1.28, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Foot_L", t, [eulerQ(0, 0, 0), eulerQ(-0.52, 0, 0), eulerQ(0.35, 0, 0), eulerQ(-0.46, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("Foot_R", t, [eulerQ(0, 0, 0), eulerQ(-0.52, 0, 0), eulerQ(0.35, 0, 0), eulerQ(-0.46, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("UpperArm_L", t, [eulerQ(0, 0, -0.42), eulerQ(0.55, 0, -0.35), eulerQ(-1.35, 0, -0.20), eulerQ(0.42, 0, -0.35), eulerQ(0, 0, -0.42)]),
      makeQuatTrack("UpperArm_R", t, [eulerQ(0, 0, 0.42), eulerQ(0.55, 0, 0.35), eulerQ(-1.35, 0, 0.20), eulerQ(0.42, 0, 0.35), eulerQ(0, 0, 0.42)]),
      makeQuatTrack("Forearm_L", t, [elbowFlexQ(1, 0.16), elbowFlexQ(1, 0.72), elbowFlexQ(1, 0.42), elbowFlexQ(1, 0.65), elbowFlexQ(1, 0.16)]),
      makeQuatTrack("Forearm_R", t, [elbowFlexQ(-1, 0.16), elbowFlexQ(-1, 0.72), elbowFlexQ(-1, 0.42), elbowFlexQ(-1, 0.65), elbowFlexQ(-1, 0.16)]),
    ]);
  }

  // 5. CROUCHING
  {
    const t = [0, 1.0, 2.0];
    clips.crouching = new THREE.AnimationClip("crouching", 2.0, [
      makePosTrack("Hips", t, [[0, -0.35, -0.05], [0, -0.365, -0.05], [0, -0.35, -0.05]], true),
      makeQuatTrack("Spine", t, [eulerQ(0.28, 0, 0), eulerQ(0.31, 0, 0), eulerQ(0.28, 0, 0)]),
      makeQuatTrack("Chest", t, [eulerQ(0.14, 0, 0), eulerQ(0.16, 0, 0), eulerQ(0.14, 0, 0)]),
      makeQuatTrack("Head", t, [eulerQ(-0.32, 0, 0), eulerQ(-0.34, 0, 0), eulerQ(-0.32, 0, 0)]),
      makeQuatTrack("Thigh_L", t, [eulerQ(-1.26, 0, 0.08), eulerQ(-1.28, 0, 0.08), eulerQ(-1.26, 0, 0.08)]),
      makeQuatTrack("Thigh_R", t, [eulerQ(-1.26, 0, -0.08), eulerQ(-1.28, 0, -0.08), eulerQ(-1.26, 0, -0.08)]),
      makeQuatTrack("Shin_L", t, [eulerQ(1.96, 0, 0), eulerQ(1.99, 0, 0), eulerQ(1.96, 0, 0)]),
      makeQuatTrack("Shin_R", t, [eulerQ(1.96, 0, 0), eulerQ(1.99, 0, 0), eulerQ(1.96, 0, 0)]),
      makeQuatTrack("Foot_L", t, [eulerQ(-0.68, 0, 0), eulerQ(-0.69, 0, 0), eulerQ(-0.68, 0, 0)]),
      makeQuatTrack("Foot_R", t, [eulerQ(-0.68, 0, 0), eulerQ(-0.69, 0, 0), eulerQ(-0.68, 0, 0)]),
      makeQuatTrack("UpperArm_L", t, [eulerQ(-0.28, 0, -0.45), eulerQ(-0.26, 0, -0.45), eulerQ(-0.28, 0, -0.45)]),
      makeQuatTrack("UpperArm_R", t, [eulerQ(-0.28, 0, 0.45), eulerQ(-0.26, 0, 0.45), eulerQ(-0.28, 0, 0.45)]),
      makeQuatTrack("Forearm_L", t, [elbowFlexQ(1, 0.85), elbowFlexQ(1, 0.88), elbowFlexQ(1, 0.85)]),
      makeQuatTrack("Forearm_R", t, [elbowFlexQ(-1, 0.85), elbowFlexQ(-1, 0.88), elbowFlexQ(-1, 0.85)]),
    ]);
  }

  // 6. SITTING
  {
    const t = [0, 1.5, 3.0];
    clips.sitting = new THREE.AnimationClip("sitting", 3.0, [
      makePosTrack("Hips", t, [[0, -0.42, -0.04], [0, -0.425, -0.04], [0, -0.42, -0.04]], true),
      makeQuatTrack("Spine", t, [eulerQ(-0.05, 0, 0), eulerQ(-0.03, 0, 0), eulerQ(-0.05, 0, 0)]),
      makeQuatTrack("Thigh_L", t, [eulerQ(-1.48, 0.06, 0), eulerQ(-1.48, 0.06, 0), eulerQ(-1.48, 0.06, 0)]),
      makeQuatTrack("Thigh_R", t, [eulerQ(-1.48, -0.06, 0), eulerQ(-1.48, -0.06, 0), eulerQ(-1.48, -0.06, 0)]),
      makeQuatTrack("Shin_L", t, [eulerQ(1.48, 0, 0), eulerQ(1.48, 0, 0), eulerQ(1.48, 0, 0)]),
      makeQuatTrack("Shin_R", t, [eulerQ(1.48, 0, 0), eulerQ(1.48, 0, 0), eulerQ(1.48, 0, 0)]),
      makeQuatTrack("Foot_L", t, [eulerQ(0.02, 0, 0), eulerQ(0.02, 0, 0), eulerQ(0.02, 0, 0)]),
      makeQuatTrack("Foot_R", t, [eulerQ(0.02, 0, 0), eulerQ(0.02, 0, 0), eulerQ(0.02, 0, 0)]),
      makeQuatTrack("UpperArm_L", t, [eulerQ(-0.22, 0, -0.46), eulerQ(-0.20, 0, -0.46), eulerQ(-0.22, 0, -0.46)]),
      makeQuatTrack("UpperArm_R", t, [eulerQ(-0.22, 0, 0.46), eulerQ(-0.20, 0, 0.46), eulerQ(-0.22, 0, 0.46)]),
      makeQuatTrack("Forearm_L", t, [elbowFlexQ(1, 0.92), elbowFlexQ(1, 0.94), elbowFlexQ(1, 0.92)]),
      makeQuatTrack("Forearm_R", t, [elbowFlexQ(-1, 0.92), elbowFlexQ(-1, 0.94), elbowFlexQ(-1, 0.92)]),
    ]);
  }

  // 7. WAVING
  {
    const t = [0, 0.25, 0.5, 0.75, 1.0];
    const clavicle = [-0.18, -0.20, -0.18, -0.16, -0.18].map((a) => eulerQ(0, 0, a));
    const upper = [-1.65, -1.60, -1.65, -1.70, -1.65].map((a) => eulerQ(-0.35, 0, a));
    const forearm = [-1.25, -0.85, -1.25, -1.55, -1.25].map((a) => eulerQ(0, 0, a));
    const wrist = [-0.15, 0.22, -0.15, -0.35, -0.15].map((a) => eulerQ(0, 0, a));
    const palmDir = handLayout(-1).palmDir;
    const palmNormal = new THREE.Vector3(0, 0, 1).cross(palmDir).normalize();
    const forward = new THREE.Vector3(0, 0, 1);
    // Hand_R carries the pronation that turns the palm to face +Z (the character's forward);
    // the ForearmTwist helper spreads it along the forearm so the elbow and wrist don't candy-wrap.
    const hand = t.map((_, i) => {
      const parent = clavicle[i].clone().multiply(upper[i]).multiply(forearm[i]);
      const fingers = palmDir.clone().applyQuaternion(parent.clone().multiply(wrist[i]));
      fingers.addScaledVector(forward, -fingers.dot(forward)).normalize();
      return parent.invert().multiply(makeOrthonormalBasisQuat(palmDir, palmNormal, fingers, forward));
    });
    clips.waving = new THREE.AnimationClip("waving", 1.0, [
      makeQuatTrack("Clavicle_R", t, clavicle),
      makeQuatTrack("UpperArm_R", t, upper),
      makeQuatTrack("Forearm_R", t, forearm),
      makeQuatTrack("Hand_R", t, hand),
      ...fingerCurlTracks("R", t, [0.06, 0.10, 0.05], [0.04, 0.06, 0.04]),
    ]);
  }

  // 8. HOLDING
  {
    const t = [0, 1.0];
    clips.holding = new THREE.AnimationClip("holding", 1.0, [
      makeQuatTrack("Clavicle_R", t, [eulerQ(0, 0, 0.04), eulerQ(0, 0, 0.04)]),
      makeQuatTrack("UpperArm_R", t, [eulerQ(-0.48, 0.16, 0.44), eulerQ(-0.48, 0.16, 0.44)]),
      makeQuatTrack("Forearm_R", t, [elbowFlexQ(-1, 1.25), elbowFlexQ(-1, 1.25)]),
      makeQuatTrack("Hand_R", t, [eulerQ(0.05, 0.25, 0.12), eulerQ(0.05, 0.25, 0.12)]),
      // Cylindrical power grip around the 23 mm cup: fingers wrap it, thumb closes over the index.
      ...fingerCurlTracks("R", t, [[0.90, 1.57, 0.70], [0.95, 1.57, 0.70],
        [1.01, 1.57, 0.70], [1.06, 1.57, 0.70]], [0.01, 0.29, 0.22], { opposition: 0.92, abduction: 0.15 }),
      
    ]);
  }

  // 9-14. Facial expression clips
  {
    const tHold = [0, 0.35, 1.4, 2.4];
    clips.smiling = new THREE.AnimationClip("smiling", 2.4, [
      makeMorphTrack("mouthSmile_L", tHold, [0.82, 0.92, 0.88, 0.82]),
      makeMorphTrack("mouthSmile_R", tHold, [0.76, 0.86, 0.84, 0.76]),
      makeMorphTrack("cheekSquint_L", tHold, [0.68, 0.78, 0.74, 0.68]),
      makeMorphTrack("cheekSquint_R", tHold, [0.64, 0.74, 0.70, 0.64]),
      makeMorphTrack("browInnerUp", tHold, [0.15, 0.22, 0.18, 0.15]),
      makeQuatTrack("Jaw", tHold, [eulerQ(0.06, 0, 0), eulerQ(0.08, 0, 0), eulerQ(0.07, 0, 0), eulerQ(0.06, 0, 0)]),
      makeQuatTrack("EyelidBot_L", tHold, [eulerQ(-0.18, 0, 0), eulerQ(-0.22, 0, 0), eulerQ(-0.20, 0, 0), eulerQ(-0.18, 0, 0)]),
      makeQuatTrack("EyelidBot_R", tHold, [eulerQ(-0.18, 0, 0), eulerQ(-0.22, 0, 0), eulerQ(-0.20, 0, 0), eulerQ(-0.18, 0, 0)]),
    ]);

    clips.frowning = new THREE.AnimationClip("frowning", 2.4, [
      makeMorphTrack("mouthFrown_L", tHold, [0.85, 0.92, 0.88, 0.85]),
      makeMorphTrack("mouthFrown_R", tHold, [0.82, 0.88, 0.85, 0.82]),
      makeMorphTrack("browDown_L", tHold, [0.88, 0.95, 0.90, 0.88]),
      makeMorphTrack("browDown_R", tHold, [0.88, 0.95, 0.90, 0.88]),
      makeMorphTrack("noseSneer_L", tHold, [0.35, 0.42, 0.38, 0.35]),
      makeMorphTrack("noseSneer_R", tHold, [0.35, 0.42, 0.38, 0.35]),
      makePosTrack("LowerLip_C", tHold, [[0, 0.002, 0.003], [0, 0.0025, 0.0035], [0, 0.002, 0.003], [0, 0.002, 0.003]], true),
      makeQuatTrack("Brow_L", tHold, [eulerQ(0, 0, -0.18), eulerQ(0, 0, -0.20), eulerQ(0, 0, -0.18), eulerQ(0, 0, -0.18)]),
      makeQuatTrack("Brow_R", tHold, [eulerQ(0, 0, 0.18), eulerQ(0, 0, 0.20), eulerQ(0, 0, 0.18), eulerQ(0, 0, 0.18)]),
    ]);

    clips.shocked = new THREE.AnimationClip("shocked", 2.4, [
      makeQuatTrack("Jaw", tHold, [eulerQ(0.34, 0, 0), eulerQ(0.38, 0, 0), eulerQ(0.35, 0, 0), eulerQ(0.34, 0, 0)]),
      makeMorphTrack("mouthFunnel", tHold, [0.75, 0.85, 0.78, 0.75]),
      makeMorphTrack("browInnerUp", tHold, [0.90, 0.98, 0.92, 0.90]),
      makeMorphTrack("browOuterUp_L", tHold, [0.85, 0.92, 0.88, 0.85]),
      makeMorphTrack("browOuterUp_R", tHold, [0.85, 0.92, 0.88, 0.85]),
      makeQuatTrack("EyelidTop_L", tHold, [eulerQ(-0.24, 0, 0), eulerQ(-0.26, 0, 0), eulerQ(-0.24, 0, 0), eulerQ(-0.24, 0, 0)]),
      makeQuatTrack("EyelidTop_R", tHold, [eulerQ(-0.24, 0, 0), eulerQ(-0.26, 0, 0), eulerQ(-0.24, 0, 0), eulerQ(-0.24, 0, 0)]),
      makeQuatTrack("EyelidBot_L", tHold, [eulerQ(0.10, 0, 0), eulerQ(0.11, 0, 0), eulerQ(0.10, 0, 0), eulerQ(0.10, 0, 0)]),
      makeQuatTrack("EyelidBot_R", tHold, [eulerQ(0.10, 0, 0), eulerQ(0.11, 0, 0), eulerQ(0.10, 0, 0), eulerQ(0.10, 0, 0)]),
      makePosTrack("Nostril_L", tHold, [[0.0025, 0.0015, 0.001], [0.003, 0.002, 0.001], [0.0025, 0.0015, 0.001], [0.0025, 0.0015, 0.001]], true),
      makePosTrack("Nostril_R", tHold, [[-0.0025, 0.0015, 0.001], [-0.003, 0.002, 0.001], [-0.0025, 0.0015, 0.001], [-0.0025, 0.0015, 0.001]], true),
    ]);

    clips.skeptical = new THREE.AnimationClip("skeptical", 2.4, [
      makeMorphTrack("browOuterUp_L", tHold, [0.92, 0.98, 0.94, 0.92]),
      makeMorphTrack("browInnerUp", tHold, [0.35, 0.40, 0.36, 0.35]),
      makeMorphTrack("browDown_R", tHold, [0.78, 0.85, 0.80, 0.78]),
      makeMorphTrack("cheekSquint_R", tHold, [0.45, 0.52, 0.48, 0.45]),
      makeMorphTrack("mouthSmile_L", tHold, [0.52, 0.58, 0.54, 0.52]),
      makeMorphTrack("mouthPucker", tHold, [0.28, 0.34, 0.30, 0.28]),
      makeQuatTrack("EyelidTop_R", tHold, [eulerQ(0.16, 0, 0), eulerQ(0.18, 0, 0), eulerQ(0.16, 0, 0), eulerQ(0.16, 0, 0)]),
      makeQuatTrack("EyelidBot_R", tHold, [eulerQ(-0.18, 0, 0), eulerQ(-0.20, 0, 0), eulerQ(-0.18, 0, 0), eulerQ(-0.18, 0, 0)]),
    ]);

    const ts = [0.0, 0.22, 0.44, 0.68, 0.92, 1.18, 1.44, 1.72, 2.00];
    clips.speaking = new THREE.AnimationClip("speaking", 2.0, [
      makeQuatTrack("Jaw", ts, [
        eulerQ(0.04, 0, 0), eulerQ(0.24, 0, 0), eulerQ(0.09, 0, 0),
        eulerQ(0.28, 0, 0), eulerQ(0.05, 0, 0), eulerQ(0.20, 0, 0),
        eulerQ(0.12, 0, 0), eulerQ(0.25, 0, 0), eulerQ(0.04, 0, 0),
      ]),
      makeMorphTrack("mouthFunnel", ts, [0.10, 0.15, 0.65, 0.10, 0.20, 0.55, 0.15, 0.25, 0.10]),
      makeMorphTrack("mouthPucker", ts, [0.05, 0.00, 0.50, 0.00, 0.42, 0.10, 0.35, 0.05, 0.05]),
      makeMorphTrack("mouthStretch", ts, [0.15, 0.52, 0.05, 0.60, 0.10, 0.22, 0.48, 0.35, 0.15]),
      makeMorphTrack("mouthSmile_L", ts, [0.22, 0.30, 0.15, 0.34, 0.18, 0.25, 0.32, 0.28, 0.22]),
      makeMorphTrack("mouthSmile_R", ts, [0.22, 0.30, 0.15, 0.34, 0.18, 0.25, 0.32, 0.28, 0.22]),
      makeMorphTrack("browInnerUp", ts, [0.15, 0.42, 0.25, 0.55, 0.20, 0.35, 0.48, 0.22, 0.15]),
    ]);

    const bt = [0, 0.055, 0.08, 0.17];
    clips.blinking = new THREE.AnimationClip("blinking", 0.17, [
      makeQuatTrack("EyelidTop_L", bt, [eulerQ(0, 0, 0), eulerQ(0.68, 0, 0), eulerQ(0.68, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("EyelidTop_R", bt, [eulerQ(0, 0, 0), eulerQ(0.68, 0, 0), eulerQ(0.68, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("EyelidBot_L", bt, [eulerQ(0, 0, 0), eulerQ(-0.14, 0, 0), eulerQ(-0.14, 0, 0), eulerQ(0, 0, 0)]),
      makeQuatTrack("EyelidBot_R", bt, [eulerQ(0, 0, 0), eulerQ(-0.14, 0, 0), eulerQ(-0.14, 0, 0), eulerQ(0, 0, 0)]),
    ]);
  }

  return clips;
}
