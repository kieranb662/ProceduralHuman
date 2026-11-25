import * as THREE from "three";
import { SIDES } from "../../shared/sides.js";
import type { HumanoidRig } from "./types.js";

/** Arm elevation (from hanging) at which the shoulder girdle starts to follow; the rest A-pose is ~52°. */
const RHYTHM_ONSET = THREE.MathUtils.degToRad(55);
/** Girdle rotation per radian of arm elevation past the onset (about 27° with the arm overhead). */
const RHYTHM_RATIO = 0.25;
/** Width of the quadratic ease-in after the onset. */
const RHYTHM_EASE = THREE.MathUtils.degToRad(20);

const _down = new THREE.Vector3(), _j = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _qu = new THREE.Quaternion(), _qh = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

/**
 * Linear blend skinning collapses when one seam blends a large rotation difference.
 * Helpers split it into half-angle seams: Deltoid takes half of UpperArm's rotation,
 * ForearmTwist takes half of Hand's twist about the forearm axis, and Elbow takes half of
 * Forearm's rotation so the skin over the joint turns rigidly instead of collapsing toward it.
 *
 * Raising an arm also drives the clavicle (scapulohumeral rhythm), as the shoulder girdle does in
 * a real body: the acromion and trapezius lift out of the way instead of the humerus folding the
 * top of the shoulder into the torso. Elevation already authored on the clavicle counts toward the
 * rhythm. The arm keeps its elbow angle and is re-aimed at the posed hand, so the hand keeps its
 * direction and orientation and rises with the girdle, as a real overhead reach does.
 */
export function createTwistHelpers(rig: HumanoidRig) {
  const bm = rig.boneMap;
  const forearmTwistAxes: Record<string, THREE.Vector3> = Object.fromEntries(SIDES.map(([side]) => [side,
    rig.worldRest.get(`Hand_${side}`).clone().sub(rig.worldRest.get(`Forearm_${side}`)).normalize()]));

  function shoulderRhythm(side: string, s: number) {
    const clavicle = bm.get(`Clavicle_${side}`), upper = bm.get(`UpperArm_${side}`);
    const fore = bm.get(`Forearm_${side}`), hand = bm.get(`Hand_${side}`);
    hand.updateWorldMatrix(true, false);
    upper.getWorldPosition(_j); fore.getWorldPosition(_e); hand.getWorldPosition(_h);
    clavicle.parent!.getWorldQuaternion(_q);
    _down.set(0, -1, 0).applyQuaternion(_q);
    const elevation = _down.angleTo(_e.clone().sub(_j));
    const excess = elevation - RHYTHM_ONSET;
    // A C1 ease-in keeps the onset free of a kink in shoulder motion.
    const rhythm = RHYTHM_RATIO * (excess <= 0 ? 0 : excess < RHYTHM_EASE ? excess ** 2 / (2 * RHYTHM_EASE) : excess - RHYTHM_EASE / 2);
    const cq = clavicle.quaternion;
    const authored = s * 2 * Math.atan2(cq.z, cq.w);
    const extra = rhythm - Math.max(0, authored);
    if (extra < 1e-4) return;
    upper.getWorldQuaternion(_qu); hand.getWorldQuaternion(_qh);
    const aim0 = _h.clone().sub(_j).normalize();
    clavicle.quaternion.multiply(_qa.setFromAxisAngle(_z, s * extra));
    clavicle.updateWorldMatrix(false, true);
    upper.getWorldPosition(_j);
    // Re-aim the whole arm at the posed hand without changing the elbow angle: re-solving the
    // elbow would force near-straight arms into a visible bend for a few centimetres of lift.
    _qb.setFromUnitVectors(aim0, _h.clone().sub(_j).normalize());
    const setWorld = (bone: THREE.Bone, world: THREE.Quaternion) => {
      bone.parent!.getWorldQuaternion(_qc);
      bone.quaternion.copy(_qc.invert().multiply(world));
      bone.updateWorldMatrix(false, true);
    };
    setWorld(upper, _qa.copy(_qb).multiply(_qu));
    setWorld(hand, _qh);
  }

  /** Drive the helper bones from the current arm pose. Call after all arm/hand posing. */
  function update() {
    for (const [side, s] of SIDES) {
      shoulderRhythm(side, s);
      bm.get(`Deltoid_${side}`).quaternion.identity().slerp(bm.get(`UpperArm_${side}`).quaternion, 0.5);
      bm.get(`Elbow_${side}`).quaternion.identity().slerp(bm.get(`Forearm_${side}`).quaternion, 0.5);
      const hq = bm.get(`Hand_${side}`).quaternion, axis = forearmTwistAxes[side];
      let twist = 2 * Math.atan2(hq.x * axis.x + hq.y * axis.y + hq.z * axis.z, hq.w);
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      bm.get(`ForearmTwist_${side}`).quaternion.setFromAxisAngle(axis, twist * 0.5);
    }
  }
  return { update };
}
