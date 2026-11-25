import * as THREE from "three";
import { createAnimationLayers } from "../animations/api/animation-layers.js";
import { createHumanoidAnimations } from "../animations/api/clips.js";
import { createEyeBehavior } from "../animations/api/eye-behavior.js";
import { DEFAULT_FACE_SLIDERS, type FaceSliders } from "../animations/api/face-sliders.js";
import { createFaceRig } from "../animations/api/face-rig.js";
import { createHandPoseLayer } from "../animations/api/hand-pose-layer.js";
import { createMaterialController } from "../materials/api/material-controller.js";
import { createProceduralMaterials } from "../materials/api/procedural-materials.js";
import { buildBaseBodyParts } from "../mesh/api/body/body-parts.js";
import { createTorsoController } from "../mesh/api/body/torso-controller.js";
import { createHeightShape, validateHeight } from "../mesh/api/body/height.js";
import { createClothingController } from "../mesh/api/clothing/clothing-controller.js";
import { createHeadEditing } from "../mesh/api/head/head-editing.js";
import { buildHeadAndFaceParts } from "../mesh/api/head/head-parts.js";
import { buildFacialMorphTargets } from "../mesh/api/head/morph-targets.js";
import { mergeCharacterParts } from "../mesh/api/merge.js";
import { createPhysicsDescriptor } from "../physics/api/capsules.js";
import { createReachIkLayer } from "../rigging/api/reach-ik-layer.js";
import { captureRestPose } from "../rigging/api/rest-pose.js";
import { createHumanoidSkeleton } from "../rigging/api/skeleton.js";
import { createTwistHelpers } from "../rigging/api/twist-helpers.js";
import type { CharacterOptions, CharacterUpdateOptions, ProceduralCharacter } from "./types.js";

/**
 * Builds the default adult male: procedural mesh, 86-bone rig, materials, clothing,
 * layered animation and facial control, assembled from the section controllers.
 */
