import { DEFAULT_FACE_SLIDERS, type FaceSliders } from "../animations/api/face-sliders.js";
import { HAND_GESTURES, type HandGesture } from "../animations/api/hand-gestures.js";
import {
  BASE_ANIMATIONS, FACE_EXPRESSIONS, UPPER_ANIMATIONS,
  type BaseAnimation, type FaceExpression, type UpperAnimation,
} from "../animations/api/names.js";
import { DEFAULT_PALETTE_COLORS, type Palette } from "../materials/api/palette.js";
import { configureTorsoDetails, type TorsoDetailChanges, type TorsoDetails } from "../mesh/api/body/torso.js";
import { CLOTHING_ITEMS, type ClothingSlot, type Outfit } from "../mesh/api/clothing/items.js";
import { validateHeadDesign } from "../mesh/api/head/design.js";
import type { HeadDesign } from "../mesh/api/head/types.js";
import { resolveTextureSettings } from "../textures/api/settings.js";

export const HUMAN_DESIGN_FORMAT = "procedural-human";
export const HUMAN_DESIGN_VERSION = 1;

/** Starting pose and animation state applied after the character is built. */
export interface HumanPose {
  base: BaseAnimation;
  upper: UpperAnimation;
  face: FaceExpression;
  hands: { L: HandGesture; R: HandGesture };
  faceSliders: FaceSliders;
}

/**
 * Every attribute of a procedural human, as plain serializable data.
 * Pass it to createHuman() to build the character in any three.js project.
 */
export interface HumanDesign {
  format: typeof HUMAN_DESIGN_FORMAT;
  version: typeof HUMAN_DESIGN_VERSION;
  name: string;
  head: HeadDesign;
  palette: Required<Palette>;
  torso: TorsoDetails;
  outfit: Outfit;
  pose: HumanPose;
}

/** A design where every field may be omitted; omitted fields take the defaults. */
export interface HumanDesignInput {
  format?: typeof HUMAN_DESIGN_FORMAT;
  version?: number;
  name?: string;
  head?: Partial<HeadDesign>;
  palette?: Palette;
  torso?: TorsoDetailChanges;
  outfit?: Outfit;
  pose?: Partial<Omit<HumanPose, "hands" | "faceSliders">> & {
    hands?: Partial<HumanPose["hands"]>;
    faceSliders?: Partial<FaceSliders>;
  };
}

const UPPER_STATES: readonly string[] = ["none", "reaching", ...UPPER_ANIMATIONS];
const FACE_STATES: readonly string[] = ["neutral", ...FACE_EXPRESSIONS];

function assertOneOf(value: unknown, allowed: readonly string[], label: string) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}. Expected one of ${allowed.join(", ")}.`);
  }
}

/**
 * Validates a design and fills in every default, returning a complete HumanDesign.
 * Throws a descriptive Error on any invalid field.
 */
export function defineHuman(input: HumanDesignInput = {}): HumanDesign {
  if (input.format !== undefined && input.format !== HUMAN_DESIGN_FORMAT) {
    throw new Error(`Not a procedural-human design (format: ${String(input.format)}).`);
  }
  if (input.version !== undefined && input.version !== HUMAN_DESIGN_VERSION) {
    throw new Error(`Unsupported procedural-human design version ${input.version} (supported: ${HUMAN_DESIGN_VERSION}).`);
  }

  const head: HeadDesign = {
    transforms: structuredClone(input.head?.transforms ?? {}),
    features: structuredClone(input.head?.features ?? {}),
    strokes: structuredClone(input.head?.strokes ?? []),
  };
  validateHeadDesign(head);

  const p = input.palette ?? {};
  const palette: Required<Palette> = {
    skin: p.skin ?? DEFAULT_PALETTE_COLORS.skin,
    shirt: p.shirt ?? DEFAULT_PALETTE_COLORS.shirt,
    shorts: p.shorts ?? DEFAULT_PALETTE_COLORS.shorts,
    hair: p.hair ?? DEFAULT_PALETTE_COLORS.hair,
    textures: resolveTextureSettings(p.textures),
    materials: structuredClone(p.materials ?? []),
  };
  for (const key of ["skin", "shirt", "shorts", "hair"] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(palette[key])) throw new Error(`Invalid palette color ${key}: ${palette[key]}.`);
  }

  const torso = configureTorsoDetails(null, input.torso ?? {});

  const outfit: Outfit = {};
  for (const [slot, item] of Object.entries(input.outfit ?? {})) {
    if (!Object.hasOwn(CLOTHING_ITEMS, slot) || !Object.hasOwn(CLOTHING_ITEMS[slot as ClothingSlot], item)) {
      throw new Error(`Unknown clothing item ${slot}: ${String(item)}.`);
    }
    if (item !== "none") (outfit as Record<string, string>)[slot] = item;
  }

  const pose: HumanPose = {
    base: input.pose?.base ?? "idle",
    upper: input.pose?.upper ?? "none",
    face: input.pose?.face ?? "neutral",
    hands: { L: input.pose?.hands?.L ?? "auto", R: input.pose?.hands?.R ?? "auto" },
    faceSliders: { ...DEFAULT_FACE_SLIDERS, ...input.pose?.faceSliders },
  };
  assertOneOf(pose.base, BASE_ANIMATIONS, "pose.base");
  assertOneOf(pose.upper, UPPER_STATES, "pose.upper");
  assertOneOf(pose.face, FACE_STATES, "pose.face");
  for (const side of ["L", "R"] as const) assertOneOf(pose.hands[side], ["auto", ...Object.keys(HAND_GESTURES)], `pose.hands.${side}`);
  for (const [key, value] of Object.entries(pose.faceSliders)) {
    if (!Object.hasOwn(DEFAULT_FACE_SLIDERS, key) || !Number.isFinite(value)) throw new Error(`Invalid pose.faceSliders.${key}.`);
  }

  return {
    format: HUMAN_DESIGN_FORMAT,
    version: HUMAN_DESIGN_VERSION,
    name: input.name ?? "Untitled Human",
    head, palette, torso, outfit, pose,
  };
}
