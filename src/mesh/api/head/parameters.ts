import type { NumericParameter } from "../../../shared/parameters.js";
import type { HeadBrushMode, HeadFeature, HeadTarget, HeadTransform } from "./types.js";

/** Head parts in editor order, with display labels. */
export const HEAD_TARGET_LABELS: Record<HeadTarget, string> = {
  skin: "Face / skull skin",
  all: "Entire head",
  eyes: "Eyes + eyelids",
  lidTop: "Upper eyelids",
  lidBot: "Lower eyelids",
  brows: "Eyebrows",
  ears: "Ears",
  hair: "Hair cap",
  teeth: "Teeth",
  cavity: "Mouth interior / tongue",
};

export const HEAD_BRUSH_LABELS: Record<HeadBrushMode, string> = {
  raise: "Raise", lower: "Lower", move: "Grab / move", smooth: "Smooth",
};

/** Per-part transform sliders. Offsets are stored in millimeters. */
export const HEAD_TRANSFORM_PARAMETERS: readonly (NumericParameter<keyof HeadTransform> & { default: number })[] = [
  { key: "sx", label: "Width / spacing", min: 0.7, max: 1.3, step: 0.01, default: 1 },
  { key: "sy", label: "Height", min: 0.7, max: 1.3, step: 0.01, default: 1 },
  { key: "sz", label: "Depth", min: 0.7, max: 1.3, step: 0.01, default: 1 },
  { key: "x", label: "Horizontal offset (mm)", min: -30, max: 30, step: 0.5, decimals: 1, default: 0 },
  { key: "y", label: "Vertical offset (mm)", min: -30, max: 30, step: 0.5, decimals: 1, default: 0 },
  { key: "z", label: "Forward offset (mm)", min: -30, max: 30, step: 0.5, decimals: 1, default: 0 },
];

/** Signed millimeter contour offsets of the neutral face. */
export const HEAD_FEATURE_PARAMETERS: readonly NumericParameter<HeadFeature>[] = [
  ["forehead", "Forehead fullness"], ["noseWidth", "Nose wing width"], ["noseTip", "Nose projection"],
  ["cheeks", "Cheek fullness"], ["jawWidth", "Jaw width"], ["chin", "Chin projection"], ["lips", "Lip fullness"],
].map(([key, label]) => ({ key: key as HeadFeature, label: `${label} (mm)`, min: -10, max: 10, step: 0.25 }));
