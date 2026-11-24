import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const STYLES = `
  :host { display: inline-block; }
  :host([block]) { display: block; }
  button {
    width: 100%; padding: 6px 12px; border-radius: var(--_radius); border: 1px solid transparent;
    background: var(--_surface-raised); color: var(--_text); cursor: pointer; font-weight: 500;
    transition: background-color 120ms, color 120ms;
  }
  button:hover:not(:disabled) { filter: brightness(1.15); }
  :host([variant="primary"]) button, :host([pressed]) button { background: var(--_accent); color: var(--_accent-text); }
  :host([variant="primary"]) button:hover:not(:disabled) { background: var(--_accent-hover); filter: none; }
  :host([variant="ghost"]) button { background: transparent; color: var(--_accent); text-decoration: underline; padding: 2px 4px; }
  button:disabled { opacity: 0.4; cursor: default; }
`;

/**
 * Themed button. Attributes: variant ("primary" | "secondary" | "ghost"), pressed (toggled/selected
 * state, reflected to aria-pressed), block (full width), disabled. Listen for `click`.
 */
export class PhButton extends PhElement {
  static observedAttributes = ["pressed", "disabled"];
  private readonly button = h("button", { part: "button" }, h("slot"));

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(this.button);
    // Swallow clicks while disabled so host listeners don't fire.
    this.addEventListener("click", (event) => { if (this.disabled) event.stopImmediatePropagation(); }, { capture: true });
  }

  attributeChangedCallback() {
    this.button.disabled = this.disabled;
    if (this.hasAttribute("pressed") || this.button.hasAttribute("aria-pressed")) {
      this.button.setAttribute("aria-pressed", String(this.pressed));
    }
  }

  get pressed() { return this.hasAttribute("pressed"); }
  set pressed(on: boolean) { this.toggleAttribute("pressed", on); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(on: boolean) { this.toggleAttribute("disabled", on); }
}

export const registerButton = () => defineElement("ph-button", PhButton);
