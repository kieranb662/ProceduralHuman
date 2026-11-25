import { PhElement, defineElement } from "./element.js";
import { BASE_STYLES } from "./theme.js";

/** Polite live-region status line. Set `el.message`; attribute tone="info" | "error". */
export class PhStatus extends PhElement {
  constructor() {
    super([BASE_STYLES, `:host { display: block; font-size: 11px; color: var(--_accent); min-height: 1em; }
      :host([tone="error"]) { color: var(--_danger); } :host([tone="muted"]) { color: var(--_muted); }`]);
    this.root.append(document.createElement("slot"));
  }
  // Attributes may not be added in the constructor (createElement would reject the element).
  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "status");
    if (!this.hasAttribute("aria-live")) this.setAttribute("aria-live", "polite");
  }
  set message(text: string) { this.textContent = text; }
  get message() { return this.textContent ?? ""; }
}

export const registerStatus = () => defineElement("ph-status", PhStatus);
