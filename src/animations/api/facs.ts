export const FACS_MORPH_NAMES = [
  "browInnerUp", "browOuterUp_L", "browOuterUp_R", "browDown_L", "browDown_R",
  "cheekSquint_L", "cheekSquint_R", "mouthSmile_L", "mouthSmile_R",
  "mouthFrown_L", "mouthFrown_R", "mouthPucker", "mouthFunnel", "mouthStretch",
  "noseSneer_L", "noseSneer_R",
] as const;
export type FacsMorphName = (typeof FACS_MORPH_NAMES)[number];
