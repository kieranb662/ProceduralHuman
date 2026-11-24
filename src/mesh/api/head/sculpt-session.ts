import * as THREE from "three";
import type { ProceduralCharacter } from "../../../humans/types.js";
import { restoreNeckJoinNormals } from "../merge.js";
import { headTargetTags, validateHeadDesign } from "./design.js";
import type { HeadPreview } from "./head-editing.js";
import { applyHeadSculptStroke, updateHeadPartNormals } from "./sculpt.js";
import type { HeadBrushMode, HeadDesign, HeadFeature, HeadStroke, HeadTarget, HeadTransform } from "./types.js";

const HISTORY_LIMIT = 50;

/** A surface hit on the preview head (local = in the preview mesh's space). */
export interface HeadHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  worldPoint: THREE.Vector3;
  worldNormal: THREE.Vector3;
}

export interface HeadBrushSettings {
  target: HeadTarget;
  mode: HeadBrushMode;
  /** Brush radius in meters. */
  radius: number;
  /** 0..1 */
  strength: number;
  mirror: boolean;
}

interface Gesture extends HeadBrushSettings {
  mirrorX: number;
  center: THREE.Vector3;
  plane: THREE.Plane;
  lastPlanePoint: THREE.Vector3;
  lastCenter?: THREE.Vector3;
  changed: boolean;
}

/**
 * Interactive sculpting of a character's neutral head, independent of any UI.
 * While active, the animated mesh is hidden and an editable preview head is shown in its place;
 * end() commits the edited design back onto the live character.
 */
