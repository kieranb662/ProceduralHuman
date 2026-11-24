import type { CanvasFactory } from "../textures/api/canvas.js";
import { createAdultMaleCharacter } from "./create-character.js";
import { defineHuman, type HumanDesignInput, type HumanPose } from "./design.js";
import type { ProceduralCharacter } from "./types.js";

export interface CreateHumanOptions {
  /** Canvas factory for procedural textures (needed outside a browser page). */
  createCanvas?: CanvasFactory;
}

/** Applies a starting pose (animation layers, hand gestures, face sliders) to a character. */
export function applyHumanPose(character: ProceduralCharacter, pose: HumanPose): void {
  character.setBaseAnimation(pose.base);
  character.setUpperAnimation(pose.upper);
  character.setFaceExpression(pose.face);
  character.setHandGesture(pose.hands.L, "L");
  character.setHandGesture(pose.hands.R, "R");
  Object.assign(character.faceSliders, pose.faceSliders);
}

/**
 * Builds a fully rigged, animated character from a design.
 * Add `character.root` to your scene and call `character.update(dt)` every frame.
 */
export function createHuman(design: HumanDesignInput, options: CreateHumanOptions = {}): ProceduralCharacter {
  const d = defineHuman(design);
  const character = createAdultMaleCharacter({
    palette: d.palette,
    torsoDetails: d.torso,
    headDesign: d.head,
    outfit: d.outfit,
    createCanvas: options.createCanvas,
  });
  applyHumanPose(character, d.pose);
  return character;
}
