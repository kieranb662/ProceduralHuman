import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: block; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  :host([stacked]) label { flex-direction: column; align-items: stretch; gap: 4px; }
  span { color: var(--_text); }
  span:empty { display: none; }
  select {
    min-width: 0; flex: 1 1 auto; max-width: 11rem; padding: 6px; border-radius: var(--_radius-sm);
    background: var(--_surface-raised); border: 1px solid var(--_border);
  }
  :host([stacked]) select { max-width: none; }
`;

export interface SelectOption { value: string; label: string }

/**
 * Labelled dropdown. Set `el.options = [{ value, label }]`. Attributes: label, value, stacked.
 * Emits `change`; read `el.value`.
 */
export class PhSelect extends PhElement {
  static observedAttributes = ["label", "value"];
  private readonly select = h("select");
  private readonly text = h("span");

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(h("label", {}, this.text, this.select));
    this.select.addEventListener("change", (event) => {
      event.stopPropagation();
      this.emit("change", { value: this.value });
    });
  }

  attributeChangedCallback(name: string) {
    this.text.textContent = this.getAttribute("label") ?? "";
    this.select.setAttribute("aria-label", this.getAttribute("label") ?? "");
    if (name === "value") this.select.value = this.getAttribute("value") ?? "";
  }

  set options(options: SelectOption[]) {
    const current = this.select.value;
    this.select.replaceChildren(...options.map((o) => h("option", { value: o.value }, o.label)));
    if (options.some((o) => o.value === current)) this.select.value = current;
    else if (this.hasAttribute("value")) this.select.value = this.getAttribute("value") ?? "";
  }

  get value() { return this.select.value; }
  set value(v: string) { this.select.value = v; }
}

export const registerSelect = () => defineElement("ph-select", PhSelect);
