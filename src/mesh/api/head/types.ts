import type { MeshPart } from "../types.js";
import type { Vec3Tuple } from "../../../shared/vector.js";

/** Head part groups that transforms and sculpt strokes can target (see headTargetTags). */
export const HEAD_TARGETS = ["all", "skin", "eyes", "lidTop", "lidBot", "brows", "ears", "hair", "teeth", "cavity"] as const;
export type HeadTarget = (typeof HEAD_TARGETS)[number];

/** Per-part scale (sx/sy/sz, > 0) and offset (x/y/z, meters). */
export interface HeadTransform {
  sx?: number; sy?: number; sz?: number;
  x?: number; y?: number; z?: number;
}

export const HEAD_FEATURES = ["forehead", "noseWidth", "noseTip", "cheeks", "jawWidth", "chin", "lips"] as const;
export type HeadFeature = (typeof HEAD_FEATURES)[number];

export const HEAD_BRUSH_MODES = ["raise", "lower", "move", "smooth"] as const;
export type HeadBrushMode = (typeof HEAD_BRUSH_MODES)[number];


/** One recorded sculpt brush stroke, replayed procedurally on the base head. */
export interface HeadStroke {
  target: HeadTarget;
  mode: HeadBrushMode;
  center: Vec3Tuple;
  delta: Vec3Tuple;
  /** Brush radius in meters. */
  radius: number;
  /** 0..1 */
  strength: number;
  mirror: boolean;
  mirrorX?: number;
}

/** A complete, serializable head design: part transforms, contour features and sculpt strokes. */
export interface HeadDesign {
  transforms: Partial<Record<HeadTarget, HeadTransform>>;
  features: Partial<Record<HeadFeature, number>>;
  strokes: HeadStroke[];
}

/** Head/face parts plus the design that produced them. */
export type HeadParts = MeshPart[] & { design: HeadDesign };

/** One vertex of the traced mouth opening: position plus its packed skin influences. */
export interface MouthLoopVertex {
  pos: import("three").Vector3;
  idx: number[];
  wgt: number[];
}
