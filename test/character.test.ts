import type * as THREE_T from "three";
import { describe, expect, it } from "vitest";
import {
  FACS_MORPH_NAMES,
  configureTorsoDetails,
  createAdultMaleCharacter,
  createHumanoidSkeleton,
  validateHeadDesign,
} from "../src/index.js";
import { stubCanvas } from "./helpers/stub-canvas.js";


describe("rig", () => {
  it("builds the 84-bone humanoid skeleton with unique names", () => {
    const rig = createHumanoidSkeleton();
    expect(rig.bones).toHaveLength(84);
    expect(new Set(rig.bones.map((b) => b.name)).size).toBe(84);
    expect(rig.boneMap.get("Hand_R")).toBeDefined();
  });
});

describe("validation", () => {
  it("rejects out-of-range torso details", () => {
    expect(() => configureTorsoDetails(null, { buttocks: { depth: 999 } })).toThrow();
    expect(configureTorsoDetails(null, { pectorals: { enabled: true } }).pectorals.enabled).toBe(true);
  });

  it("rejects malformed head designs", () => {
    expect(() => validateHeadDesign({} as any)).toThrow();
    expect(() => validateHeadDesign({ transforms: { nope: {} }, features: {}, strokes: [] } as any)).toThrow();
    expect(() => validateHeadDesign({ transforms: {}, features: {}, strokes: [] })).not.toThrow();
  });
});

describe("createAdultMaleCharacter (headless)", () => {
  const character = createAdultMaleCharacter({ createCanvas: stubCanvas, outfit: { torso: "shirt" } });
  const geo = character.skinnedMesh.geometry;

  it("generates the full mesh with 16 FACS morph targets", () => {
    expect(geo.attributes.position.count).toBe(111382);
    expect(geo.index!.count / 3).toBe(217090);
    expect(Object.keys(character.skinnedMesh.morphTargetDictionary!)).toEqual([...FACS_MORPH_NAMES]);
  });

  it("has finite positions and normalized skin weights", () => {
    const pos = geo.attributes.position.array;
    expect(pos.every(Number.isFinite)).toBe(true);
    const w = geo.attributes.skinWeight;
    for (let i = 0; i < w.count; i++) {
      const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-3);
    }
  });

  it("applies the outfit and exposes all clips", () => {
    expect(character.clothingSlots.torso.item).toBe("shirt");
    expect(Object.keys(character.clips)).toHaveLength(14);
    character.update(1 / 60, { autoBlink: true, autoGaze: true });
  });
});

describe("dispose()", () => {
  it("frees geometry, materials, textures and skeleton and detaches the root", async () => {
    const THREE = await import("three");
    const character = createAdultMaleCharacter({ createCanvas: stubCanvas, outfit: { torso: "shirt" } });
    const scene = new THREE.Scene();
    scene.add(character.root);
    const disposed = new Set<string>();
    const track = (target: { addEventListener: Function }, label: string) =>
      target.addEventListener("dispose", () => disposed.add(label));
    track(character.skinnedMesh.geometry, "body geometry");
    track(character.clothingSlots.torso.mesh!.geometry, "shirt geometry");
    const materials = character.skinnedMesh.material as THREE_T.MeshPhysicalMaterial[];
    track(materials[0], "skin material");
    track(materials[0].map!, "skin texture");
    character.setBaseAnimation("walking");
    character.update(1 / 60);

    character.dispose();
    character.dispose(); // idempotent

    expect([...disposed].sort()).toEqual(["body geometry", "shirt geometry", "skin material", "skin texture"]);
    expect(character.root.parent).toBeNull();
    expect(character.mixers.base.existingAction(character.clips.walking)).toBeNull();
  });
});
