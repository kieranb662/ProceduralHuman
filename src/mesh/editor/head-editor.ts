import * as THREE from "three";
import type { ProceduralCharacter } from "../../humans/types.js";
import type { EditorViewport } from "../../shared/viewport.js";
import { defineElement, h } from "../../ui/api/element.js";
import type { PhButton } from "../../ui/api/button.js";
import type { PhSelect } from "../../ui/api/select.js";
import type { PhSlider } from "../../ui/api/slider.js";
import type { PhStatus } from "../../ui/api/status.js";
import type { PhToggle } from "../../ui/api/toggle.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { PhParameterGroup } from "../../ui/editor/parameter-group.js";
import {
  HEAD_BRUSH_LABELS, HEAD_FEATURE_PARAMETERS, HEAD_TARGET_LABELS, HEAD_TRANSFORM_PARAMETERS,
} from "../api/head/parameters.js";
import { createHeadSculptSession, type HeadHit, type HeadSculptSession } from "../api/head/sculpt-session.js";
import type { HeadBrushMode, HeadDesign, HeadTarget } from "../api/head/types.js";

const HEAD_VIEWS = {
  front: [0, 1.662, 0.56], left: [0.46, 1.662, 0.22], right: [-0.46, 1.662, 0.22],
} as const;
const HEAD_VIEW_TARGET: [number, number, number] = [0, 1.662, 0.035];

/** Detail of the `ph-head-editing` event fired when sculpt mode turns on or off. */
export interface HeadEditingDetail { active: boolean }

/**
 * Neutral-head sculpting in the host's 3D view: canvas brushes (raise, lower, grab, smooth),
 * part transforms, facial contour sliders, undo/redo and optional browser persistence.
 *
 * Set `el.character` and `el.viewport = { renderer, camera, controls, scene }`.
 * While editing, pass `{ headEditor: el.editing }` to character.update() so animation holds the rest pose.
 * Attribute `storage-key` saves/restores the design in localStorage.
 * Events: `ph-head-editing` `{ active }` (hide your own props / re-layout), `ph-change` `{ section: "head" }`.
 */
export class PhHeadEditor extends PhEditorElement<ProceduralCharacter> {
  private session: HeadSculptSession | null = null;
  private view: EditorViewport | null = null;
  private savedView: { position: THREE.Vector3; target: THREE.Vector3; buttons: EditorViewport["controls"]["mouseButtons"] } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cursor = createBrushCursor();
  private rebuildFrame: number | null = null;
  private pointerFrame: number | null = null;
  private pendingPointer: PointerEvent | null = null;
  private strokePointerId: number | null = null;
  private sliderGesture = false;

  private readonly toggle = h("ph-toggle", { label: "Edit neutral head in the canvas" }) as PhToggle;
  private readonly partSelect = h("ph-select", { label: "Part to adjust / sculpt", stacked: true }) as PhSelect;
  private readonly brush = h("ph-select", { label: "Canvas brush", stacked: true }) as PhSelect;
  private readonly radius = h("ph-slider", { label: "Radius", min: 3, max: 60, step: 1, value: 15, decimals: 0, unit: " mm" }) as PhSlider;
  private readonly strength = h("ph-slider", { label: "Strength", min: 0.05, max: 1, step: 0.05, value: 0.4 }) as PhSlider;
  private readonly mirror = h("ph-toggle", { label: "Mirror across the face center", checked: true }) as PhToggle;
  private readonly transforms = h("ph-parameter-group") as PhParameterGroup;
  private readonly features = h("ph-parameter-group") as PhParameterGroup;
  private readonly undoButton = h("ph-button", { disabled: true }, "Undo") as PhButton;
  private readonly redoButton = h("ph-button", { disabled: true }, "Redo") as PhButton;
  private readonly status = h("ph-status", { tone: "muted" }) as PhStatus;

  constructor() {
    super([`.row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; } ph-button { display: block; }`]);
    this.partSelect.options = Object.entries(HEAD_TARGET_LABELS).map(([value, label]) => ({ value, label }));
    this.brush.options = [...Object.entries(HEAD_BRUSH_LABELS), ["orbit", "Navigate only"]].map(([value, label]) => ({ value, label }));
    this.transforms.parameters = HEAD_TRANSFORM_PARAMETERS;
    this.features.parameters = HEAD_FEATURE_PARAMETERS;
    this.wireControls();
  }

