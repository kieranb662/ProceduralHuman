/** Full-body locomotion/stance clips (one plays at a time on the base layer). */
export const BASE_ANIMATIONS = ["idle", "walking", "running", "jumping", "crouching", "sitting"] as const;
export type BaseAnimation = (typeof BASE_ANIMATIONS)[number];

/** Layered upper-body clips. "none" and "reaching" (IK) are states without a clip. */
export const UPPER_ANIMATIONS = ["waving", "holding"] as const;
export type UpperAnimationClip = (typeof UPPER_ANIMATIONS)[number];
export type UpperAnimation = UpperAnimationClip | "none" | "reaching";

/** Facial expression clips; "neutral" is the no-clip state. */
export const FACE_EXPRESSIONS = ["smiling", "frowning", "shocked", "skeptical", "speaking", "blinking"] as const;
export type FaceExpressionClip = (typeof FACE_EXPRESSIONS)[number];
export type FaceExpression = FaceExpressionClip | "neutral";

export type ClipName = BaseAnimation | UpperAnimationClip | FaceExpressionClip;
