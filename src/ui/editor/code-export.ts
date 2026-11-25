import { PhElement, defineElement, h } from "../api/element.js";
import type { PhStatus } from "../api/status.js";
import { BASE_STYLES } from "../api/theme.js";

const STYLES = `
  :host { display: grid; gap: var(--_gap); }
  textarea {
    width: 100%; height: 9rem; resize: vertical; padding: 8px; border-radius: var(--_radius-sm);
    background: #020617; border: 1px solid var(--_border); color: #a5f3fc;
    font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; user-select: text;
  }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  ph-button { display: block; }
`;

/**
 * Read-only code view with Copy and Download actions.
 * Set `el.source` to a string or a function returning one (evaluated lazily on refresh/copy/download).
 * Attributes: label (accessible name), filename, copy-label, download-label.
 */
export class PhCodeExport extends PhElement {
  static observedAttributes = ["label", "copy-label", "download-label"];
  private readonly textarea = h("textarea", { readonly: true, spellcheck: "false" });
  private readonly copyButton = h("ph-button", { variant: "primary" }, "Copy");
  private readonly downloadButton = h("ph-button", {}, "Download");
  private readonly status = h("ph-status") as PhStatus;
  private provider: string | (() => string) = "";

  constructor() {
    super([BASE_STYLES, STYLES]);
    this.root.append(this.textarea, h("div", { class: "actions" }, this.copyButton, this.downloadButton), this.status);
    this.copyButton.addEventListener("click", () => this.copy());
    this.downloadButton.addEventListener("click", () => this.download());
  }

  attributeChangedCallback() {
    this.textarea.setAttribute("aria-label", this.getAttribute("label") ?? "Generated code");
    this.copyButton.textContent = this.getAttribute("copy-label") ?? "Copy";
    this.downloadButton.textContent = this.getAttribute("download-label") ?? "Download";
  }

  set source(source: string | (() => string)) {
    this.provider = source;
    this.refresh();
  }

  /** Re-evaluates the source. */
  refresh(): string {
    const text = typeof this.provider === "function" ? this.provider() : this.provider;
    if (this.textarea.value !== text) this.textarea.value = text;
    return text;
  }

  async copy() {
    const text = this.refresh();
    try {
      await navigator.clipboard.writeText(text);
      this.status.message = "Copied.";
    } catch {
      this.textarea.focus();
      this.textarea.select();
      this.status.message = "Clipboard unavailable. Code selected; copy manually or download it.";
    }
  }

  download() {
    const text = this.refresh();
    const url = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    const link = h("a", { href: url, download: this.getAttribute("filename") ?? "export.js" });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.status.message = "Downloaded.";
  }
}

export const registerCodeExport = () => defineElement("ph-code-export", PhCodeExport);
