import type { NumericParameter } from "../../shared/parameters.js";
import type { TextureSettings } from "../../textures/api/settings.js";
import { MATERIAL_SLOT_TEXTURE_KEYS, type MaterialSurface } from "./palette.js";

type SurfaceKey = Exclude<keyof MaterialSurface, "color">;

/** Editable surface properties of a material slot. */
export const MATERIAL_SURFACE_PARAMETERS: readonly NumericParameter<SurfaceKey>[] = [
  { key: "roughness", label: "Roughness", min: 0, max: 1 },
  { key: "metalness", label: "Metalness", min: 0, max: 1 },
  { key: "bumpScale", label: "Bump strength", min: 0, max: 3 },
  { key: "sheen", label: "Sheen", min: 0, max: 1 },
  { key: "sheenRoughness", label: "Sheen roughness", min: 0, max: 1 },
  { key: "clearcoat", label: "Clearcoat", min: 0, max: 1 },
  { key: "clearcoatRoughness", label: "Clearcoat roughness", min: 0, max: 1 },
  { key: "ior", label: "Index of refraction", min: 1, max: 2.33 },
];

/** Skin bump height is authored in meters but edited in millimeters. */
export const SKIN_BUMP_PARAMETER: NumericParameter<"bumpScale"> = { key: "bumpScale", label: "Bump height (mm)", min: 0, max: 1, scale: 1000 };

export interface MaterialSlotParameters {
  /** Palette color key driving this slot's texture, or null when the slot uses its own color. */
  textureKey: "skin" | "shirt" | "shorts" | "hair" | null;
  colorLabel: string;
  /** Texture settings that require rebuilding the textures. */
  rebuild: NumericParameter<keyof TextureSettings>[];
  /** Texture tiling, applied live to the texture repeat. */
  tiling: NumericParameter<keyof TextureSettings>[];
}

/** Which texture parameters apply to a material slot. */
export function materialSlotParameters(slot: number): MaterialSlotParameters {
  const textureKey = MATERIAL_SLOT_TEXTURE_KEYS[slot] ?? null;
  const colorLabel = textureKey ? "Texture color" : slot === 4 ? "Eye tint" : "Base color";
  if (!textureKey) return { textureKey, colorLabel, rebuild: [], tiling: [] };
  const rebuild: NumericParameter<keyof TextureSettings>[] = [textureKey === "skin"
    ? { key: "skinDetail", label: "Pores / tone detail", min: 0, max: 2 }
    : { key: `${textureKey}Contrast` as keyof TextureSettings, label: "Texture contrast", min: 0, max: textureKey === "hair" ? 2 : 1 }];
  if (textureKey === "skin") {
    rebuild.push(
      { key: "skinPoreDepth", label: "Pore depth", min: 0, max: 2 },
      { key: "skinColorVariation", label: "Anatomical color variation", min: 0, max: 2 },
      { key: "skinRoughnessVariation", label: "Regional roughness variation", min: 0, max: 2 },
      { key: "skinScattering", label: "Subsurface scattering (approx.)", min: 0, max: 1 },
      { key: "skinThicknessScale", label: "Scattering thickness multiplier", min: 0.25, max: 4 },
      { key: "skinTileSize", label: "Skin tile size (mm)", min: 16, max: 256, step: 1, decimals: 0, scale: 1000 },
    );
  }
  const tiling = textureKey === "skin" ? [] : (["X", "Y"] as const).map((axis) =>
    ({ key: `${textureKey}Repeat${axis}` as keyof TextureSettings, label: `Texture tiling ${axis}`, min: 1, max: 30, step: 0.1 }));
  return { textureKey, colorLabel, rebuild, tiling };
}
