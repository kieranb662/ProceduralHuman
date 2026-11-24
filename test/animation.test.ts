import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAdultMaleCharacter, createParkMillerRng } from "../src/index.js";
import { stubCanvas } from "./helpers/stub-canvas.js";

const r6 = (n: number) => Math.round(n * 1e6) / 1e6 || 0;

/** Every bone's local transform plus the morph weights, rounded for stable snapshots. */
function poseSignature(character: ReturnType<typeof createAdultMaleCharacter>) {
  return {
    bones: Object.fromEntries(character.rig.bones.map((b) => [b.name, [...b.position.toArray(), ...b.quaternion.toArray()].map(r6)])),
    morphs: [...character.skinnedMesh.morphTargetInfluences!].map(r6),
  };
}

describe("animation behaviour", () => {
  it("is deterministic for a seeded rng and matches the recorded layered pose", () => {
    const run = () => {
      const character = createAdultMaleCharacter({ createCanvas: stubCanvas, rng: createParkMillerRng(7) });
      const reachTarget = new THREE.Vector3(-0.24, 1.34, 0.48);
      const frames: ReturnType<typeof poseSignature>[] = [];
      const step = (n: number, opts: object) => { for (let i = 0; i < n; i++) character.update(1 / 60, { autoBlink: true, autoGaze: true, ...opts }); };
      character.setBaseAnimation("walking");
      character.setFaceExpression("smiling");
      character.setHandGesture("point", "L");
      step(40, {}); frames.push(poseSignature(character));
      character.setUpperAnimation("waving");
      step(40, {}); frames.push(poseSignature(character));
      character.setUpperAnimation("reaching");
      Object.assign(character.faceSliders, { jaw: 0.4, eyeX: 0.3, tongueOut: 0.5, ears: -0.4 });
      step(40, { reachTarget }); frames.push(poseSignature(character));
      character.setBaseAnimation("crouching");
      character.setUpperAnimation("holding");
      character.setFaceExpression("neutral");
      step(40, {}); frames.push(poseSignature(character));
      return frames;
    };
    const frames = run();
    expect(run()).toEqual(frames);
    expect(frames).toMatchSnapshot();
  });
});
