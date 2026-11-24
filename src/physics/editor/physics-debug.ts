import type * as THREE from "three";
import type { ProceduralCharacter } from "../../humans/types.js";
import { defineElement, h } from "../../ui/api/element.js";
import type { PhToggle } from "../../ui/api/toggle.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import { capsuleForStance, createCapsuleDebugMesh, describeCapsule } from "../api/debug-capsule.js";

const STYLES = `pre { margin: 0; padding: 8px; border-radius: var(--_radius-sm); background: #0f172a; color: #6ee7b7;
  font: 10px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }`;

/**
 * Collider readout and a toggleable wireframe capsule that follows the character's stance.
 * Set `el.character` and `el.scene`. The capsule updates when any editor reports an animation change
 * (`ph-change` on the document); call `refresh()` after changing the stance from code.
 */
export class PhPhysicsDebug extends PhEditorElement<ProceduralCharacter> {
  private scene: THREE.Object3D | null = null;
  private mesh: THREE.Mesh | null = null;
  private readonly toggle = h("ph-toggle", { label: "Show Rapier capsule collider" }) as PhToggle;
  private readonly readout = h("pre");
  private readonly onDocumentChange = (e: Event) => {
    if ((e as CustomEvent).detail?.section === "animations") this.refresh();
  };
  /** The capsule is hidden while the head is being sculpted. */
  private readonly onHeadEditing = (e: Event) => {
    if (this.mesh) this.mesh.visible = !(e as CustomEvent).detail.active && this.toggle.checked;
  };

  constructor() {
    super([STYLES]);
    this.toggle.addEventListener("change", () => { if (this.mesh) this.mesh.visible = this.toggle.checked; });
  }

  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }
  /** Scene (or any parent) the debug capsule is added to. */
  set debugScene(scene: THREE.Object3D) { this.scene = scene; this.refresh(); }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("ph-change", this.onDocumentChange);
    document.addEventListener("ph-head-editing", this.onHeadEditing);
  }
  disconnectedCallback() {
    document.removeEventListener("ph-change", this.onDocumentChange);
    document.removeEventListener("ph-head-editing", this.onHeadEditing);
  }

  render() {
    this.clear();
    this.root.append(this.toggle, this.readout);
    this.refresh();
  }

  refresh() {
    if (!this.target) return;
    const stance = this.target.animationState.base;
    const capsule = capsuleForStance(this.target.physicsDescriptor, stance);
    this.readout.textContent = describeCapsule(capsule, stance);
    if (!this.scene) return;
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    this.mesh = createCapsuleDebugMesh(capsule);
    this.mesh.visible = this.toggle.checked;
    this.scene.add(this.mesh);
  }
}

export const registerPhysicsDebug = () => defineElement("ph-physics-debug", PhPhysicsDebug);