export function createAdultMaleCharacter(options: CharacterOptions = {}): ProceduralCharacter {
  let height = validateHeight(options.height ?? 1);
  const rng = options.rng ?? Math.random;
  const rig = createHumanoidSkeleton();
  const palette = options.palette ?? {};
  const materials = createProceduralMaterials(palette, { createCanvas: options.createCanvas });

  // --- Mesh: sculpted body + designed head, merged into one skinned geometry with FACS morphs.
  const bodyParts = buildBaseBodyParts(rig);
  let skinnedMesh: THREE.SkinnedMesh;
  let clothing: ReturnType<typeof createClothingController>;
  const torso = createTorsoController(bodyParts[0].geo, options.torsoDetails, () => skinnedMesh, () => clothing.refit());
  const referenceRig = createHumanoidSkeleton();
  const referenceHead = buildHeadAndFaceParts(referenceRig, { transforms: {}, features: {}, strokes: [] });
  const referenceGeometry = mergeCharacterParts([...bodyParts, ...referenceHead], referenceRig);
  const headParts = buildHeadAndFaceParts(rig, options.headDesign);
  const rawParts = [...bodyParts, ...headParts];
  const merged = mergeCharacterParts(rawParts, rig);
  const headGroupIdx = rawParts.findIndex((p) => p.tag === "head");
  const cavGroupIdx = rawParts.findIndex((p) => p.tag === "cavity");
  buildFacialMorphTargets(merged, referenceRig, headGroupIdx, cavGroupIdx, referenceGeometry, headParts.design);

  skinnedMesh = new THREE.SkinnedMesh(merged, materials);
  skinnedMesh.name = "AdultMaleSkinnedMesh";
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.frustumCulled = false;
  skinnedMesh.updateMorphTargets();
  skinnedMesh.add(rig.bones[0]);
  skinnedMesh.bind(rig.skeleton);

  const root = new THREE.Group();
  root.name = "AdultMaleCharacterRoot";
  root.add(skinnedMesh);
  clothing = createClothingController(rig, skinnedMesh, bodyParts);
  root.add(clothing.root);
  clothing.setOutfit(options.outfit);

  const materialController = createMaterialController(skinnedMesh, palette, options.createCanvas, () => clothing.refreshMaterials());

  // --- Animation: clip layers, finger posing, rest pose (captured with relaxed hands), face and eyes.
  const clips = createHumanoidAnimations(rig);
  const faceSliders: FaceSliders = { ...DEFAULT_FACE_SLIDERS };
  const hands = createHandPoseLayer(rig);
  const restPose = captureRestPose(rig);
  const layers = createAnimationLayers(skinnedMesh, clips, rig, restPose);
  const faceRig = createFaceRig(rig, skinnedMesh, restPose, faceSliders);
  const eyes = createEyeBehavior(rig, faceSliders, layers.triggerBlink, rng);
  const reachIk = createReachIkLayer(rig, root);
  const twistHelpers = createTwistHelpers(rig);

  const head = createHeadEditing({
    rig, skinnedMesh, characterRoot: root, bodyParts, restPose, clips,
    reference: { rig: referenceRig, geometry: referenceGeometry, headGroupIdx, cavGroupIdx },
    initialDesign: headParts.design,
    copyBodySurface: torso.copyBodySurface,
    onRebound: () => { clothing.rebind(); clothing.updateCoverage(); },
    suspendFaceAnimation: layers.suspendFace,
  });

  merged.computeBoundingBox();
  const defaultHeight = merged.boundingBox!.max.y - merged.boundingBox!.min.y;
  const captureSurface = () => ({
    position: skinnedMesh.geometry.attributes.position.array.slice(),
    normal: skinnedMesh.geometry.attributes.normal.array.slice(),
    skinIndex: skinnedMesh.geometry.attributes.skinIndex.array.slice(),
    skinWeight: skinnedMesh.geometry.attributes.skinWeight.array.slice(),
  });
  let neutralSurface = captureSurface();
  const neutralPositions = new Map(rig.bones.map((bone) => [bone.name, restPose.position.get(bone.name).clone()]));
  const neutralWorld = new Map(rig.bones.map((bone) => [bone.name, rig.worldRest.get(bone.name).clone()]));
  const positionTracks = Object.values(clips).flatMap((clip) => clip.tracks.filter((track) => track.name.endsWith(".position")));
  const neutralTracks = new Map(positionTracks.map((track) => [track, track.values.slice()]));
  const physicsDescriptor = createPhysicsDescriptor(rig);

  function restoreNeutral() {
    for (const [name, values] of Object.entries(neutralSurface)) {
      skinnedMesh.geometry.attributes[name].array.set(values);
      skinnedMesh.geometry.attributes[name].needsUpdate = true;
    }
    for (const bone of rig.bones) {
      restPose.position.get(bone.name).copy(neutralPositions.get(bone.name)!);
      rig.worldRest.get(bone.name).copy(neutralWorld.get(bone.name)!);
    }
    for (const track of positionTracks) track.values.set(neutralTracks.get(track)!);
    restPose.reset();
  }

  function applyHeight() {
    const shape = createHeightShape(rig, bodyParts, defaultHeight, height);
    shape.geometry(skinnedMesh.geometry);
    const world = new Map(rig.bones.map((bone) => [bone.name, shape.bonePosition(bone)]));
    for (const bone of rig.bones) {
      const local = world.get(bone.name)!.clone();
      if (bone.parent instanceof THREE.Bone) local.sub(world.get(bone.parent.name)!);
      restPose.position.get(bone.name).copy(local);
      rig.worldRest.get(bone.name).copy(world.get(bone.name)!);
      bone.position.copy(local);
      bone.quaternion.identity();
    }
    for (const track of positionTracks) {
      const name = track.name.slice(0, -9);
      const old = neutralPositions.get(name);
      if (!old) continue;
      const next = restPose.position.get(name);
      const values = neutralTracks.get(track)!;
      const scale = name === "Hips" ? shape.lengthScale : 1;
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = next.x + (values[i] - old.x) * scale;
        track.values[i + 1] = next.y + (values[i + 1] - old.y) * scale;
        track.values[i + 2] = next.z + (values[i + 2] - old.z) * scale;
      }
    }
    root.updateMatrixWorld(true);
    skinnedMesh.bind(rig.skeleton);
    const bounds: { boundingBox: THREE.Box3 | null; boundingSphere: THREE.Sphere | null } = skinnedMesh;
    bounds.boundingBox = bounds.boundingSphere = null;
    clothing.refit();
    clothing.rebind();
    const defaults = createPhysicsDescriptor(rig);
    for (const key of ["standingCapsule", "crouchingCapsule", "sittingCapsule"] as const) {
      const capsule = physicsDescriptor[key], base = defaults[key];
      const total = (base.halfHeight + base.radius) * 2 * height;
      capsule.radius = Math.min(base.radius, total / 2);
      capsule.halfHeight = Math.max(0, total / 2 - capsule.radius);
      capsule.centerOffsetY = total / 2;
    }
    physicsDescriptor.eyeHeight = rig.worldRest.get("Eye_L").y;
    restPose.reset();
    root.updateMatrixWorld(true);
  }

  function editNeutral(edit: () => void) {
    const resume = layers.suspendBody();
    restoreNeutral();
    try {
      edit();
      neutralSurface = captureSurface();
      for (const bone of rig.bones) {
        neutralPositions.get(bone.name)!.copy(restPose.position.get(bone.name));
        neutralWorld.get(bone.name)!.copy(rig.worldRest.get(bone.name));
      }
      for (const track of positionTracks) neutralTracks.set(track, track.values.slice());
    } finally {
      applyHeight();
      resume();
    }
  }

  function setHeight(next: number) {
    validateHeight(next);
    if (next === height) return;
    editNeutral(() => { height = next; });
  }

  function createHeadPreview(design: Parameters<typeof head.createHeadPreview>[0]) {
    const preview = head.createHeadPreview(design);
    const shape = createHeightShape(preview.rig, bodyParts, defaultHeight, height);
    shape.geometry(preview.geometry);
    // Sculpt strokes stay in canonical head coordinates; the preview mesh supplies the translation.
    if (height !== 1) {
      preview.geometry.translate(0, -shape.shift, 0);
      const offsets = preview.geometry.attributes.heightOffset;
      for (let i = 0; i < offsets.count; i++) offsets.setY(i, offsets.getY(i) - shape.shift);
    }
    preview.geometry.userData.heightOffsetY = shape.shift;
    return preview;
  }
  function commitHeadPreview(preview: ReturnType<typeof head.createHeadPreview>) {
    editNeutral(() => head.commitHeadPreview(preview));
  }

  if (height !== 1) {
    const resume = layers.suspendBody();
    applyHeight();
    resume();
  }

  function update(dt: number, opts: CharacterUpdateOptions = {}) {
    // 0. Reset EVERY bone to its rest pose before the mixers run. Procedural offsets
    //    (gaze on Neck/Head, IK lean on Chest/Clavicle) are multiplied on top each frame;
    //    without this reset they accumulated forever on bones no clip animates (the spinning head).
    restPose.reset();
    if (opts.headEditor) {
      skinnedMesh.morphTargetInfluences?.fill(0);
      root.updateMatrixWorld(true);
      return;
    }
    layers.updateBase(dt);                                                 // 1. base locomotion
    const upperBlend = layers.updateUpper(dt);                             // 2. upper-body overlay
    reachIk.update(dt, layers.state.upper === "reaching", opts.reachTarget); // 3. reach IK
    hands.update(dt, upperBlend);
    twistHelpers.update();
    eyes.updateGaze(dt, !!opts.autoGaze, !!opts.autoBlink);               // 4. gaze + head follow
    eyes.updateBlink(dt, !!opts.autoBlink);                                // 5. blinks, face layer, sliders
    faceRig.resetToRest();
    layers.updateFace(dt);
    const gaze = eyes.gaze;
    faceRig.applySliders(gaze.x, gaze.y);
  }

  let disposed = false;
  /** Frees all GPU and CPU resources and detaches the character from its parent. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    layers.dispose();
    clothing.dispose();
    materialController.dispose();
    skinnedMesh.geometry.dispose();
    referenceGeometry.dispose();
    for (const part of [...bodyParts, ...referenceHead, ...headParts]) part.geo.dispose();
    rig.skeleton.dispose();
    referenceRig.skeleton.dispose();
    root.removeFromParent();
  }

  return {
    get height() { return height; },
    setHeight,
    dispose,
    root, skinnedMesh, rig, clips, bodyParts,
    clothingRoot: clothing.root, clothingSlots: clothing.slots,
    mixers: layers.mixers,
    faceSliders,
    physicsDescriptor,
    setBaseAnimation: layers.setBaseAnimation,
    setUpperAnimation: layers.setUpperAnimation,
    setFaceExpression: layers.setFaceExpression,
    triggerBlink: layers.triggerBlink,
    update,
    get animationState() { return layers.state; },
    setHandGesture: hands.setHandGesture,
    get handGestures() { return hands.gestures; },
    get headDesign() { return head.design; },
    createHeadPreview,
    commitHeadPreview,
    setClothing: (slot, item) => { clothing.setClothing(slot, item); clothing.refit(); },
    setOutfit: (outfit) => { clothing.setOutfit(outfit); clothing.refit(); },
    refreshClothingMaterials: clothing.refreshMaterials,
    get palette() { return materialController.palette; },
    setPalette: materialController.setPalette,
    get torsoDetails() { return torso.details; },
    setTorsoDetails: (changes) => editNeutral(() => torso.setTorsoDetails(changes)),
    resetTorsoDetails: () => editNeutral(torso.resetTorsoDetails),
  };
}