  set character(character: ProceduralCharacter) {
    this.session = createHeadSculptSession(character);
    this.restoreStored();
    this.bind(character);
  }
  get character() { return this.target; }

  set viewport(viewport: EditorViewport) {
    this.detachViewport();
    this.view = viewport;
    viewport.scene.add(this.cursor);
    const canvas = viewport.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown, true);
    canvas.addEventListener("pointermove", this.onPointerMove, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, this.onPointerEnd, true);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  /** True while sculpt mode is on. */
  get editing() { return this.session?.active ?? false; }
  /** The design being edited, including uncommitted edits. */
  get headDesign(): HeadDesign | null { return this.session?.design ?? null; }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("keydown", this.onKeyDown);
  }
  disconnectedCallback() {
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("keydown", this.onKeyDown);
  }

  render() {
    const views = h("div", { class: "row" }, ...Object.keys(HEAD_VIEWS).map((name) => {
      const button = h("ph-button", {}, name[0].toUpperCase() + name.slice(1));
      button.addEventListener("click", () => this.guard(() => this.setView(name as keyof typeof HEAD_VIEWS)));
      return button;
    }));
    const reset = h("ph-button", {}, "Reset edits");
    reset.addEventListener("click", () => this.guard(() => {
      this.finishStroke();
      this.setEditing(true);
      this.session.reset();
      this.afterDesignChange();
    }));
    this.clear();
    this.root.append(
      h("ph-panel", { heading: "Default Head & Face Editor" },
        h("p", { slot: "hint" }, "Animation pauses while editing. Left-drag to sculpt, right-drag to orbit, middle-drag to pan, and scroll to zoom. Shift reverses Raise / Lower."),
        this.toggle, views, this.partSelect),
      h("ph-panel", { heading: "Canvas brush", framed: true }, this.brush, this.radius, this.strength, this.mirror),
      h("ph-panel", { heading: "Part size & placement" }, this.transforms),
      h("ph-panel", { heading: "Facial contour adjustments" },
        h("p", { slot: "hint" }, "Signed millimeter offsets sculpt the neutral face, not an expression."),
        this.features),
      h("div", { class: "row" }, this.undoButton, this.redoButton, reset),
      this.status,
    );
    this.showDesignControls();
    this.updateHistoryButtons();
  }

  /** Turns sculpt mode on or off. Turning it off commits the edited head onto the character. */
  setEditing(active: boolean) {
    const session = this.session;
    if (!session || active === session.active) return;
    this.finishStroke();
    const view = this.view;
    if (active) {
      session.begin();
      if (view) {
        const controls = view.controls;
        this.savedView = { position: view.camera.position.clone(), target: controls?.target.clone() ?? new THREE.Vector3(), buttons: { ...controls?.mouseButtons } };
        if (controls) {
          controls.mouseButtons.LEFT = this.brushMode === "orbit" ? THREE.MOUSE.ROTATE : null;
          controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
          controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        }
      }
      this.setView("front");
      this.status.message = "Neutral-pose editor active. Sculpt directly on the selected part.";
    } else {
      if (this.rebuildFrame !== null) this.rebuildNow();
      session.end();
      this.cursor.visible = false;
      if (view && this.savedView) {
        if (view.controls) {
          view.controls.mouseButtons = this.savedView.buttons;
          view.controls.target.copy(this.savedView.target);
        }
        view.camera.position.copy(this.savedView.position);
        view.controls?.update();
      }
      this.savedView = null;
      this.status.message = "Head applied. Animation and facial controls restored.";
      this.changed("head", { committed: true });
    }
    this.toggle.checked = session.active;
    this.updateCanvasCursor();
    this.emit("ph-head-editing", { active: session.active } satisfies HeadEditingDetail);
  }

  /** Frames the head from the front, left or right (enters sculpt mode if needed). */
  setView(name: keyof typeof HEAD_VIEWS) {
    if (!this.editing) return this.setEditing(true);
    const view = this.view;
    if (!view) return;
    const [x, y, z] = HEAD_VIEWS[name];
    view.camera.position.set(x, y, z);
    view.controls?.target.set(...HEAD_VIEW_TARGET);
    view.controls?.update();
    view.camera.updateMatrixWorld();
  }

  // --- controls ----------------------------------------------------------------------------

  private get brushMode() { return this.brush.value as HeadBrushMode | "orbit"; }
  private get headPart() { return this.partSelect.value as HeadTarget; }

  private wireControls() {
    this.toggle.addEventListener("change", () => this.guard(() => this.setEditing(this.toggle.checked)));
    this.partSelect.addEventListener("change", () => { this.finishStroke(); this.showDesignControls(); this.cursor.visible = false; });
    this.brush.addEventListener("change", () => {
      this.finishStroke();
      if (this.editing && this.view?.controls) this.view.controls.mouseButtons.LEFT = this.brushMode === "orbit" ? THREE.MOUSE.ROTATE : null;
      this.updateCanvasCursor();
      this.cursor.visible = false;
    });
    this.transforms.addEventListener("input", (e: CustomEvent) => this.guard(() => {
      this.beginSlider();
      this.session.setTransform(this.headPart, e.detail.key, e.detail.value);
      this.scheduleRebuild();
    }));
    this.features.addEventListener("input", (e: CustomEvent) => this.guard(() => {
      this.beginSlider();
      this.session.setFeature(e.detail.key, e.detail.value);
      this.scheduleRebuild();
    }));
    for (const group of [this.transforms, this.features]) {
      group.addEventListener("change", () => { this.sliderGesture = false; this.afterDesignChange(false); });
    }
    this.undoButton.addEventListener("click", () => this.guard(() => this.history("undo")));
    this.redoButton.addEventListener("click", () => this.guard(() => this.history("redo")));
  }

  private beginSlider() {
    this.setEditing(true);
    this.finishStroke();
    if (!this.sliderGesture) this.session.remember();
    this.sliderGesture = true;
  }

  private history(direction: "undo" | "redo") {
    this.finishStroke();
    this.sliderGesture = false;
    if (!(direction === "undo" ? this.session.canUndo : this.session.canRedo)) return;
    this.setEditing(true);
    this.session[direction]();
    this.afterDesignChange();
  }

  private showDesignControls() {
    const design = this.session?.design;
    if (!design) return;
    const transform = design.transforms[this.headPart] ?? {};
    this.transforms.values = Object.fromEntries(HEAD_TRANSFORM_PARAMETERS.map((p) => [p.key, transform[p.key] ?? p.default]));
    this.features.values = Object.fromEntries(HEAD_FEATURE_PARAMETERS.map((p) => [p.key, design.features[p.key] ?? 0]));
  }

  /** Refreshes controls, persists the design and notifies listeners after an edit. */
  private afterDesignChange(refreshControls = true) {
    if (refreshControls) this.showDesignControls();
    this.updateHistoryButtons();
    this.save();
    this.changed("head", { committed: false });
  }

  private updateHistoryButtons() {
    this.undoButton.disabled = !this.session?.canUndo;
    this.redoButton.disabled = !this.session?.canRedo;
  }

  private scheduleRebuild() {
    if (this.rebuildFrame !== null) return;
    this.rebuildFrame = requestAnimationFrame(() => this.guard(() => this.rebuildNow()));
  }

  private rebuildNow() {
    if (this.rebuildFrame !== null) cancelAnimationFrame(this.rebuildFrame);
    this.rebuildFrame = null;
    this.session.rebuildPreview();
  }

  // --- persistence ---------------------------------------------------------------------------

  private save() {
    const key = this.getAttribute("storage-key");
    const design = this.session.design;
    if (!key) {
      this.status.message = `${design.strokes.length} procedural brush dabs.`;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(design));
      this.status.message = `${design.strokes.length} procedural brush dabs. Saved in this browser.`;
    } catch {
      this.status.message = "Browser storage unavailable. Export the human to keep your edits.";
    }
  }

  private restoreStored() {
    const key = this.getAttribute("storage-key");
    if (!key) return;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return;
      this.session.load(JSON.parse(stored));
      this.status.message = "Previous head edits restored from this browser.";
      this.changed("head", { committed: true });
    } catch (error) {
      console.error("Could not restore head design:", error);
      this.status.message = "Saved head design could not be restored. Original head retained.";
    }
  }

  // --- canvas sculpting ----------------------------------------------------------------------

  private updateCanvasCursor() {
    if (this.view) this.view.renderer.domElement.style.cursor = this.editing && this.brushMode !== "orbit" ? "crosshair" : "";
  }

  private aim(event: PointerEvent) {
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
  }

  /** Aims at the pointer and places the brush cursor on the selected part. */
  private pick(event: PointerEvent): HeadHit | null {
    this.aim(event);
    const hit = this.session.pick(this.raycaster, this.headPart);
    if (!hit) { this.cursor.visible = false; return null; }
    this.cursor.position.copy(hit.worldPoint).addScaledVector(hit.worldNormal, 0.0005);
    this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.worldNormal);
    this.cursor.scale.setScalar(this.radius.value / 1000);
    this.cursor.visible = this.brushMode !== "orbit";
    return hit;
  }

  private sculpt(event: PointerEvent, initial = false) {
    if (!this.session.stroking) return;
    if (this.session.strokeTo((this.pick(event), this.raycaster), event.shiftKey, initial)) this.updateHistoryButtons();
  }

  private finishStroke() {
    if (this.pointerFrame !== null) cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = null;
    if (!this.session?.stroking) return;
    if (this.pendingPointer) this.sculpt(this.pendingPointer);
    this.pendingPointer = null;
    const canvas = this.view?.renderer.domElement;
    if (this.view?.controls) this.view.controls.enabled = true;
    if (canvas && this.strokePointerId !== null && canvas.hasPointerCapture(this.strokePointerId)) canvas.releasePointerCapture(this.strokePointerId);
    this.strokePointerId = null;
    if (this.session.endStroke()) this.afterDesignChange(false);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.editing || this.brushMode === "orbit" || event.button !== 0 || this.session.stroking) return;
    if (this.rebuildFrame !== null) this.rebuildNow();
    const hit = this.pick(event);
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.view.controls) this.view.controls.enabled = false;
    this.session.beginStroke({
      target: this.headPart, mode: this.brushMode as HeadBrushMode,
      radius: this.radius.value / 1000, strength: this.strength.value, mirror: this.mirror.checked,
    }, hit, this.view.camera.getWorldDirection(new THREE.Vector3()));
    this.strokePointerId = event.pointerId;
    this.view.renderer.domElement.setPointerCapture(event.pointerId);
    if (this.brushMode !== "move") this.sculpt(event, true);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.editing) return;
    if (!this.session.stroking) { if (event.buttons === 0) this.pick(event); return; }
    if (event.pointerId !== this.strokePointerId) return;
    event.stopImmediatePropagation();
    this.pendingPointer = event;
    if (this.pointerFrame !== null) return;
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = null;
      const pointer = this.pendingPointer;
      this.pendingPointer = null;
      try { this.sculpt(pointer); } catch (error) { this.finishStroke(); this.report(error); }
    });
  };

  private readonly onPointerEnd = (event: PointerEvent) => {
    if (this.session?.stroking && event.pointerId === this.strokePointerId) {
      event.stopImmediatePropagation();
      this.finishStroke();
    }
  };

  private readonly onPointerLeave = () => { if (!this.session?.stroking) this.cursor.visible = false; };
  private readonly onBlur = () => this.finishStroke();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const tag = (event.composedPath()[0] as HTMLElement)?.tagName;
    if (!this.editing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    event.preventDefault();
    this.guard(() => this.history(event.shiftKey ? "redo" : "undo"));
  };

  private detachViewport() {
    if (!this.view) return;
    const canvas = this.view.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown, true);
    canvas.removeEventListener("pointermove", this.onPointerMove, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.removeEventListener(type, this.onPointerEnd, true);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.cursor.removeFromParent();
  }

  private guard(action: () => void) {
    try { action(); } catch (error) { this.report(error); }
  }

  private report(error: unknown) {
    console.error("Head editor:", error);
    this.status.setAttribute("tone", "error");
    this.status.message = `Head editor error: ${(error as Error).message}`;
  }
}

function createBrushCursor() {
  const points = Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 32), Math.sin(i * Math.PI / 32), 0));
  const cursor = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  cursor.name = "HeadBrushCursor";
  cursor.visible = false;
  cursor.renderOrder = 10;
  return cursor;
}

export const registerHeadEditor = () => defineElement("ph-head-editor", PhHeadEditor);
