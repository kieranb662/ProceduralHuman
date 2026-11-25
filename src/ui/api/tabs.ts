import type { PhButton } from "./button.js";
import { PhElement, defineElement, h } from "./element.js";
import { BASE_STYLES } from "./theme.js";

const TAB_STYLES = `
  :host { display: flex; flex-direction: column; min-height: 0; }
  [role="tablist"] { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 6px; padding-bottom: 12px; }
  ph-button { display: block; --ph-font-size: 11px; }
  ph-button::part(button) { padding: 6px 4px; }
  .panels { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
`;

/** One tab's content inside <ph-tabs>. Attribute: label (tab button text). */
export class PhTabPanel extends PhElement {
  static observedAttributes = ["label"];
  constructor() {
    super([BASE_STYLES, `:host { display: grid; gap: 16px; } :host(:not([active])) { display: none; }`]);
    this.root.append(h("slot"));
  }
  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "tabpanel");
  }
  attributeChangedCallback() { this.closest("ph-tabs")?.dispatchEvent(new Event("ph-tabs-refresh")); }
}

/**
 * Tab strip over slotted <ph-tab-panel> children. Attribute/property `selected` is the
 * active panel's index. Emits `change` with `{ index, label }` when the user switches tabs.
 */
export class PhTabs extends PhElement {
  static observedAttributes = ["selected"];
  private readonly list = h("div", { role: "tablist" });

  constructor() {
    super([BASE_STYLES, TAB_STYLES]);
    const slot = h("slot");
    this.root.append(this.list, h("div", { class: "panels" }, slot));
    slot.addEventListener("slotchange", () => this.render());
    this.addEventListener("ph-tabs-refresh", () => this.render());
  }

  private get panels(): PhTabPanel[] {
    return [...this.children].filter((c): c is PhTabPanel => c.localName === "ph-tab-panel");
  }

  attributeChangedCallback() { this.render(); }

  get selected() { return Math.max(0, Number(this.getAttribute("selected") ?? 0) | 0); }
  set selected(index: number) { this.setAttribute("selected", String(index)); }

  private render() {
    const panels = this.panels, selected = Math.min(this.selected, Math.max(0, panels.length - 1));
    this.list.replaceChildren(...panels.map((panel, i) => {
      const button = h("ph-button", { role: "tab", "aria-selected": String(i === selected) }, panel.getAttribute("label") ?? `Tab ${i + 1}`) as PhButton;
      button.pressed = i === selected;
      button.addEventListener("click", () => {
        if (i === this.selected) return;
        this.selected = i;
        this.emit("change", { index: i, label: panel.getAttribute("label") });
      });
      return button;
    }));
    panels.forEach((panel, i) => panel.toggleAttribute("active", i === selected));
  }
}

export const registerTabs = () => {
  defineElement("ph-tab-panel", PhTabPanel);
  defineElement("ph-tabs", PhTabs);
};
