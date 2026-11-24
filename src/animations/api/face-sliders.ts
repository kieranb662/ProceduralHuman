import type { NumericParameter } from "../../shared/parameters.js";

/** Manual facial controls layered over the expression clips each frame (see ProceduralCharacter.faceSliders). */
export interface FaceSliders {
  jaw: number; smile: number; pucker: number; browUp: number; browDown: number; cheek: number;
  tongueOut: number; tongueCurl: number;
  upperLip: number; lowerLip: number; lidTop: number; lidBot: number;
  eyeX: number; eyeY: number; nose: number; ears: number;
}

/** Neutral face: every slider at 0. */
export const DEFAULT_FACE_SLIDERS: Readonly<FaceSliders> = Object.freeze({
  jaw: 0, smile: 0, pucker: 0, browUp: 0, browDown: 0, cheek: 0,
  tongueOut: 0, tongueCurl: 0,
  upperLip: 0, lowerLip: 0, lidTop: 0, lidBot: 0, eyeX: 0, eyeY: 0, nose: 0, ears: 0,
});

/** Display metadata (label and range) for every face slider, in panel order. */
export const FACE_SLIDER_PARAMETERS: readonly NumericParameter<keyof FaceSliders>[] = [
  { key: "jaw", label: "Mouth (Jaw Open)", min: 0, max: 1 },
  { key: "tongueOut", label: "Tongue Out", min: 0, max: 1 },
  { key: "tongueCurl", label: "Tongue Tip Bend", min: -1, max: 1 },
  { key: "smile", label: "FACS Smile", min: 0, max: 1 },
  { key: "pucker", label: "FACS Pucker", min: 0, max: 1 },
  { key: "browUp", label: "Brow Inner Up", min: 0, max: 1 },
  { key: "browDown", label: "Brow Furrow", min: 0, max: 1 },
  { key: "cheek", label: "Cheek Squint (Duchenne)", min: 0, max: 1 },
  { key: "upperLip", label: "Upper Lip Lift / Press", min: -1, max: 1 },
  { key: "lowerLip", label: "Lower Lip Drop / Pout", min: -1, max: 1 },
  { key: "lidTop", label: "Top Eyelids (Open ↔ Close)", min: -0.5, max: 1 },
  { key: "lidBot", label: "Bottom Eyelids (Drop ↔ Squint)", min: -0.5, max: 1 },
  { key: "eyeX", label: "Eye Gaze X", min: -1, max: 1 },
  { key: "eyeY", label: "Eye Gaze Y", min: -1, max: 1 },
  { key: "nose", label: "Nose Scrunch & Flare", min: 0, max: 1 },
  { key: "ears", label: "Ears Wiggle", min: -1, max: 1 },
];
