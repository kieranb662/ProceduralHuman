import * as THREE from "three";
import { handLayout } from "../../rigging/api/hand-layout.js";

export const HAND_GESTURES = {
  relaxed: { curl: [0.16, 0.24, 0.12], thumb: [0.10, 0.14, 0.08], opposition: 0.18, abduction: 0, spread: 0 },
  open: { curl: [0.02, 0.03, 0.02], thumb: [0, 0.04, 0.02], opposition: 0.10, abduction: 0.12, spread: 0.04 },
  // Fist curls give ~240° total flexion per finger with tips seated in the palm.
  grip: { curl: [1.45, 1.62, 0.95], thumb: [0.35, 0.52, 0.84], opposition: 0.65, abduction: 0.27, spread: 0 },
  point: { curl: [1.45, 1.62, 0.95], indexCurl: [0.015, 0.035, 0.02], thumb: [0.45, 0.53, 0.59], opposition: 0.64, abduction: 0.16, spread: 0 },
  thumbsUp: { curl: [1.45, 1.62, 0.95], thumb: [0, 0.05, -0.06], opposition: 0.20, abduction: 0.50, spread: 0 },
  spread: { curl: [0.03, 0.04, 0.02], thumb: [0, 0.02, 0], opposition: 0.15, abduction: 0.60, spread: 1 },
};

export function handPoseQuaternions(side, pose) {
  const s = side === "L" ? 1 : -1, hl = handLayout(s), out = new Map();
  const axisQ = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
  hl.fingers.forEach((f, fi) => {
    const axis = new THREE.Vector3().crossVectors(f.dir, hl.palmNormal).normalize();
    const individual = Array.isArray(pose.curl[0]);
    const curls = fi === 0 && pose.indexCurl ? pose.indexCurl
      : individual ? pose.curl[fi] : pose.curl;
    const fan = [0.20, 0.035, -0.12, -0.29][fi] * pose.spread;
    for (let j = 1; j <= 3; j++) {
      const q = axisQ(axis, curls[j - 1] * (individual ? 1 : 1 + fi * 0.025));
      if (j === 1) q.premultiply(axisQ(hl.palmNormal, s * fan));
      out.set(`${f.name}${j}_${side}`, q);
    }
  });
  const { tStart, tMid, tJ3, tTip } = hl.thumb;
  const axes = [[tStart, tMid], [tMid, tJ3], [tJ3, tTip]]
    .map(([a, b], i) => new THREE.Vector3().crossVectors(b.clone().sub(a).normalize(), hl.thumb.hingeNormals[i]).normalize());
  const thumb = axisQ(hl.palmDir, s * pose.opposition)
    .multiply(axisQ(hl.palmNormal, s * pose.abduction)).multiply(axisQ(axes[0], pose.thumb[0]));
  out.set(`Thumb_${side}`, thumb);
  out.set(`Thumb2_${side}`, axisQ(axes[1], pose.thumb[1]));
  out.set(`Thumb3_${side}`, axisQ(axes[2], pose.thumb[2]));
  return out;
}

export type HandGestureName = keyof typeof HAND_GESTURES;
/** "auto" lets the active clip/IK drive the fingers. */
export type HandGesture = HandGestureName | "auto";