export function createHeadSculptSession(character: ProceduralCharacter, defaultDesign: HeadDesign = character.headDesign) {
  let design = character.headDesign;
  let preview: HeadPreview | null = null;
  let previewMesh: THREE.Mesh | null = null;
  let gesture: Gesture | null = null;
  let active = false;
  const undoStack: HeadDesign[] = [];
  const redoStack: HeadDesign[] = [];

  function disposePreview(p: HeadPreview | null) {
    if (!p) return;
    p.geometry.dispose();
    for (const part of p.parts) part.geo.dispose();
  }

  /** Rebuilds the preview head from the current design. */
  function rebuildPreview() {
    const next = character.createHeadPreview(design);
    const previous = preview;
    preview = next;
    if (!previewMesh) {
      previewMesh = new THREE.Mesh(next.geometry, character.skinnedMesh.material);
      previewMesh.name = "NeutralHeadEditor";
      previewMesh.castShadow = true;
      previewMesh.receiveShadow = true;
      character.root.add(previewMesh);
    } else {
      previewMesh.geometry = next.geometry;
    }
    disposePreview(previous);
    previewMesh.updateMatrixWorld(true);
  }

  function begin() {
    if (active) return;
    rebuildPreview();
    active = true;
    character.skinnedMesh.visible = false;
    character.clothingRoot.visible = false;
  }

  /** Commits the edited head onto the character and removes the preview. */
  function end() {
    if (!active) return;
    endStroke();
    preview.parts.design = structuredClone(design);
    character.commitHeadPreview(preview);
    active = false;
    character.skinnedMesh.visible = true;
    character.clothingRoot.visible = true;
    previewMesh.removeFromParent();
    disposePreview(preview);
    preview = previewMesh = null;
  }

  /** Validates a design and applies it straight to the character (no preview needed). */
  function load(next: HeadDesign) {
    validateHeadDesign(next);
    if (active) {
      design = structuredClone(next);
      rebuildPreview();
      return;
    }
    const p = character.createHeadPreview(next);
    character.commitHeadPreview(p);
    disposePreview(p);
    design = structuredClone(next);
  }

  /** Saves the current design for undo (call once at the start of each edit gesture). */
  function remember() {
    undoStack.push(structuredClone(design));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function restore(from: HeadDesign[], to: HeadDesign[]): boolean {
    endStroke();
    if (!from.length) return false;
    to.push(structuredClone(design));
    design = from.pop();
    if (active) rebuildPreview();
    return true;
  }

  function reset() {
    endStroke();
    remember();
    design = structuredClone(defaultDesign);
    if (active) rebuildPreview();
  }

  function setTransform(target: HeadTarget, key: keyof HeadTransform, value: number) {
    (design.transforms[target] ??= {})[key] = value;
  }

  function setFeature(key: HeadFeature, value: number) {
    design.features[key] = value;
  }

  /** First surface hit of `raycaster` on the given part of the preview head. */
  function pick(raycaster: THREE.Raycaster, target: HeadTarget): HeadHit | null {
    if (!previewMesh) return null;
    const tags = headTargetTags(target);
    const hit = raycaster.intersectObject(previewMesh).find((h) => {
      const index = h.faceIndex * 3;
      return preview.ranges.some((range) => tags.includes(range.part.tag) &&
        index >= range.indexStart && index < range.indexStart + range.indexCount);
    });
    if (!hit) return null;
    const normal = (hit.normal ?? hit.face.normal).clone();
    return {
      point: previewMesh.worldToLocal(hit.point.clone()),
      normal,
      worldPoint: hit.point.clone(),
      worldNormal: normal.clone().transformDirection(previewMesh.matrixWorld),
    };
  }

  function syncPreviewVertices() {
    const pos = preview.geometry.attributes.position;
    const normals = preview.geometry.attributes.normal;
    const tags = new Set([...headTargetTags(gesture.target), "cavity"]);
    for (const range of preview.ranges) {
      if (!tags.has(range.part.tag)) continue;
      updateHeadPartNormals(range.part);
      (pos.array as Float32Array).set(range.part.geo.attributes.position.array, range.offset * 3);
      (normals.array as Float32Array).set(range.part.geo.attributes.normal.array, range.offset * 3);
    }
    restoreNeckJoinNormals(preview.geometry);
    pos.needsUpdate = normals.needsUpdate = true;
    preview.geometry.computeBoundingSphere();
    preview.geometry.computeBoundingBox();
  }

  /** Starts a brush stroke at `hit`. `viewDirection` orients the drag plane of the move brush. */
  function beginStroke(brush: HeadBrushSettings, hit: HeadHit, viewDirection: THREE.Vector3) {
    endStroke();
    gesture = {
      ...brush,
      mirrorX: ((design.transforms.all?.x ?? 0) + (brush.target === "all" ? 0 : design.transforms[brush.target]?.x ?? 0)) / 1000,
      center: hit.point,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(viewDirection, hit.worldPoint),
      lastPlanePoint: hit.worldPoint.clone(),
      changed: false,
    };
  }

  /**
   * Continues the stroke toward the raycaster's ray. `invert` flips raise/lower (e.g. Shift held).
   * Returns true when the surface changed.
   */
  function strokeTo(raycaster: THREE.Raycaster, invert = false, initial = false): boolean {
    if (!gesture) return false;
    const strength = gesture.strength;
    let center: THREE.Vector3, delta: THREE.Vector3;
    if (gesture.mode === "move") {
      const point = raycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3());
      if (!point) return false;
      delta = previewMesh.worldToLocal(point.clone())
        .sub(previewMesh.worldToLocal(gesture.lastPlanePoint.clone())).multiplyScalar(strength);
      gesture.lastPlanePoint.copy(point);
      if (delta.lengthSq() < 1e-12) return false;
      center = gesture.center.clone();
      gesture.center.add(delta);
    } else {
      const hit = pick(raycaster, gesture.target);
      if (!hit) return false;
      center = hit.point;
      if (!initial && gesture.lastCenter && center.distanceTo(gesture.lastCenter) < gesture.radius * 0.12) return false;
      gesture.lastCenter = center.clone();
      const sign = (gesture.mode === "lower" ? -1 : 1) * (invert ? -1 : 1);
      delta = hit.normal.multiplyScalar(sign * strength * 0.002);
    }
    const stroke: HeadStroke = {
      target: gesture.target, mode: gesture.mode, center: center.toArray(), delta: delta.toArray(),
      radius: gesture.radius, strength, mirror: gesture.mirror, mirrorX: gesture.mirrorX,
    };
    if (!applyHeadSculptStroke(preview.parts, stroke)) return false;
    if (!gesture.changed) { remember(); gesture.changed = true; }
    design.strokes.push(stroke);
    syncPreviewVertices();
    return true;
  }

  /** Ends the current stroke. Returns true when it changed the design (the preview is then rebuilt). */
  function endStroke(): boolean {
    if (!gesture) return false;
    const { changed } = gesture;
    gesture = null;
    if (changed) rebuildPreview();
    return changed;
  }

  return {
    begin, end, load, rebuildPreview, remember, reset, setTransform, setFeature,
    pick, beginStroke, strokeTo, endStroke,
    undo: () => restore(undoStack, redoStack),
    redo: () => restore(redoStack, undoStack),
    get active() { return active; },
    get stroking() { return gesture !== null; },
    get design() { return structuredClone(design); },
    get previewMesh() { return previewMesh; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
  };
}

export type HeadSculptSession = ReturnType<typeof createHeadSculptSession>;
