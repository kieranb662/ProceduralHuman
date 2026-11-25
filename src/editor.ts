/**
 * @kieranb662/procedural-human/editor: interactive editor elements for every section.
 *
 *   import { registerEditorElements } from "@kieranb662/procedural-human/editor";
 *   registerEditorElements();
 *   document.querySelector("ph-materials-editor").character = character;
 */
import { registerAnimationEditor } from "./animations/editor/animation-editor.js";
import { registerFaceEditor } from "./animations/editor/face-editor.js";
import { registerHumanExport } from "./codegen/editor/human-export.js";
import { registerLightingEditor } from "./lighting/editor/lighting-editor.js";
import { registerMaterialsEditor } from "./materials/editor/materials-editor.js";
import { registerClothingEditor } from "./mesh/editor/clothing-editor.js";
import { registerHeadEditor } from "./mesh/editor/head-editor.js";
import { registerTorsoEditor } from "./mesh/editor/torso-editor.js";
import { registerPhysicsDebug } from "./physics/editor/physics-debug.js";
import { registerRigDebug } from "./rigging/editor/rig-debug.js";
import { registerUiElements } from "./ui/register.js";

export * from "./mesh/editor/index.js";
export * from "./rigging/editor/index.js";
export * from "./textures/editor/index.js";
export * from "./materials/editor/index.js";
export * from "./animations/editor/index.js";
export * from "./lighting/editor/index.js";
export * from "./codegen/editor/index.js";
export * from "./physics/editor/index.js";
export type { EditorChangeDetail } from "./ui/editor/editor-element.js";
export type { EditorViewport, ViewportControls } from "./shared/viewport.js";

/** Defines every ph-* editor element and the UI components they use (idempotent; no-op outside a browser). */
export function registerEditorElements(): void {
  registerUiElements();
  registerAnimationEditor();
  registerFaceEditor();
  registerHumanExport();
  registerLightingEditor();
  registerMaterialsEditor();
  registerClothingEditor();
  registerHeadEditor();
  registerTorsoEditor();
  registerPhysicsDebug();
  registerRigDebug();
}
