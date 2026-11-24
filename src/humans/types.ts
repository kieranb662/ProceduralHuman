import type * as THREE from "three";
import type { BaseAnimation, ClipName, FaceExpression, UpperAnimation } from "../animations/api/names.js";
import type { HandGesture } from "../animations/api/hand-gestures.js";
import type { Palette } from "../materials/api/palette.js";
import type { TorsoDetailChanges, TorsoDetails } from "../mesh/api/body/torso.js";
import type { ClothingItem, ClothingSlot, Outfit } from "../mesh/api/clothing/items.js";
import type { HeadDesign, HeadParts } from "../mesh/api/head/types.js";
import type { MeshPart } from "../mesh/api/types.js";
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

/** Manual facial controls applied after the expression clips each frame. */
export interface FaceSliders {
  jaw: number; smile: number; pucker: number; browUp: number; browDown: number; cheek: number;
  tongueOut: number; tongueCurl: number;
  upperLip: number; lowerLip: number; lidTop: number; lidBot: number;
  eyeX: number; eyeY: number; nose: number; ears: number;
}

export interface ClothingSlotState {
  items: Record<string, string>;
  item: string;
  mesh: THREE.SkinnedMesh | null;
}

/** A head rebuilt off-screen for live editing; pass it to commitHeadPreview() to apply. */
export interface HeadPreview {
  rig: HumanoidRig;
  parts: HeadParts;
  geometry: THREE.BufferGeometry;
  ranges: { part: MeshPart; offset: number; indexStart: number; indexCount: number }[];
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

  setHandGesture(name: HandGesture, side?: "both" | "L" | "R"): void;
  readonly handGestures: { L: HandGesture; R: HandGesture };

  readonly headDesign: HeadDesign;
  createHeadPreview(design: HeadDesign): HeadPreview;
  commitHeadPreview(preview: HeadPreview): void;

  setClothing<S extends ClothingSlot>(slot: S, item: ClothingItem<S>): void;
  setOutfit(outfit?: Outfit): void;
  /** Re-point clothing meshes at skinnedMesh.material after replacing the materials. */
  refreshClothingMaterials(): void;

  readonly torsoDetails: TorsoDetails;
  setTorsoDetails(changes: TorsoDetailChanges): void;
  resetTorsoDetails(): void;
}
