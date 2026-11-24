import type * as THREE from "three";
import type { BaseAnimation, ClipName, FaceExpression, UpperAnimation } from "../animations/api/names.js";
import type { HandGesture } from "../animations/api/hand-gestures.js";
import type { FaceSliders } from "../animations/api/face-sliders.js";
import type { Palette } from "../materials/api/palette.js";
import type { TorsoDetailChanges, TorsoDetails } from "../mesh/api/body/torso.js";
import type { ClothingItem, ClothingSlot, Outfit } from "../mesh/api/clothing/items.js";
import type { HeadDesign } from "../mesh/api/head/types.js";
import type { MeshPart } from "../mesh/api/types.js";
import type { ClothingSlotState } from "../mesh/api/clothing/clothing-controller.js";
import type { HeadPreview } from "../mesh/api/head/head-editing.js";
import type { PhysicsDescriptor } from "../physics/api/capsules.js";
import type { HumanoidRig } from "../rigging/api/types.js";
import type { CanvasFactory } from "../textures/api/canvas.js";

/** Everything needed to generate a character. All fields are optional; omitted fields use the defaults. */
export interface CharacterOptions {
  palette?: Palette;
  torsoDetails?: TorsoDetailChanges;
  headDesign?: HeadDesign | null;
  outfit?: Outfit;
  /** Canvas factory for procedural textures (needed outside a browser page). */
  createCanvas?: CanvasFactory;
  /** Random source for blink and gaze timing (default Math.random). Pass a seeded one for deterministic replays and tests. */
  rng?: () => number;
}

/** Per-frame options for ProceduralCharacter.update(). */
export interface CharacterUpdateOptions {
  /** Hold the neutral rest pose (used while sculpting the head). */
  headEditor?: boolean;
  autoBlink?: boolean;
  autoGaze?: boolean;
  /** World-space target for the right-arm "reaching" IK state. */
  reachTarget?: THREE.Vector3 | null;
}

/** The object returned by createAdultMaleCharacter(). */
export interface ProceduralCharacter {
  /** Add this to your scene. */
  root: THREE.Group;
  skinnedMesh: THREE.SkinnedMesh;
  rig: HumanoidRig;
  clips: Record<ClipName, THREE.AnimationClip>;
  bodyParts: MeshPart[];
  clothingRoot: THREE.Group;
  clothingSlots: Record<ClothingSlot, ClothingSlotState>;
  mixers: { base: THREE.AnimationMixer; upper: THREE.AnimationMixer; face: THREE.AnimationMixer };
  faceSliders: FaceSliders;
  physicsDescriptor: PhysicsDescriptor;

  setBaseAnimation(name: BaseAnimation): void;
  setUpperAnimation(name: UpperAnimation): void;
  setFaceExpression(name: FaceExpression): void;
  triggerBlink(): void;
  /** Advance animation by dt seconds. Call once per frame. */
  update(dt: number, opts?: CharacterUpdateOptions): void;

  /** The clip/state currently selected on each animation layer. */
  readonly animationState: { base: BaseAnimation; upper: UpperAnimation; face: FaceExpression };

  setHandGesture(name: HandGesture, side?: "both" | "L" | "R"): void;
  readonly handGestures: { L: HandGesture; R: HandGesture };

  /** The committed head design (updated by commitHeadPreview). */
  readonly headDesign: HeadDesign;
  createHeadPreview(design: HeadDesign): HeadPreview;
  commitHeadPreview(preview: HeadPreview): void;

  setClothing<S extends ClothingSlot>(slot: S, item: ClothingItem<S>): void;
  setOutfit(outfit?: Outfit): void;
  /** Re-point clothing meshes at skinnedMesh.material after replacing the materials. */
  refreshClothingMaterials(): void;

  /** Full current palette: colors, resolved texture settings and the live surface values of every slot. */
  readonly palette: Required<Palette>;
  /**
   * Rebuilds all materials from a palette, disposing the old ones and their textures.
   * `{ rebuild: false }` only records the palette (after applying live edits to the materials yourself).
   */
  setPalette(palette: Palette, options?: { rebuild?: boolean }): void;

  readonly torsoDetails: TorsoDetails;
  setTorsoDetails(changes: TorsoDetailChanges): void;
  resetTorsoDetails(): void;
}

export type { ClothingSlotState, HeadPreview };
