import * as THREE from "three";

// --- 4. Root-Relative, Twist-Free 2-Bone Analytical Arm IK Solver ---
export function makeOrthonormalBasisQuat(srcA, srcB, dstA, dstB) {
  const sX = srcA.clone().normalize();
  const sY = srcB.clone().addScaledVector(sX, -srcB.dot(sX)).normalize();
  const sZ = new THREE.Vector3().crossVectors(sX, sY).normalize();

  const dX = dstA.clone().normalize();
  const dY = dstB.clone().addScaledVector(dX, -dstB.dot(dX)).normalize();
  const dZ = new THREE.Vector3().crossVectors(dX, dY).normalize();

  const mSrc = new THREE.Matrix4().makeBasis(sX, sY, sZ);
  const mDst = new THREE.Matrix4().makeBasis(dX, dY, dZ);
  const mRot = mDst.multiply(mSrc.transpose());
  return new THREE.Quaternion().setFromRotationMatrix(mRot);
}

export function solveRightArmReachIK(rig, targetWorldPos, characterRoot) {
  const chest = rig.boneMap.get("Chest");
  const clav = rig.boneMap.get("Clavicle_R");
  const upper = rig.boneMap.get("UpperArm_R");
  const fore = rig.boneMap.get("Forearm_R");
  const hand = rig.boneMap.get("Hand_R");

  const rootWorldQ = new THREE.Quaternion();
  characterRoot.getWorldQuaternion(rootWorldQ);

  chest.updateWorldMatrix(true, true);
  const chestWorldPos = new THREE.Vector3();
  chest.getWorldPosition(chestWorldPos);
  const localTarget = targetWorldPos.clone().sub(chestWorldPos).applyQuaternion(rootWorldQ.clone().invert());
  const leanYaw = THREE.MathUtils.clamp(localTarget.x * 0.22, -0.18, 0.18);
  const leanPitch = THREE.MathUtils.clamp((localTarget.z - 0.25) * 0.16, -0.08, 0.16);
  chest.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(leanPitch, leanYaw, 0, "XYZ")));
  clav.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, leanYaw * 0.6, -0.12, "XYZ")));

  const parent = upper.parent;
  parent.updateWorldMatrix(true, true);

  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  upper.getWorldPosition(pA);
  fore.getWorldPosition(pB);
  hand.getWorldPosition(pC);

  const len1 = pA.distanceTo(pB);
  const len2 = pB.distanceTo(pC);

  const toTarget = new THREE.Vector3().subVectors(targetWorldPos, pA);
  const dist = THREE.MathUtils.clamp(toTarget.length(), Math.abs(len1 - len2) + 0.015, len1 + len2 - 0.015);
  const dirT = toTarget.clone().normalize();

  const cosAngle1 = THREE.MathUtils.clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
  const angle1 = Math.acos(cosAngle1);

  const poleDirLocal = new THREE.Vector3(-0.55, -0.95, -0.55).normalize();
  const poleDirWorld = poleDirLocal.clone().applyQuaternion(rootWorldQ);
  const bendAxisWorld = new THREE.Vector3().crossVectors(dirT, poleDirWorld);
  if (bendAxisWorld.lengthSq() < 1e-4) bendAxisWorld.set(1, 0, 0).applyQuaternion(rootWorldQ);
  bendAxisWorld.normalize();

  const upperDirWorld = dirT.clone().applyAxisAngle(bendAxisWorld, angle1).normalize();
  const desiredElbow = pA.clone().addScaledVector(upperDirWorld, len1);
  const foreDirWorld = new THREE.Vector3().subVectors(targetWorldPos, desiredElbow).normalize();

  const restUpperDir = fore.position.clone().normalize();
  const restForeDir = hand.position.clone().normalize();
  const restHinge = new THREE.Vector3().crossVectors(restUpperDir, poleDirLocal).normalize();

  const parentWorldQ = new THREE.Quaternion();
  parent.getWorldQuaternion(parentWorldQ);
  const invParentQ = parentWorldQ.clone().invert();
  const upperDirLocal = upperDirWorld.clone().applyQuaternion(invParentQ);
  const hingeLocal = bendAxisWorld.clone().applyQuaternion(invParentQ);
  upper.quaternion.copy(makeOrthonormalBasisQuat(restUpperDir, restHinge, upperDirLocal, hingeLocal));
  upper.updateMatrixWorld(true);

  const upperWorldQ = new THREE.Quaternion();
  upper.getWorldQuaternion(upperWorldQ);
  const invUpperQ = upperWorldQ.clone().invert();
  const foreDirLocal = foreDirWorld.clone().applyQuaternion(invUpperQ);
  const hingeInUpper = bendAxisWorld.clone().applyQuaternion(invUpperQ);
  fore.quaternion.copy(makeOrthonormalBasisQuat(restForeDir, restHinge, foreDirLocal, hingeInUpper));
  fore.updateMatrixWorld(true);
}
