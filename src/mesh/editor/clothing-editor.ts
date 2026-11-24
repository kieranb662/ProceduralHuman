import { defineElement, h } from "../../ui/api/element.js";
import type { PhSelect } from "../../ui/api/select.js";
import type { PhStatus } from "../../ui/api/status.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { ProceduralCharacter } from "../../humans/types.js";
import { OUTFIT_PRESETS, type ClothingSlot } from "../api/clothing/items.js";

const STYLES = `.presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; } ph-button { display: block; }`;

/**
 * Outfit presets plus one dropdown per clothing slot.
 * Set `el.character`. Emits `ph-change` with `{ section: "clothing", outfit }`.
 */
export class PhClothingEditor extends PhEditorElement<ProceduralCharacter> {
  private readonly status = h("ph-status") as PhStatus;
  private selects: Partial<Record<ClothingSlot, PhSelect>> = {};

  constructor() { super([STYLES]); }

  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }

  render() {
    const character = this.target;
    const presets = h("div", { class: "presets" }, ...Object.values(OUTFIT_PRESETS).map(({ label, outfit }) => {
      const button = h("ph-button", {}, label);
      button.addEventListener("click", () => this.apply(() => character.setOutfit(outfit)));
      return button;
    }));
    const slots = h("div", { style: "display:grid;gap:8px" }, ...Object.entries(character.clothingSlots).map(([name, slot]) => {
      const select = h("ph-select", { label: name[0].toUpperCase() + name.slice(1) }) as PhSelect;
      select.options = Object.entries(slot.items).map(([value, label]) => ({ value, label }));
      select.addEventListener("change", () => this.apply(() => character.setClothing(name as ClothingSlot, select.value as never)));
      this.selects[name as ClothingSlot] = select;
      return select;
    }));
    this.clear();
    this.root.append(presets, slots, this.status);
    this.sync();
  }

  private apply(change: () => void) {
    try {
      change();
      this.sync();
      const outfit = Object.fromEntries(Object.entries(this.target.clothingSlots).map(([k, s]) => [k, s.item]));
      this.changed("clothing", { outfit });
    } catch (error) {
      this.status.setAttribute("tone", "error");
      this.status.message = (error as Error).message;
    }
  }

  private sync() {
    const slots = this.target.clothingSlots;
    for (const [name, slot] of Object.entries(slots)) this.selects[name as ClothingSlot]!.value = slot.item;
    const dressed = Object.values(slots).filter((slot) => slot.item !== "none").length;
    this.status.removeAttribute("tone");
    this.status.message = dressed ? `${dressed} removable clothing layers equipped.` : "All clothing slots empty.";
  }
}

export const registerClothingEditor = () => defineElement("ph-clothing-editor", PhClothingEditor);
