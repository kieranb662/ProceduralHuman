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
 * Builds the default adult male: procedural mesh, 84-bone rig, materials, clothing,
 * layered animation and facial control, assembled from the section controllers.
 */
export function createAdultMaleCharacter(options: CharacterOptions = {}): ProceduralCharacter {
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

  function update(dt: number, opts: CharacterUpdateOptions = {}) {
    // 0. Reset EVERY bone to its rest pose before the mixers run. Procedural offsets
    //    (gaze on Neck/Head, IK lean on Chest/Clavicle) are multiplied on top each frame;
    //    without this reset they accumulated forever on bones no clip animates (the spinning head).
    restPose.reset();
    if (opts.headEditor) {
      skinnedMesh.morphTargetInfluences.fill(0);
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

  return {
    root, skinnedMesh, rig, clips, bodyParts,
    clothingRoot: clothing.root, clothingSlots: clothing.slots,
    mixers: layers.mixers,
    faceSliders,
    physicsDescriptor: createPhysicsDescriptor(rig),
    setBaseAnimation: layers.setBaseAnimation,
    setUpperAnimation: layers.setUpperAnimation,
    setFaceExpression: layers.setFaceExpression,
    triggerBlink: layers.triggerBlink,
    update,
    get animationState() { return layers.state; },
    setHandGesture: hands.setHandGesture,
    get handGestures() { return hands.gestures; },
    get headDesign() { return head.design; },
    createHeadPreview: head.createHeadPreview,
    commitHeadPreview: head.commitHeadPreview,
    setClothing: clothing.setClothing,
    setOutfit: clothing.setOutfit,
    refreshClothingMaterials: clothing.refreshMaterials,
    get palette() { return materialController.palette; },
    setPalette: materialController.setPalette,
    get torsoDetails() { return torso.details; },
    setTorsoDetails: torso.setTorsoDetails,
    resetTorsoDetails: torso.resetTorsoDetails,
  };
}
