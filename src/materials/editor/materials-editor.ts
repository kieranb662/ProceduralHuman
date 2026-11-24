import type * as THREE from "three";
import type { ProceduralCharacter } from "../../humans/types.js";
import type { PhColorInput } from "../../ui/api/color-input.js";
import { defineElement, h } from "../../ui/api/element.js";
import type { PhSelect } from "../../ui/api/select.js";
import type { PhStatus } from "../../ui/api/status.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { PhParameterGroup } from "../../ui/editor/parameter-group.js";
import { MATERIAL_SLOT_NAMES, MATERIAL_SLOT_TEXTURE_KEYS, type Palette } from "../api/palette.js";
import { MATERIAL_SURFACE_PARAMETERS, SKIN_BUMP_PARAMETER, materialSlotParameters } from "../api/parameters.js";

const REBUILD_DELAY_MS = 180;

/**
 * Per-slot material editing: color, procedural texture settings and surface properties.
 * Texture changes rebuild the materials (debounced); surface values and tiling apply live.
 * Set `el.character`. Emits `ph-change` with `{ section: "materials", rebuilt }`.
 */
export class PhMaterialsEditor extends PhEditorElement<ProceduralCharacter> {
  private palette: Required<Palette>;
  private initial: Required<Palette>;
  private slotIndex = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly status = h("ph-status") as PhStatus;

  set character(character: ProceduralCharacter) {
    this.initial = character.palette;
    this.palette = structuredClone(this.initial);
    this.bind(character);
  }
  get character() { return this.target; }

  /** The palette being edited (complete, including live surface values). */
  get value(): Required<Palette> { return structuredClone(this.palette); }

  render() {
    const { textureKey, colorLabel, rebuild, tiling } = materialSlotParameters(this.slotIndex);
    const slotSelect = h("ph-select", { label: "Material slot", stacked: true }) as PhSelect;
    slotSelect.options = MATERIAL_SLOT_NAMES.map((name, i) => ({ value: String(i), label: `${i}: ${name}` }));
    slotSelect.value = String(this.slotIndex);
    slotSelect.addEventListener("change", () => { this.slotIndex = Number(slotSelect.value); this.render(); });

    const color = h("ph-color-input", { label: colorLabel }) as PhColorInput;
    color.value = textureKey ? this.palette[textureKey] : this.palette.materials[this.slotIndex].color;
    color.addEventListener("input", () => this.setColor(color.value));

    const textures = h("ph-parameter-group") as PhParameterGroup;
    textures.parameters = [...rebuild, ...tiling];
    textures.values = this.palette.textures;
    textures.addEventListener("input", (event: CustomEvent) => {
      const { key, value } = event.detail;
      this.palette.textures[key] = value;
      if (tiling.some((p) => p.key === key)) this.setTiling(key, value);
      else this.scheduleRebuild();
    });

    const surfaceValues = this.palette.materials[this.slotIndex];
    const surface = h("ph-parameter-group") as PhParameterGroup;
    surface.parameters = MATERIAL_SURFACE_PARAMETERS.filter((p) => p.key in surfaceValues)
      .map((p) => (textureKey === "skin" && p.key === "bumpScale" ? SKIN_BUMP_PARAMETER : p));
    surface.values = surfaceValues as Record<string, number>;
    surface.addEventListener("input", (event: CustomEvent) => {
      const { key, value } = event.detail;
      surfaceValues[key] = value;
      (this.materials[this.slotIndex] as THREE.Material).setValues({ [key]: value });
      this.recordLiveEdit();
    });

    const reset = h("ph-button", { variant: "ghost", slot: "actions" }, "Reset all");
    reset.addEventListener("click", () => {
      this.palette = structuredClone(this.initial);
      this.rebuildNow();
      this.render();
      this.status.message = "All materials reset.";
    });

    this.clear();
    this.root.append(
      h("ph-panel", { heading: "Textures & Materials" }, slotSelect, color, textures),
      h("ph-panel", { heading: "Surface properties" }, reset, surface),
      this.status,
    );
  }

  private get materials() { return this.target.skinnedMesh.material as THREE.Material[]; }

  private setColor(value: string) {
    const textureKey = MATERIAL_SLOT_TEXTURE_KEYS[this.slotIndex];
    if (textureKey) {
      this.palette[textureKey] = value;
      this.scheduleRebuild();
    } else {
      this.palette.materials[this.slotIndex].color = value;
      (this.materials[this.slotIndex] as THREE.MeshStandardMaterial).color.set(value);
      this.recordLiveEdit();
    }
  }

  private setTiling(key: string, value: number) {
    const textureKey = key.replace(/Repeat[XY]$/, ""), axis = key.endsWith("X") ? "x" : "y";
    this.materials.forEach((material: any, slot) => {
      if (MATERIAL_SLOT_TEXTURE_KEYS[slot] !== textureKey) return;
      for (const texture of [material.map, material.bumpMap]) if (texture) texture.repeat[axis] = value;
    });
    this.recordLiveEdit();
  }

  private recordLiveEdit() {
    this.target.setPalette(this.palette, { rebuild: false });
    this.status.message = "Preview updated.";
    this.changed("materials", { rebuilt: false });
  }

  private scheduleRebuild() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.status.message = "Updating procedural textures...";
    this.timer = setTimeout(() => this.rebuildNow(), REBUILD_DELAY_MS);
  }

  /** Applies any pending texture rebuild immediately. */
  flush() {
    if (this.timer !== null) this.rebuildNow();
  }

  private rebuildNow() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.target.setPalette(this.palette);
    this.status.message = "Preview updated.";
    this.changed("materials", { rebuilt: true });
  }
}

export const registerMaterialsEditor = () => defineElement("ph-materials-editor", PhMaterialsEditor);
