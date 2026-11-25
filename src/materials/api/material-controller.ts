import type * as THREE from "three";
import type { CanvasFactory } from "../../textures/api/canvas.js";
import { resolveTextureSettings } from "../../textures/api/settings.js";
import { DEFAULT_PALETTE_COLORS, disposeMaterials, readMaterialSurfaces, type Palette } from "./palette.js";
import { createProceduralMaterials } from "./procedural-materials.js";

/** Owns a mesh's procedural material set: rebuilds it from palettes and reports the live palette. */
export function createMaterialController(
  skinnedMesh: THREE.SkinnedMesh,
  initial: Palette,
  createCanvas: CanvasFactory | undefined,
  /** Called after the material array is replaced (e.g. to re-point clothing). */
  onReplaced: () => void,
) {
  let palette: Palette = initial;

  /**
   * Rebuilds the materials from a palette. With `{ rebuild: false }` it only records the palette:
   * use that after applying cheap live edits (surface values, tiling) directly to the materials.
   */
  function setPalette(next: Palette, { rebuild = true }: { rebuild?: boolean } = {}) {
    if (!rebuild) {
      palette = structuredClone(next);
      return;
    }
    const nextMaterials = createProceduralMaterials(next, { createCanvas });
    const previousMaterials = skinnedMesh.material as THREE.Material[];
    skinnedMesh.material = nextMaterials;
    onReplaced();
    disposeMaterials(previousMaterials);
    palette = structuredClone(next);
  }

  /** Full current palette: colors, resolved texture settings and the live surface values of every slot. */
  function current(): Required<Palette> {
    return {
      skin: palette.skin ?? DEFAULT_PALETTE_COLORS.skin,
      shirt: palette.shirt ?? DEFAULT_PALETTE_COLORS.shirt,
      shorts: palette.shorts ?? DEFAULT_PALETTE_COLORS.shorts,
      hair: palette.hair ?? DEFAULT_PALETTE_COLORS.hair,
      textures: resolveTextureSettings(palette.textures),
      materials: readMaterialSurfaces(skinnedMesh.material as THREE.Material[]),
    };
  }

  return {
    setPalette,
    get palette() { return current(); },
    /** Frees the current materials and their textures. */
    dispose: () => disposeMaterials(skinnedMesh.material as THREE.Material[]),
  };
}
