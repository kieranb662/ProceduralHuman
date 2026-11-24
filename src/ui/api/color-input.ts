import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: block; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  input { width: 48px; height: 32px; padding: 0; border: none; border-radius: var(--_radius-sm); background: var(--_surface-raised); cursor: pointer; }
`;

/** Labelled color picker. Attributes: label, value ("#rrggbb"). Emits `input` and `change`; read `el.value`. */
export class PhColorInput extends PhElement {
  static observedAttributes = ["label", "value"];
  private readonly input = h("input", { type: "color" });
  private readonly text = h("span");

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(h("label", {}, this.text, this.input));
    for (const type of ["input", "change"]) {
      this.input.addEventListener(type, (event) => {
        event.stopPropagation();
        this.emit(type, { value: this.value });
      });
    }
  }

  attributeChangedCallback(name: string) {
    this.text.textContent = this.getAttribute("label") ?? "";
    this.input.setAttribute("aria-label", this.getAttribute("label") ?? "");
    if (name === "value") this.input.value = this.getAttribute("value") ?? "";
  }

  get value() { return this.input.value; }
  set value(v: string) { this.input.value = v; }
}

export const registerColorInput = () => defineElement("ph-color-input", PhColorInput);
