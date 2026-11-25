import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: block; }
  label { display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--_text); }
  :host([strong]) label { font-weight: 600; }
  input { accent-color: var(--_accent); margin: 0; }
  :host([disabled]) { opacity: 0.5; }
`;

/** Labelled checkbox. Attributes: label, checked, strong (bold label), disabled. Emits `change`; read `el.checked`. */
export class PhToggle extends PhElement {
  static observedAttributes = ["label", "checked", "disabled"];
  private readonly input = h("input", { type: "checkbox" });
  private readonly text = h("span");

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(h("label", {}, this.input, this.text));
    this.input.addEventListener("change", (event) => {
      event.stopPropagation();
      this.emit("change", { checked: this.checked });
    });
  }

  attributeChangedCallback(name: string) {
    this.text.textContent = this.getAttribute("label") ?? "";
    this.input.disabled = this.hasAttribute("disabled");
    if (name === "checked") this.input.checked = this.hasAttribute("checked");
  }

  get checked() { return this.input.checked; }
  set checked(on: boolean) { this.input.checked = on; }
}

export const registerToggle = () => defineElement("ph-toggle", PhToggle);
