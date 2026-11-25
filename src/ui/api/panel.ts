import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: block; }
  section { display: grid; gap: var(--_gap); }
  :host([framed]) section { background: var(--_surface-sunken); border: 1px solid var(--_border); border-radius: var(--_radius); padding: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h2 { margin: 0; font-size: 1em; font-weight: 600; color: var(--_text); }
  ::slotted([slot="hint"]) { margin: 0; font-size: 11px; color: var(--_muted); line-height: 1.5; }
  :host([disabled]) .body { opacity: 0.5; pointer-events: none; }
`;

/**
 * Titled section. Attributes: heading, framed (bordered card), disabled (dims and locks the body).
 * Slots: default (body), "title" (replaces the heading, stays enabled when the panel is disabled),
 * "actions" (header right), "hint" (muted description).
 */
export class PhPanel extends PhElement {
  static observedAttributes = ["heading"];
  private readonly labelEl = h("h2");

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(h("section", {},
      h("header", {}, h("slot", { name: "title" }, this.labelEl), h("slot", { name: "actions" })),
      h("slot", { name: "hint" }),
      h("div", { class: "body", style: "display:grid;gap:var(--_gap)" }, h("slot"))));
  }

  attributeChangedCallback() {
    this.labelEl.textContent = this.getAttribute("heading") ?? "";
  }
}

export const registerPanel = () => defineElement("ph-panel", PhPanel);
