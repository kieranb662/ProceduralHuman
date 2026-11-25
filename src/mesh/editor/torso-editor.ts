import { defineElement, h, onDetail } from "../../ui/api/element.js";
import type { PhPanel } from "../../ui/api/panel.js";
import type { PhToggle } from "../../ui/api/toggle.js";
import type { PhSlider } from "../../ui/api/slider.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { ParameterDef, ParameterEventDetail, PhParameterGroup } from "../../ui/editor/parameter-group.js";
import type { ProceduralCharacter } from "../../humans/types.js";
import { TORSO_DETAILS, type TorsoDetailChanges, type TorsoDetails } from "../api/body/torso.js";

/**
 * One framed panel per torso detail (enable toggle + sliders) and a reset button.
 * Edits are batched per animation frame. Set `el.character`. Emits `ph-change` with `{ section: "torso" }`.
 */
export class PhTorsoEditor extends PhEditorElement<ProceduralCharacter> {
  private pending: TorsoDetailChanges = {};
  private frame: number | null = null;

  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }

  render() {
    const settings = this.target.torsoDetails;
    const height = h("ph-slider", {
      label: "Height", min: 0.5, max: 2, step: "any", decimals: 2, unit: "x",
      value: this.target.height,
    }) as PhSlider;
    height.addEventListener("input", () => {
      this.target.setHeight(Math.max(0.5, Math.min(2, height.value)));
      this.changed("torso");
    });
    const resetHeight = h("ph-button", { block: true }, "Reset Height");
    resetHeight.addEventListener("click", () => {
      this.target.setHeight(1);
      height.value = 1;
      this.changed("torso");
    });
    const panels = (Object.entries(TORSO_DETAILS) as [keyof TorsoDetails, (typeof TORSO_DETAILS)[keyof TorsoDetails]][]).map(([group, { label, sliders }]) => {
      const toggle = h("ph-toggle", { label, strong: true, checked: settings[group].enabled, slot: "title" }) as PhToggle;
      const params = h("ph-parameter-group") as PhParameterGroup;
      params.parameters = sliders.map(([key, title, min, max, step]) => ({ key, label: title, min, max, step, decimals: 0 }) as ParameterDef);
      params.values = settings[group] as unknown as Record<string, number>;
      const panel = h("ph-panel", { framed: true, disabled: !settings[group].enabled }, toggle, params) as PhPanel;
      toggle.addEventListener("change", () => {
        panel.toggleAttribute("disabled", !toggle.checked);
        this.schedule(group, "enabled", toggle.checked);
      });
      onDetail<ParameterEventDetail>(params, "input", (_detail, event) => this.schedule(group, event.detail.key, event.detail.value));
      return panel;
    });
    const reset = h("ph-button", { block: true }, "Reset Torso");
    reset.addEventListener("click", () => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.pending = {};
      this.target.resetTorsoDetails();
      this.render();
      this.changed("torso");
    });
    this.clear();
    this.root.append(h("ph-panel", { framed: true, title: "Body Height" }, height, resetHeight), ...panels, reset);
  }

  private schedule(group: keyof TorsoDetails, key: string, value: number | boolean) {
    ((this.pending[group] ??= {}) as Record<string, number | boolean>)[key] = value;
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      const changes = this.pending;
      this.pending = {};
      this.frame = null;
      this.target.setTorsoDetails(changes);
      this.changed("torso");
    });
  }
}

export const registerTorsoEditor = () => defineElement("ph-torso-editor", PhTorsoEditor);
