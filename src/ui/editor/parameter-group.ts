import { PhElement, defineElement, h } from "../api/element.js";
import type { PhSlider } from "../api/slider.js";
import { BASE_STYLES } from "../api/theme.js";

import type { NumericParameter } from "../../shared/parameters.js";

/** One numeric parameter rendered as a ph-slider (see NumericParameter). */
export type ParameterDef = NumericParameter;

/** Detail of the `input` / `change` events: the parameter key and its value in stored units. */
export interface ParameterEventDetail<K extends string = string> { key: K; value: number }

/**
 * A column of ph-slider controls generated from parameter definitions.
 * Set `el.parameters` and `el.values`; emits `input` while dragging and `change` on release,
 * both with `{ key, value }` (value in stored units).
 */
export class PhParameterGroup extends PhElement {
  private defs: readonly ParameterDef[] = [];
  private readonly list = h("div", { style: "display:grid;gap:8px" });

  constructor() {
    super([BASE_STYLES, `:host { display: block; }`]);
    this.root.append(this.list);
  }

  set parameters(defs: readonly ParameterDef[]) {
    this.defs = defs;
    this.list.replaceChildren(...defs.map((def) => {
      const slider = h("ph-slider", {
        label: def.label, min: def.min, max: def.max, step: def.step ?? 0.01,
        decimals: def.decimals ?? 2, unit: def.unit, "data-key": def.key,
      }) as PhSlider;
      slider.addEventListener("input", (event) => {
        event.stopPropagation();
        this.emit("input", { key: def.key, value: slider.value / (def.scale ?? 1) });
      });
      slider.addEventListener("change", (event) => {
        event.stopPropagation();
        this.emit("change", { key: def.key, value: slider.value / (def.scale ?? 1) });
      });
      return slider;
    }));
  }

  /** Current values keyed by parameter key, in stored units. */
  set values(values: Record<string, number>) {
    for (const def of this.defs) {
      const slider = this.list.querySelector(`[data-key="${def.key}"]`) as PhSlider;
      if (slider && values[def.key] !== undefined) slider.value = values[def.key] * (def.scale ?? 1);
    }
  }
}

export const registerParameterGroup = () => defineElement("ph-parameter-group", PhParameterGroup);
