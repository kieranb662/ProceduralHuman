/**
 * Base class and registration helpers for the ph- web components.
 * Safe to import outside a browser: classes extend a stub when HTMLElement is unavailable
 * and registration is a no-op without customElements.
 */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** Registers a custom element once; later calls with the same tag are ignored. */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  if (typeof customElements === "undefined" || customElements.get(tag)) return;
  customElements.define(tag, ctor);
}

/** Shadow-DOM element with adopted styles and helpers for typed attributes and composed events. */
export abstract class PhElement extends HTMLElementBase {
  protected readonly root: ShadowRoot;

  constructor(styles: string[] = []) {
    super();
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles.join("\n");
    this.root.append(style);
  }

  protected numberAttr(name: string, fallback: number): number {
    const raw = this.getAttribute(name);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  /** Dispatches a bubbling, composed event (crosses shadow boundaries like native input events). */
  protected emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/** Creates an element with attributes and children in one call. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | boolean | number | undefined>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K];
export function h(tag: string, attrs?: Record<string, string | boolean | number | undefined>, ...children: (Node | string)[]): HTMLElement;
export function h(tag: string, attrs: Record<string, string | boolean | number | undefined> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(key, value === true ? "" : String(value));
  }
  el.append(...children);
  return el;
}
