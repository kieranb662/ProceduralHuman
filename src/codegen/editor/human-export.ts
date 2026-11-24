import type { ProceduralCharacter } from "../../humans/types.js";
import type { HeadDesign } from "../../mesh/api/head/types.js";
import { defineElement, h } from "../../ui/api/element.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { PhCodeExport } from "../../ui/editor/code-export.js";
import { captureHumanDesign } from "../api/capture.js";
import { generateHumanModule, humanModuleFileName } from "../api/module.js";
import { defineHuman } from "../../humans/design.js";

/**
 * Exports the bound character as a standalone human module (data + create function).
 * Set `el.character`; optionally `el.headDesignProvider` to include uncommitted head edits.
 * Attributes: name (human name, default "Custom Human"), language ("js" | "ts").
 * Refreshes automatically whenever any editor emits `ph-change`.
 */
export class PhHumanExport extends PhEditorElement<ProceduralCharacter> {
  static observedAttributes = ["name", "language"];
  /** Returns the head design to export instead of the committed one (e.g. live sculpt edits). */
  headDesignProvider: (() => HeadDesign | null | undefined) | null = null;
  private readonly code = h("ph-code-export", { label: "Generated human module", "copy-label": "Copy module" }) as PhCodeExport;
  private frame: number | null = null;
  private readonly onDocumentChange = () => this.scheduleRefresh();

  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("ph-change", this.onDocumentChange);
  }
  disconnectedCallback() {
    document.removeEventListener("ph-change", this.onDocumentChange);
  }
  attributeChangedCallback() { if (this.target && this.isConnected) this.render(); }

  private get language(): "js" | "ts" { return this.getAttribute("language") === "ts" ? "ts" : "js"; }
  private get humanName() { return this.getAttribute("name") || "Custom Human"; }

  /** The module source for the current state. */
  generate(): string {
    const design = captureHumanDesign(this.target, { name: this.humanName, head: this.headDesignProvider?.() ?? undefined });
    return generateHumanModule(design, { language: this.language });
  }

  render() {
    this.code.setAttribute("filename", humanModuleFileName(defineHuman({ name: this.humanName }), this.language));
    this.code.setAttribute("download-label", `Export .human.${this.language}`);
    this.code.source = () => this.generate();
    if (!this.code.isConnected) this.root.append(this.code);
  }

  /** Regenerates the module text (coalesced to one per animation frame). */
  scheduleRefresh() {
    if (this.frame !== null || !this.target) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.code.refresh();
    });
  }
}

export const registerHumanExport = () => defineElement("ph-human-export", PhHumanExport);
