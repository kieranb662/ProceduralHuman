import * as THREE from "three";
import type { ProceduralCharacter } from "../../humans/types.js";
import { defineElement, h } from "../../ui/api/element.js";
import type { PhToggle } from "../../ui/api/toggle.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";

/**
 * Skeleton overlay and mesh wireframe toggles. Set `el.character` and `el.debugScene`.
 * Wireframe is re-applied after material rebuilds reported by the materials editor.
 */
export class PhRigDebug extends PhEditorElement<ProceduralCharacter> {
  private helper: THREE.SkeletonHelper | null = null;
  private readonly skeleton = h("ph-toggle", { label: "Show skeleton (bones)" }) as PhToggle;
  private readonly wireframe = h("ph-toggle", { label: "Wireframe mesh" }) as PhToggle;
  private readonly onDocumentChange = (e: Event) => {
    if ((e as CustomEvent).detail?.section === "materials") this.applyWireframe();
  };
  /** Overlays are hidden while the head is being sculpted. */
  private readonly onHeadEditing = (e: Event) => {
    if (this.helper) this.helper.visible = !(e as CustomEvent).detail.active && this.skeleton.checked;
  };

  constructor() {
    super();
    this.skeleton.addEventListener("change", () => { this.skeletonEnabled = this.skeleton.checked; });
    this.wireframe.addEventListener("change", () => { this.wireframeEnabled = this.wireframe.checked; });
  }

  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }
  set debugScene(scene: THREE.Object3D) {
    this.helper?.removeFromParent();
    if (!this.target) return;
    this.helper = new THREE.SkeletonHelper(this.target.skinnedMesh);
    this.helper.visible = this.skeleton.checked;
    scene.add(this.helper);
  }

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
    this.root.append(this.skeleton, this.wireframe);
  }

  /** Whether the skeleton overlay is enabled. */
  get skeletonEnabled() { return this.skeleton.checked; }
  set skeletonEnabled(enabled: boolean) {
    this.skeleton.checked = enabled;
    if (this.helper) this.helper.visible = enabled;
  }

  /** Current wireframe state; apply it to any extra meshes that share the materials. */
  get wireframeEnabled() { return this.wireframe.checked; }
  set wireframeEnabled(enabled: boolean) {
    this.wireframe.checked = enabled;
    this.applyWireframe();
  }

  private applyWireframe() {
    if (!this.target) return;
    for (const material of this.target.skinnedMesh.material as THREE.Material[]) (material as any).wireframe = this.wireframe.checked;
  }
}

export const registerRigDebug = () => defineElement("ph-rig-debug", PhRigDebug);
