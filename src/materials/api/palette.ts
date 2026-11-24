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

/** Default base colors of the textured slots. */
export const DEFAULT_PALETTE_COLORS = Object.freeze({
  skin: "#c68b59", shirt: "#2e5a88", shorts: "#4a4e4d", hair: "#241c18",
});

/** Which palette color drives each slot's texture (null: the slot's own `color` is used). */
export const MATERIAL_SLOT_TEXTURE_KEYS = [
  "skin", "shirt", "shorts", "hair", null, "skin", null, null, null, null, null, null,
] as const;

/** Surface properties captured and restored per slot. */
export const MATERIAL_SURFACE_KEYS = [
  "roughness", "metalness", "bumpScale", "sheen", "sheenRoughness", "clearcoat", "clearcoatRoughness", "ior",
] as const;

/** Reads the current per-slot surface values from live materials, in the shape Palette.materials expects. */
export function readMaterialSurfaces(materials: readonly any[]): MaterialSurface[] {
  return materials.map((material, index) => {
    const values: MaterialSurface = {};
    if (!MATERIAL_SLOT_TEXTURE_KEYS[index]) values.color = `#${material.color.getHexString()}`;
    for (const key of MATERIAL_SURFACE_KEYS) {
      if (typeof material[key] === "number" && (key !== "bumpScale" || material.bumpMap)) values[key] = material[key];
    }
    return values;
  });
}

/** Disposes materials and the textures they own (maps and bump maps). */
export function disposeMaterials(materials: readonly any[]): void {
  const textures = new Set<any>();
  for (const material of materials) {
    if (material.map) textures.add(material.map);
    if (material.bumpMap) textures.add(material.bumpMap);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}
