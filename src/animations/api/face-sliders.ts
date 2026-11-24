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
