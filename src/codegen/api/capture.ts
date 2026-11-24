import type { HeadDesign } from "../../mesh/api/head/types.js";
import type { Outfit } from "../../mesh/api/clothing/items.js";
import { defineHuman, type HumanDesign } from "../../humans/design.js";
import type { ProceduralCharacter } from "../../humans/types.js";

export interface CaptureOptions {
  name?: string;
  /** Use this head design instead of the committed one (e.g. uncommitted edits in a head editor). */
  head?: HeadDesign;
}

/** Snapshots every attribute of a live character into a complete, serializable HumanDesign. */
export function captureHumanDesign(character: ProceduralCharacter, options: CaptureOptions = {}): HumanDesign {
  const outfit: Outfit = {};
  for (const [slot, state] of Object.entries(character.clothingSlots)) {
    if (state.item !== "none") outfit[slot] = state.item;
  }
  const { base, upper, face } = character.animationState;
  return defineHuman({
    name: options.name,
    head: options.head ?? character.headDesign,
    palette: character.palette,
    torso: character.torsoDetails,
    outfit,
    pose: { base, upper, face, hands: character.handGestures, faceSliders: { ...character.faceSliders } },
  });
}
