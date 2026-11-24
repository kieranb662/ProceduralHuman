import { PhButton } from "./button.js";
import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: block; }
  .grid { display: grid; grid-template-columns: repeat(var(--ph-columns, 3), minmax(0, 1fr)); gap: 6px; }
  ph-button { display: block; }
`;

export interface SegmentOption { value: string; label: string }

/**
 * Pick-one button group built from ph-button. Set `el.options = [{ value, label }]`.
 * Attributes: value, columns, label (accessible group name). Emits `change`; read `el.value`.
 */
export class PhSegmented extends PhElement {
  static observedAttributes = ["value", "columns", "label"];
  private readonly grid = h("div", { class: "grid", role: "group" });
  private current = "";

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(this.grid);
  }

  attributeChangedCallback(name: string) {
    if (name === "columns") this.style.setProperty("--ph-columns", this.getAttribute("columns"));
    if (name === "label") this.grid.setAttribute("aria-label", this.getAttribute("label") ?? "");
    if (name === "value") this.value = this.getAttribute("value");
  }

  set options(options: SegmentOption[]) {
    this.grid.replaceChildren(...options.map((o) => {
      const button = h("ph-button", { "data-value": o.value }, o.label) as PhButton;
      button.addEventListener("click", () => {
        if (this.current === o.value) return;
        this.value = o.value;
        this.emit("change", { value: o.value });
      });
      return button;
    }));
    this.value = this.current;
  }

  get value() { return this.current; }
  set value(v: string) {
    this.current = v ?? "";
    for (const button of this.grid.children) {
      (button as PhButton).pressed = (button as HTMLElement).dataset.value === this.current;
    }
  }
}

export const registerSegmented = () => defineElement("ph-segmented", PhSegmented);
