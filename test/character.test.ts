import type * as THREE_T from "three";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  FACS_MORPH_NAMES,
  configureTorsoDetails,
  createAdultMaleCharacter,
  createHumanoidSkeleton,
  createTwistHelpers,
  validateHeadDesign,
} from "../src/index.js";
import { stubCanvas } from "./helpers/stub-canvas.js";


describe("rig", () => {
  it("builds the 86-bone humanoid skeleton with unique names", () => {
    const rig = createHumanoidSkeleton();
    expect(rig.bones).toHaveLength(86);
    expect(new Set(rig.bones.map((b) => b.name)).size).toBe(86);
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

  describe("height customization", () => {
    it("preserves the head and limb radii, rebinds the rig, and survives stress poses at both extremes", () => {
      const character = createAdultMaleCharacter({ createCanvas: stubCanvas });
      const geometry = character.skinnedMesh.geometry;
      const neutral = geometry.attributes.position.array.slice();
      const skinWeights = geometry.attributes.skinWeight.array.slice();
      const indices = geometry.index!.array.slice();
      geometry.computeBoundingBox();
      const defaultHeight = geometry.boundingBox!.getSize(new THREE.Vector3()).y;
      const bodyCount = character.bodyParts[0].geo.attributes.position.count;
      const headStart = character.bodyParts.reduce((n, p) => n + p.geo.attributes.position.count, 0);
      const neutralHand = character.rig.worldRest.get("Hand_L").clone();
      const point = new THREE.Vector3();
      // Radial extent of the body skin around the middle of a bone, measured from its axis.
      const girth = (bone: string, child: string) => {
        const index = character.rig.bones.findIndex((b) => b.name === bone);
        const a = character.rig.worldRest.get(bone), b = character.rig.worldRest.get(child);
        const axis = b.clone().sub(a), length = axis.length();
        axis.normalize();
        const { position, skinIndex } = geometry.attributes;
        let min = Infinity, max = 0;
        for (let i = 0; i < bodyCount; i++) {
          const v = point.fromBufferAttribute(position, i).sub(a);
          const along = v.dot(axis) / length;
          if (skinIndex.getX(i) !== index || along < 0.4 || along > 0.6) continue;
          const radius = v.addScaledVector(axis, -v.dot(axis)).length();
          min = Math.min(min, radius);
          max = Math.max(max, radius);
        }
        return [min, max];
      };
      const limbs: [string, string][] = [["Shin_L", "Foot_L"], ["Shin_R", "Foot_R"], ["Forearm_L", "Hand_L"], ["UpperArm_R", "Forearm_R"], ["Spine", "Spine1"]];
      const girths = limbs.map(([bone, child]) => girth(bone, child));
      for (const height of [1 / 2, 2]) {
        character.setHeight(height);
        geometry.computeBoundingBox();
        expect(geometry.boundingBox!.getSize(point).y).toBeCloseTo(defaultHeight * height, 5);
        expect(character.root.scale.toArray()).toEqual([1, 1, 1]);
        const shift = defaultHeight * (height - 1);
        const position = geometry.attributes.position;
        expect(geometry.index!.array).toEqual(indices);
        if (height < 1) expect(geometry.attributes.skinWeight.array).not.toEqual(skinWeights);
        let weightError = 0;
        const weights = geometry.attributes.skinWeight;
        for (let i = 0; i < weights.count; i++) {
          weightError = Math.max(weightError, Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1));
        }
        expect(weightError).toBeLessThan(1e-6);
        let headError = 0, footError = 0, handError = 0, bindError = 0;
        for (let i = headStart; i < position.count; i++) {
          headError = Math.max(headError, Math.abs(position.getX(i) - neutral[i * 3]),
            Math.abs(position.getY(i) - neutral[i * 3 + 1] - shift),
            Math.abs(position.getZ(i) - neutral[i * 3 + 2]));
        }
        for (let i = 0; i < bodyCount; i++) {
          if (neutral[i * 3 + 1] > 0.07) continue;
          footError = Math.max(footError, point.fromBufferAttribute(position, i).distanceTo(new THREE.Vector3().fromArray(neutral, i * 3)));
        }
        // Finger and nail parts move rigidly with their hand.
        let start = bodyCount;
        for (const part of character.bodyParts.slice(1)) {
          const n = part.geo.attributes.position.count;
          const offset = point.fromBufferAttribute(position, start).sub(new THREE.Vector3().fromArray(neutral, start * 3)).clone();
          for (let i = start; i < start + n; i++) {
            const moved = new THREE.Vector3().fromBufferAttribute(position, i).sub(new THREE.Vector3().fromArray(neutral, i * 3));
            handError = Math.max(handError, moved.distanceTo(offset));
          }
          start += n;
        }
        expect(headError).toBeLessThan(3e-7);
        expect(footError).toBeLessThan(1e-6);
        expect(handError).toBeLessThan(1e-6);
        limbs.forEach(([bone, child], k) => {
          const [min, max] = girth(bone, child);
          expect(min, `${bone} girth at ${height}x`).toBeCloseTo(girths[k][0], 2);
          expect(max, `${bone} girth at ${height}x`).toBeCloseTo(girths[k][1], 2);
        });
        for (const bone of character.rig.bones) bone.quaternion.identity();
        character.root.updateMatrixWorld(true);
        character.rig.skeleton.update();
        for (let i = 0; i < position.count; i += 31) {
          const expected = new THREE.Vector3().fromBufferAttribute(position, i);
          bindError = Math.max(bindError, character.skinnedMesh.getVertexPosition(i, point).distanceTo(expected));
        }
        expect(bindError).toBeLessThan(1e-6);
        expect(character.rig.worldRest.get("Hand_L").distanceTo(neutralHand)).toBeGreaterThan(0.1);
        expect(character.physicsDescriptor.eyeHeight).toBeCloseTo(character.rig.worldRest.get("Eye_L").y);
        for (const sign of [-1, 1]) {
          character.update(0, { headEditor: true });
          character.rig.boneMap.get("UpperArm_L").rotation.z = sign * 1.4;
          character.rig.boneMap.get("Forearm_R").rotation.x = -1.8;
          character.rig.boneMap.get("Thigh_L").rotation.x = -1.2;
          character.rig.boneMap.get("Shin_L").rotation.x = 1.9;
          character.rig.boneMap.get("Spine").rotation.y = sign * 0.4;
          createTwistHelpers(character.rig).update();
          character.root.updateMatrixWorld(true);
          character.rig.skeleton.update();
          let finite = true;
          for (let i = 0; i < position.count; i++) {
            character.skinnedMesh.getVertexPosition(i, point);
            finite &&= point.toArray().every(Number.isFinite);
          }
          expect(finite).toBe(true);
        }
      }
      character.setHeight(1);
      expect(geometry.attributes.position.array).toEqual(neutral);
      expect(geometry.attributes.skinWeight.array).toEqual(skinWeights);
      character.dispose();
    });

    it("keeps edits, garments, facial morphs and animation state coherent across live height changes", () => {
      const character = createAdultMaleCharacter({ createCanvas: stubCanvas, height: 1 / 2, outfit: { torso: "shirt" } });
      character.setBaseAnimation("running");
      character.setFaceExpression("smiling");
      character.update(0.1);
      const before = character.mixers.base.existingAction(character.clips.running)!.getEffectiveWeight();
      character.setHeight(2);
      expect(character.mixers.base.existingAction(character.clips.running)!.getEffectiveWeight()).toBeCloseTo(before);
      character.update(0.3);
      expect(character.mixers.base.existingAction(character.clips.running)!.getEffectiveWeight()).toBe(1);
      expect(character.mixers.base.existingAction(character.clips.idle)!.isScheduled()).toBe(false);
      character.setTorsoDetails({ pectorals: { enabled: true, depth: 30 } });
      const preview = character.createHeadPreview({ transforms: { ears: { sx: 1.2 } }, features: {}, strokes: [] });
      character.commitHeadPreview(preview);
      preview.geometry.dispose();
      for (const part of preview.parts) part.geo.dispose();
      character.setClothing("legs", "trousers");
      character.update(0.1);
      expect(character.height).toBe(2);
      expect(character.animationState).toEqual({ base: "running", upper: "none", face: "smiling" });
      expect(character.rig.boneMap.get("Hips").position.y).toBeGreaterThan(1.8);
      expect(character.rig.worldRest.get("Eye_L").y).toBeGreaterThan(3);
      expect(character.headDesign.transforms.ears?.sx).toBe(1.2);
      expect(character.skinnedMesh.geometry.morphTargetsRelative).toBe(true);
      const clothing = character.clothingSlots.legs.mesh!;
      const source: number[] = clothing.geometry.userData.sourceVertices;
      const offset: number = clothing.geometry.userData.surfaceOffset;
      const body = character.skinnedMesh.geometry.attributes;
      let error = 0;
      source.forEach((j, i) => {
        const expected = new THREE.Vector3().fromBufferAttribute(body.position, j)
          .addScaledVector(new THREE.Vector3().fromBufferAttribute(body.normal, j), offset);
        error = Math.max(error, expected.distanceTo(new THREE.Vector3().fromBufferAttribute(clothing.geometry.attributes.position, i)));
      });
      expect(error).toBeLessThan(3e-7);
      for (const bad of [0, NaN, Infinity, 0.3, 2.01]) expect(() => character.setHeight(bad)).toThrow(/Height/);
      expect(character.height).toBe(2);
      character.dispose();
    });
  });
});
