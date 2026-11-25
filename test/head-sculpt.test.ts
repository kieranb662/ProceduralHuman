import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAdultMaleCharacter, createHeadSculptSession } from "../src/index.js";
import { stubCanvas } from "./helpers/stub-canvas.js";

describe("head sculpt session (headless)", () => {
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
