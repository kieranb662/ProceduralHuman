import type { ProceduralCharacter } from "../../humans/types.js";
import { defineElement, h } from "../../ui/api/element.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { PhParameterGroup } from "../../ui/editor/parameter-group.js";
import { DEFAULT_FACE_SLIDERS, FACE_SLIDER_PARAMETERS } from "../api/face-sliders.js";

/**
 * Manual FACS / facial bone sliders bound to character.faceSliders, with a reset action.
 * Set `el.character`. Emits `ph-change` with `{ section: "face", key, value }`.
 */
export class PhFaceEditor extends PhEditorElement<ProceduralCharacter> {
  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }

  render() {
    const sliders = this.target.faceSliders;
    const params = h("ph-parameter-group") as PhParameterGroup;
    params.parameters = FACE_SLIDER_PARAMETERS;
    params.values = sliders as unknown as Record<string, number>;
    params.addEventListener("input", (event: CustomEvent) => {
      sliders[event.detail.key] = event.detail.value;
      this.changed("face", event.detail);
    });
    const reset = h("ph-button", { variant: "ghost", slot: "actions" }, "Reset");
    reset.addEventListener("click", () => {
      Object.assign(sliders, DEFAULT_FACE_SLIDERS);
      params.values = sliders as unknown as Record<string, number>;
      this.changed("face", { reset: true });
    });
    this.clear();
    this.root.append(h("ph-panel", { heading: "Deformable Face & FACS Sliders" }, reset, params));
  }
}

export const registerFaceEditor = () => defineElement("ph-face-editor", PhFaceEditor);
