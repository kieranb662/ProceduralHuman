import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAdultMaleCharacter, createHeadSculptSession } from "../src/index.js";
import { stubCanvas } from "./helpers/stub-canvas.js";

describe("head sculpt session (headless)", () => {
  it.each([0.5, 1, 1.6, 2])("preserves every body part when leaving the head editor at height %s", (height) => {
    const character = createAdultMaleCharacter({ createCanvas: stubCanvas });
    const bodyCount = character.bodyParts.reduce((count, part) => count + part.geo.attributes.position.count, 0);
    const bodyPositions = () => character.skinnedMesh.geometry.attributes.position.array.slice(0, bodyCount * 3);
    const canonical = bodyPositions();
    character.setHeight(height);
    const before = bodyPositions();
    const session = createHeadSculptSession(character);

    for (const edit of [false, true]) {
      session.begin();
      if (edit) {
        session.setFeature("cheeks", 3);
        session.rebuildPreview();
      }
      session.end();
      const after = bodyPositions();
      let error = 0;
      for (let i = 0; i < before.length; i++) error = Math.max(error, Math.abs(after[i] - before[i]));
      expect(error).toBeLessThan(1e-6);
    }

    expect(character.headDesign.features.cheeks).toBe(3);
    character.setHeight(1);
    expect(bodyPositions()).toEqual(canonical);
    character.dispose();
  });

  it("previews, undoes, redoes and commits ear size and placement", () => {
    const character = createAdultMaleCharacter({ createCanvas: stubCanvas });
    const session = createHeadSculptSession(character);
    session.begin();
    const before = Array.from(session.previewMesh!.geometry.attributes.position.array);
    session.remember();
    session.setEarAdjustment("size", 1.2);
    session.setEarAdjustment("verticalOffset", -5);
    session.setEarAdjustment("depthOffset", 4);
    session.setEarAdjustment("facingAngle", 60);
    session.rebuildPreview();
    const changed = Array.from(session.previewMesh!.geometry.attributes.position.array);
    expect(changed).not.toEqual(before);
    session.undo();
    expect(session.design.ears).toBeUndefined();
    expect(Array.from(session.previewMesh!.geometry.attributes.position.array)).toEqual(before);
    session.redo();
    expect(Array.from(session.previewMesh!.geometry.attributes.position.array)).toEqual(changed);
    session.end();
    expect(character.headDesign.ears).toEqual({ size: 1.2, verticalOffset: -5, depthOffset: 4, facingAngle: 60 });
    const earDepth = -0.004 + 1.2 * (0.012 * (1 - Math.cos(Math.PI / 3)) - 0.002 * Math.sin(Math.PI / 3));
    expect(character.rig.worldRest.get("Ear_L").z).toBeCloseTo(earDepth);
    expect(character.rig.worldRest.get("Ear_R").z).toBeCloseTo(earDepth);
    expect(character.rig.worldRest.get("Ear_L").y).toBeCloseTo(1.651);
    character.setHeight(2);
    character.setHeight(1);
    expect(character.headDesign.ears).toEqual({ size: 1.2, verticalOffset: -5, depthOffset: 4, facingAngle: 60 });
    expect(character.rig.worldRest.get("Ear_L").y).toBeCloseTo(1.651);

    const mesh = character.skinnedMesh;
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    let earVertex = 0;
    while (earVertex < indices.count &&
      (indices.getX(earVertex) !== character.rig.boneIndex.get("Ear_L") || weights.getX(earVertex) < 0.95)) earVertex++;
    expect(earVertex).toBeLessThan(indices.count);
    let attachmentVertex = 0;
    while (attachmentVertex < indices.count &&
      (indices.getX(attachmentVertex) !== character.rig.boneIndex.get("Ear_L") || weights.getX(attachmentVertex) !== 0)) attachmentVertex++;
    expect(attachmentVertex).toBeLessThan(indices.count);
    const deformedVertex = (vertex = earVertex) => {
      character.root.updateMatrixWorld(true);
      mesh.skeleton.update();
      return mesh.getVertexPosition(vertex, new THREE.Vector3());
    };
    character.update(0);
    const rest = deformedVertex(), attachmentRest = deformedVertex(attachmentVertex);
    for (const wiggle of [-1, 1]) {
      character.faceSliders.ears = wiggle;
      character.update(0);
      expect(deformedVertex().distanceTo(rest)).toBeGreaterThan(0.0001);
      expect(deformedVertex(attachmentVertex).distanceTo(attachmentRest)).toBeLessThan(1e-6);
    }
    character.dispose();
  });

  it("previews, undoes, redoes and commits attached earlobes", () => {
    const character = createAdultMaleCharacter({ createCanvas: stubCanvas });
    const session = createHeadSculptSession(character);
    session.begin();
    const positions = () => Array.from(session.previewMesh!.geometry.attributes.position.array);
    const originalPositions = positions();
    session.remember();
    session.setAttachedEarlobes(true);
    session.rebuildPreview();
    const attachedPositions = positions();
    expect(attachedPositions).not.toEqual(originalPositions);
    session.undo();
    expect(positions()).toEqual(originalPositions);
    session.redo();
    expect(positions()).toEqual(attachedPositions);
    session.end();
    expect(character.headDesign.attachedEarlobes).toBe(true);
    character.dispose();
  });

  it.each([1, 1 / 2, 2])("picks, strokes, undoes and commits at height %s", (height) => {
    const character = createAdultMaleCharacter({ createCanvas: stubCanvas, height });
    const session = createHeadSculptSession(character);
    session.begin();
    expect(session.active).toBe(true);
    expect(character.skinnedMesh.visible).toBe(false);

    // Aim at the left cheek from in front of the face.
    const headOffset = character.rig.worldRest.get("Head").y - 1.56;
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0.045, 1.64 + headOffset, 1), new THREE.Vector3(0, 0, -1));
    const hit = session.pick(raycaster, "skin");
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(1.64);
    expect(session.pick(raycaster, "teeth")).toBeNull();

    session.beginStroke({ target: "skin", mode: "raise", radius: 0.015, strength: 0.4, mirror: true }, hit!, new THREE.Vector3(0, 0, -1));
    expect(session.strokeTo(raycaster, false, true)).toBe(true);
    expect(session.endStroke()).toBe(true);
    expect(session.design.strokes).toHaveLength(1);
    expect(session.canUndo).toBe(true);

    session.undo();
    expect(session.design.strokes).toHaveLength(0);
    session.redo();
    session.setTransform("ears", "sx", 1.2);
    session.end();

    expect(character.skinnedMesh.visible).toBe(true);
    expect(character.headDesign.strokes).toHaveLength(1);
    expect(character.headDesign.transforms.ears).toEqual({ sx: 1.2 });
    expect(character.skinnedMesh.geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
    expect(character.height).toBe(height);
    character.dispose();
  });
});
