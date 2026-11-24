import type { TextureSettings } from "../../textures/api/settings.js";

/** Material slot order of the character's SkinnedMesh (index = slot). */
export const MATERIAL_SLOT_NAMES = [
  "Body Skin", "Tops / Sleeves", "Shorts / Trousers", "Hair / Brows", "Eyeballs", "Head Skin",
  "Teeth", "Foot Wraps", "Clothing Trim (reserved)", "Mouth / Gums", "Tongue", "Nails",
] as const;

/** Per-slot surface overrides applied with material.setValues(). */
export interface MaterialSurface {
  color?: string;
  roughness?: number;
  metalness?: number;
  bumpScale?: number;
  sheen?: number;
  sheenRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
}

/** Colors, texture tunables and per-slot surface overrides for createProceduralMaterials(). */
export interface Palette {
  skin?: string;
  shirt?: string;
  shorts?: string;
  hair?: string;
  textures?: Partial<TextureSettings>;
  /** Indexed by material slot (see MATERIAL_SLOT_NAMES). */
  materials?: (MaterialSurface | null | undefined)[];
}
