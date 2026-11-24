import { PhElement } from "../api/element.js";
import { BASE_STYLES } from "../api/theme.js";

/** Detail of the bubbling `ph-change` event every section editor emits after it changes its target. */
export interface EditorChangeDetail {
  section: string;
  [key: string]: unknown;
}

/**
 * Base for section editors: holds the bound target (character, lighting rig...), renders when both
 * bound and connected, and reports edits through a composed `ph-change` event.
 */
export abstract class PhEditorElement<T> extends PhElement {
  /** The bound target; set through each editor's typed setter before render() runs. */
  protected target!: T;

  constructor(styles: string[] = []) {
    super([BASE_STYLES, `:host { display: grid; gap: 16px; }`, ...styles]);
  }

  connectedCallback() {
    if (this.target) this.render();
  }

  protected bind(target: T) {
    this.target = target;
    if (this.isConnected) this.render();
  }

  /** Removes rendered content (everything except the adopted <style>) before a re-render. */
  protected clear() {
    for (const child of [...this.root.children]) if (child.localName !== "style") child.remove();
  }

  /** Rebuilds the controls from the target's current state. */
  abstract render(): void;

  protected changed(section: string, detail: Record<string, unknown> = {}) {
    this.emit("ph-change", { section, ...detail } satisfies EditorChangeDetail);
  }
}
