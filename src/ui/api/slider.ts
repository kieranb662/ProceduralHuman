import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: block; }
  .caption { display: flex; justify-content: space-between; gap: 8px; color: var(--_muted); font-size: 11px; margin-bottom: 2px; }
  output { font-variant-numeric: tabular-nums; color: var(--_text); }
  input { width: 100%; accent-color: var(--_accent); margin: 0; }
  :host([disabled]) { opacity: 0.5; }
`;

/**
 * Labelled range input with a live value readout.
 * Attributes: label, min, max, step, value, decimals (readout precision), unit, disabled.
 * Events: `input` while dragging and `change` on release; read `el.value`.
 */
export class PhSlider extends PhElement {
  static observedAttributes = ["label", "min", "max", "step", "value", "decimals", "unit", "disabled"];
  private readonly input = h("input", { type: "range" });
  private readonly labelEl = h("span");
  private readonly output = h("output");

  constructor() {
    super([BASE_STYLES, STYLES]);
    const label = h("label", {}, h("div", { class: "caption" }, this.labelEl, this.output), this.input);
    this.root.append(label);
    for (const type of ["input", "change"]) {
      this.input.addEventListener(type, (event) => {
        event.stopPropagation();
        this.renderValue();
        this.emit(type, { value: this.value });
      });
    }
  }

  connectedCallback() { this.sync(); }
  attributeChangedCallback() { this.sync(); }

  get value(): number { return Number(this.input.value); }
  set value(v: number) {
    this.input.value = String(v);
    this.renderValue();
  }

  private sync() {
    this.labelEl.textContent = this.getAttribute("label") ?? "";
    this.input.min = String(this.numberAttr("min", 0));
    this.input.max = String(this.numberAttr("max", 1));
    this.input.step = this.getAttribute("step") ?? "0.01";
    this.input.disabled = this.hasAttribute("disabled");
    this.input.setAttribute("aria-label", this.getAttribute("label") ?? "");
    if (this.hasAttribute("value")) this.input.value = this.getAttribute("value");
    this.renderValue();
  }

  private renderValue() {
    const decimals = this.numberAttr("decimals", 2);
    this.output.textContent = `${this.value.toFixed(decimals)}${this.getAttribute("unit") ?? ""}`;
  }
}

export const registerSlider = () => defineElement("ph-slider", PhSlider);
