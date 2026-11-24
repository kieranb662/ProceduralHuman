import * as THREE from "three";

export function handLayout(s) {
  const pHand = new THREE.Vector3(s * 0.560, 1.025, 0.008);
  const palmDir = new THREE.Vector3(s * 0.30, -0.94, 0.08).normalize();
  const across = new THREE.Vector3(0, 0, 1).addScaledVector(palmDir, -palmDir.z).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(across, palmDir).multiplyScalar(-s).normalize();
  const palmBase = pHand.clone().addScaledVector(palmDir, 0.072);
  // Adult male proportions: wrist crease to middle fingertip ~0.188 m (~10.6% of stature),
  // ring finger slightly longer than index, little finger ~0.75 of the middle finger.
  const specs = [
    { name: "Index", spread: 0.030, base: 0.088, L: 0.088, rad: 0.0090 },
    { name: "Middle", spread: 0.010, base: 0.092, L: 0.096, rad: 0.0094 },
    { name: "Ring", spread: -0.010, base: 0.089, L: 0.091, rad: 0.0088 },
    { name: "Pinky", spread: -0.030, base: 0.080, L: 0.072, rad: 0.0076 },
  ];
  const fingers = specs.map((f) => {
    const dir = palmDir.clone().addScaledVector(across, f.spread * 1.2).normalize();
    const P = pHand.clone().addScaledVector(palmDir, f.base).addScaledVector(across, f.spread);
    return {
      ...f, dir, P,
      J1: P.clone().addScaledVector(dir, f.L * 0.46),
      J2: P.clone().addScaledVector(dir, f.L * 0.76),
    };
  });
  // Thumb: CMC near the radial wrist; metacarpal ~51 mm, proximal ~34 mm, distal ~29 mm.
  const tStart = pHand.clone().addScaledVector(palmDir, 0.027).addScaledVector(across, 0.026);
  const tMid = tStart.clone().addScaledVector(palmDir, 0.036).addScaledVector(across, 0.036);
  const tJ3 = tMid.clone().addScaledVector(palmDir, 0.029).addScaledVector(across, 0.017);
  const tTip = tJ3.clone().addScaledVector(palmDir, 0.027).addScaledVector(across, 0.010);
  // The thumb is pronated relative to the fingers: its nail faces dorsal-radially and its pad faces
  // the fingers, so MCP/IP flexion curls it toward the palm's ulnar side, not straight palmar.
  // hingeNormals[i] is the pad direction of segment i (metacarpal, proximal, distal phalanx).
  const thumbPronation = 0.9;
  const hingeNormals = [[tStart, tMid], [tMid, tJ3], [tJ3, tTip]].map(([a, b], i) => {
    const dir = b.clone().sub(a).normalize();
    const radial = across.clone().addScaledVector(dir, -across.dot(dir)).normalize();
    const roll = i ? thumbPronation : 0;
    return palmNormal.clone().multiplyScalar(Math.cos(roll)).addScaledVector(radial, -Math.sin(roll)).normalize();
  });
  return { pHand, palmDir, palmNormal, across, palmBase, fingers, thumb: { tStart, tMid, tTip, tJ3, pronation: thumbPronation, hingeNormals } };
}
