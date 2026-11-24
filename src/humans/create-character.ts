import * as THREE from "three";
import { createHumanoidAnimations } from "../animations/api/clips.js";
import { HAND_GESTURES, handPoseQuaternions } from "../animations/api/hand-gestures.js";
import { createProceduralMaterials } from "../materials/api/procedural-materials.js";
import { DEFAULT_PALETTE_COLORS, disposeMaterials, readMaterialSurfaces, type Palette } from "../materials/api/palette.js";
import { resolveTextureSettings } from "../textures/api/settings.js";
import { buildBaseBodyParts } from "../mesh/api/body/body-parts.js";
import { configureTorsoDetails, sculptTorso } from "../mesh/api/body/torso.js";
import { buildClothingGeometry, fitClothingToBody } from "../mesh/api/clothing/build.js";
import { CLOTHING_ITEMS } from "../mesh/api/clothing/items.js";
import { buildHeadAndFaceParts } from "../mesh/api/head/head-parts.js";
import { buildFacialMorphTargets } from "../mesh/api/head/morph-targets.js";
import { mergeCharacterParts, restoreNeckJoinNormals } from "../mesh/api/merge.js";
import { FACIAL_BONES, RIGHT_ARM_BONES } from "../rigging/api/bone-names.js";
import { solveRightArmReachIK } from "../rigging/api/ik.js";
import { createHumanoidSkeleton } from "../rigging/api/skeleton.js";
import { createPhysicsDescriptor } from "../physics/api/capsules.js";
import { BASE_ANIMATIONS, FACE_EXPRESSIONS, UPPER_ANIMATIONS } from "../animations/api/names.js";
import type { BaseAnimation, FaceExpression, FaceExpressionClip, UpperAnimation, UpperAnimationClip } from "../animations/api/names.js";
import type { HandGesture } from "../animations/api/hand-gestures.js";
import type { ClothingSlot } from "../mesh/api/clothing/items.js";
import { DEFAULT_FACE_SLIDERS, type FaceSliders } from "../animations/api/face-sliders.js";
import type { CharacterOptions, ClothingSlotState, CharacterUpdateOptions, HeadPreview, ProceduralCharacter } from "./types.js";

// --- 5. Master Factory: createAdultMaleCharacter(options) ---
export function createAdultMaleCharacter(options: CharacterOptions = {}): ProceduralCharacter {
  const rig = createHumanoidSkeleton();
  const createCanvas = options.createCanvas;
  let palette: Palette = options.palette ?? {};
  const materials = createProceduralMaterials(palette, { createCanvas });

  const bodyParts = buildBaseBodyParts(rig);
  const bodyGeo = bodyParts[0].geo;
  const neutralBody = bodyGeo.attributes.position.array.slice();
  let torsoDetails = configureTorsoDetails(null, options.torsoDetails);
  sculptTorso(bodyGeo, neutralBody, torsoDetails);
  const referenceRig = createHumanoidSkeleton();
  const referenceHead = buildHeadAndFaceParts(referenceRig, { transforms: {}, features: {}, strokes: [] });
  const referenceGeometry = mergeCharacterParts([...bodyParts, ...referenceHead], referenceRig);
  const headParts = buildHeadAndFaceParts(rig, options.headDesign);
  const rawParts = [...bodyParts, ...headParts];
  const merged = mergeCharacterParts(rawParts, rig);
  const headGroupIdx = rawParts.findIndex((p) => p.tag === "head");
  const cavGroupIdx = rawParts.findIndex((p) => p.tag === "cavity");

  buildFacialMorphTargets(merged, referenceRig, headGroupIdx, cavGroupIdx, referenceGeometry, headParts.design);
  let headDesign = structuredClone(headParts.design);

  const skinnedMesh = new THREE.SkinnedMesh(merged, materials);
  skinnedMesh.name = "AdultMaleSkinnedMesh";
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.frustumCulled = false;
  skinnedMesh.updateMorphTargets();

  const rootBone = rig.bones[0];
  skinnedMesh.add(rootBone);
  skinnedMesh.bind(rig.skeleton);

  const root = new THREE.Group();
  root.name = "AdultMaleCharacterRoot";
  root.add(skinnedMesh);
  const clothingRoot = new THREE.Group();
  clothingRoot.name = "ClothingSlots";
  root.add(clothingRoot);
  const clothingSlots = Object.fromEntries(Object.entries(CLOTHING_ITEMS).map(([name, items]) =>
    [name, { items: { ...items }, item: "none", mesh: null }])) as unknown as Record<ClothingSlot, ClothingSlotState>;
  function copyBodySurface(geometry) {
    for (const name of ["position", "normal"]) {
      geometry.attributes[name].array.set(bodyGeo.attributes[name].array);
      geometry.attributes[name].needsUpdate = true;
    }
    restoreNeckJoinNormals(geometry);
    geometry.boundingBox = geometry.boundingSphere = null;
  }
  function applyTorsoDetails(next) {
    sculptTorso(bodyGeo, neutralBody, next);
    torsoDetails = next;
    copyBodySurface(skinnedMesh.geometry);
    skinnedMesh.boundingBox = skinnedMesh.boundingSphere = null;
    for (const slot of Object.values(clothingSlots)) {
      if (slot.mesh) {
        fitClothingToBody(slot.mesh.geometry, skinnedMesh.geometry);
        slot.mesh.boundingBox = slot.mesh.boundingSphere = null;
      }
    }
  }
  function setTorsoDetails(changes) {
    applyTorsoDetails(configureTorsoDetails(torsoDetails, changes));
  }
  function resetTorsoDetails() {
    applyTorsoDetails(configureTorsoDetails());
  }
  const baseBodyIndices = merged.index.array.slice(0, bodyParts.reduce((sum, part) => sum + part.geo.index.count, 0));
  const updateClothingCoverage = () => {
    const index = skinnedMesh.geometry.index;
    index.array.set(baseBodyIndices);
    for (const slot of Object.values(clothingSlots)) {
      if (!slot.mesh) continue;
      for (const j of slot.mesh.geometry.userData.coveredTriangles) {
        // Degenerate only covered triangles, preserving group offsets and facial morph topology.
        index.array[j + 1] = index.array[j + 2] = index.array[j];
      }
    }
    index.needsUpdate = true;
  };
  const validateClothing = (slot, item) => {
    if (!Object.hasOwn(CLOTHING_ITEMS, slot) || !Object.hasOwn(CLOTHING_ITEMS[slot], item)) {
      throw new Error(`Unknown clothing item ${slot}: ${item}.`);
    }
  };
  function setClothing(slotName, item) {
    validateClothing(slotName, item);
    const slot = clothingSlots[slotName];
    if (slot.item === item) return;
    let mesh = null;
    if (item !== "none") {
      const geo = buildClothingGeometry(bodyParts, slotName, item);
      const materialIndex = slotName === "legs" ? 2 : slotName === "feet" ? 7 : 1;
      geo.userData.materialIndex = materialIndex;
      mesh = new THREE.SkinnedMesh(geo, skinnedMesh.material[materialIndex]);
      mesh.name = `Clothing_${slotName}_${item}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      // Never recalculate inverses in an animated pose: every garment uses the original bind matrix.
      mesh.bind(rig.skeleton, skinnedMesh.bindMatrix);
    }
    if (slot.mesh) {
      clothingRoot.remove(slot.mesh);
      slot.mesh.geometry.dispose();
    }
    slot.mesh = mesh;
    slot.item = item;
    if (mesh) clothingRoot.add(mesh);
    updateClothingCoverage();
  }
  function setOutfit(outfit = {}) {
    for (const [slot, item] of Object.entries(outfit)) validateClothing(slot, item);
    for (const slot of Object.keys(clothingSlots)) setClothing(slot, outfit[slot] ?? "none");
  }
  function setPalette(next: Palette) {
    const nextMaterials = createProceduralMaterials(next, { createCanvas });
    const previousMaterials = skinnedMesh.material as THREE.Material[];
    skinnedMesh.material = nextMaterials;
    refreshClothingMaterials();
    disposeMaterials(previousMaterials);
    palette = structuredClone(next);
  }
  function currentPalette(): Required<Palette> {
    return {
      skin: palette.skin ?? DEFAULT_PALETTE_COLORS.skin,
      shirt: palette.shirt ?? DEFAULT_PALETTE_COLORS.shirt,
      shorts: palette.shorts ?? DEFAULT_PALETTE_COLORS.shorts,
      hair: palette.hair ?? DEFAULT_PALETTE_COLORS.hair,
      textures: resolveTextureSettings(palette.textures),
      materials: readMaterialSurfaces(skinnedMesh.material as THREE.Material[]),
    };
  }
  function refreshClothingMaterials() {
    for (const slot of Object.values(clothingSlots)) {
      if (slot.mesh) slot.mesh.material = skinnedMesh.material[slot.mesh.geometry.userData.materialIndex];
    }
  }
  setOutfit(options.outfit);

  const clips = createHumanoidAnimations(rig);

  const baseMixer = new THREE.AnimationMixer(skinnedMesh);
  const upperMixer = new THREE.AnimationMixer(skinnedMesh);
  const faceMixer = new THREE.AnimationMixer(skinnedMesh);

  const baseNames = BASE_ANIMATIONS;
  const upperNames = UPPER_ANIMATIONS;
  const faceNames = FACE_EXPRESSIONS;

  const baseActions = {} as Record<BaseAnimation, THREE.AnimationAction>;
  const upperActions = {} as Record<UpperAnimationClip, THREE.AnimationAction>;
  const faceActions = {} as Record<FaceExpressionClip, THREE.AnimationAction>;
  const upperSamples = Object.fromEntries(upperNames.map((name) => [name,
    clips[name].tracks.filter((track) => track instanceof THREE.QuaternionKeyframeTrack).map((track) => ({
      bone: track.name.slice(0, track.name.indexOf(".")), // createInterpolant() exists at runtime but is missing from @types/three.
      interpolant: (track as any).createInterpolant(),
    }))]));

  for (const n of baseNames) baseActions[n] = baseMixer.clipAction(clips[n]);
  for (const n of upperNames) upperActions[n] = upperMixer.clipAction(clips[n]);
  for (const n of faceNames) faceActions[n] = faceMixer.clipAction(clips[n]);
  faceActions.blinking.setLoop(THREE.LoopOnce, 1);

  let activeBase: BaseAnimation = "idle";
  let activeUpper: UpperAnimation = "none";
  let activeUpperClip: UpperAnimationClip | null = null;
  let activeFace: FaceExpression = "neutral";
  baseActions.idle.play();

  let upperBlend = 0;
  let reachBlend = 0;

  const faceSliders: FaceSliders = { ...DEFAULT_FACE_SLIDERS };

  const gazeState = {
    targetX: 0, targetY: 0, currentX: 0, currentY: 0,
    headYaw: 0, headPitch: 0, saccadeTimer: 1.2,
  };

  const handGestures: { L: HandGesture; R: HandGesture } = { L: "auto", R: "auto" };
  const currentHandQuats = new Map();
  const openThumbQuats = { L: handPoseQuaternions("L", HAND_GESTURES.open), R: handPoseQuaternions("R", HAND_GESTURES.open) };
  for (const side of ["L", "R"]) {
    for (const [name, q] of handPoseQuaternions(side, HAND_GESTURES.relaxed)) {
      rig.boneMap.get(name).quaternion.copy(q);
      currentHandQuats.set(name, q.clone());
    }
  }
  function setHandGesture(name, side = "both") {
    if (name !== "auto" && !Object.hasOwn(HAND_GESTURES, name)) throw new Error(`Unknown hand gesture: ${name}.`);
    if (!["both", "L", "R"].includes(side)) throw new Error(`Unknown hand side: ${side}.`);
    for (const key of side === "both" ? ["L", "R"] : [side]) handGestures[key] = name;
  }

  const restLocalPos = new Map();
  const restLocalQuat = new Map();
  for (const b of rig.bones) {
    restLocalPos.set(b.name, b.position.clone());
    restLocalQuat.set(b.name, b.quaternion.clone());
  }

  function createHeadPreview(design): HeadPreview {
    const previewRig = createHumanoidSkeleton();
    const parts = buildHeadAndFaceParts(previewRig, design);
    const geometry = mergeCharacterParts([...bodyParts, ...parts], previewRig);
    let offset = bodyParts.reduce((sum, part) => sum + part.geo.attributes.position.count, 0);
    const ranges = parts.map((part, i) => {
      const group = geometry.groups[bodyParts.length + i];
      const range = { part, offset, indexStart: group.start, indexCount: group.count };
      offset += part.geo.attributes.position.count;
      return range;
    });
    return { rig: previewRig, parts, geometry, ranges };
  }

  function commitHeadPreview(preview) {
    const geometry = preview.geometry.clone();
    copyBodySurface(geometry);
    buildFacialMorphTargets(geometry, referenceRig, headGroupIdx, cavGroupIdx, referenceGeometry, preview.parts.design);
    const deltas = new Map();
    for (const bone of rig.bones) {
      deltas.set(bone.name, preview.rig.boneMap.get(bone.name).position.clone().sub(restLocalPos.get(bone.name)));
    }
    const retargetFace = FACIAL_BONES.some((name) => deltas.get(name).lengthSq() > 1e-16);
    const faceTimes: Partial<Record<FaceExpressionClip, number>> = {};
    const resumeBlink = faceActions.blinking.isScheduled();
    if (retargetFace) {
      for (const name of faceNames) faceTimes[name] = faceActions[name].time;
      faceMixer.stopAllAction();
      faceMixer.uncacheRoot(skinnedMesh);
    }
    for (const bone of rig.bones) {
      const next = preview.rig.boneMap.get(bone.name).position;
      restLocalPos.get(bone.name).copy(next);
      rig.worldRest.get(bone.name).copy(preview.rig.worldRest.get(bone.name));
      bone.position.copy(next);
      bone.quaternion.identity();
    }
    // Position tracks contain absolute rest coordinates; keep their offsets after moving a facial anchor.
    for (const clip of Object.values(clips)) for (const track of clip.tracks) {
      if (!track.name.endsWith(".position")) continue;
      const delta = deltas.get(track.name.slice(0, -9));
      if (!delta) continue;
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] += delta.x; track.values[i + 1] += delta.y; track.values[i + 2] += delta.z;
      }
    }
    const previous = skinnedMesh.geometry;
    skinnedMesh.geometry = geometry;
    const influences = skinnedMesh.morphTargetInfluences;
    skinnedMesh.updateMorphTargets();
    influences.fill(0);
    skinnedMesh.morphTargetInfluences = influences;
    root.updateMatrixWorld(true);
    skinnedMesh.bind(rig.skeleton);
    for (const slot of Object.values(clothingSlots)) {
      if (slot.mesh) slot.mesh.bind(rig.skeleton, skinnedMesh.bindMatrix);
    }
    updateClothingCoverage();
    for (const bone of rig.bones) bone.quaternion.copy(restLocalQuat.get(bone.name));
    // Rebinding also refreshes the mixer's saved original pose used during expression fade-outs.
    if (retargetFace) {
      for (const name of faceNames) faceActions[name] = faceMixer.clipAction(clips[name]);
      faceActions.blinking.setLoop(THREE.LoopOnce, 1);
      for (const name of [activeFace, ...(resumeBlink ? ["blinking"] : [])]) {
        if (name === "neutral") continue;
        faceActions[name].reset().setEffectiveWeight(1).play();
        faceActions[name].time = faceTimes[name];
      }
    }
    previous.dispose();
    headDesign = structuredClone(preview.parts.design);
  }

  const baseArmQuats = new Map();
  const preIkQuats = new Map();
  const ikBlendBones = ["Chest", "Clavicle_R", "UpperArm_R", "Forearm_R", "Hand_R"];
  for (const name of RIGHT_ARM_BONES) baseArmQuats.set(name, new THREE.Quaternion());
  for (const name of ikBlendBones) preIkQuats.set(name, new THREE.Quaternion());
  const forearmTwistAxes = Object.fromEntries(["L", "R"].map((side) => [side,
    rig.worldRest.get(`Hand_${side}`).clone().sub(rig.worldRest.get(`Forearm_${side}`)).normalize()]));

  let blinkTimer = 2.4;

  function setBaseAnimation(name) {
    if (!baseActions[name] || name === activeBase) return;
    const prev = baseActions[activeBase];
    const next = baseActions[name];
    next.reset().setEffectiveWeight(1).play();
    prev.crossFadeTo(next, 0.25, false);
    activeBase = name;
  }

  function setUpperAnimation(name) {
    if (name === activeUpper) return;
    if (upperActions[name]) {
      if (activeUpperClip && activeUpperClip !== name && upperActions[activeUpperClip]) {
        const prev = upperActions[activeUpperClip];
        const next = upperActions[name];
        next.reset().setEffectiveWeight(1).play();
        prev.crossFadeTo(next, 0.2, false);
      } else {
        upperActions[name].reset().setEffectiveWeight(1).play();
      }
      activeUpperClip = name;
    }
    activeUpper = name;
  }

  function setFaceExpression(name) {
    if (name === activeFace) return;
    if (activeFace !== "neutral" && faceActions[activeFace]) {
      faceActions[activeFace].fadeOut(0.2);
    }
    activeFace = name;
    if (name !== "neutral" && faceActions[name]) {
      faceActions[name].reset().setEffectiveWeight(1).fadeIn(0.2).play();
    }
  }

  function triggerBlink() {
    faceActions.blinking.reset().setEffectiveWeight(1).play();
  }

  function resetFacialBonesToRest() {
    const bm = rig.boneMap;
    for (const name of FACIAL_BONES) {
      const b = bm.get(name);
      b.position.copy(restLocalPos.get(name));
      b.quaternion.copy(restLocalQuat.get(name));
    }
    if (skinnedMesh.morphTargetInfluences) {
      skinnedMesh.morphTargetInfluences.fill(0);
    }
  }

  function applyManualFacialOverrides() {
    const bm = rig.boneMap;
    const dict = skinnedMesh.morphTargetDictionary;
    const inf = skinnedMesh.morphTargetInfluences;
    const addMorph = (name, val) => {
      const idx = dict?.[name];
      if (idx !== undefined && inf) {
        inf[idx] = THREE.MathUtils.clamp(inf[idx] + val, 0, 1);
      }
    };
    const addRot = (name, rx, ry, rz) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
      bm.get(name).quaternion.multiply(q);
    };
    const addPos = (name, dx, dy, dz) => {
      const b = bm.get(name);
      b.position.x += dx;
      b.position.y += dy;
      b.position.z += dz;
    };

    if (faceSliders.jaw !== 0) addRot("Jaw", faceSliders.jaw * 0.42, 0, 0);
    const tongueOut = THREE.MathUtils.clamp(faceSliders.tongueOut, 0, 1);
    const tongueCurl = THREE.MathUtils.clamp(faceSliders.tongueCurl, -1, 1);
    if (tongueOut > 0 || tongueCurl !== 0) {
      const jaw = bm.get("Jaw");
      const opening = new THREE.Euler().setFromQuaternion(jaw.quaternion, "XYZ").x;
      const clearance = 0.26 * tongueOut;
      if (opening < clearance) addRot("Jaw", clearance - opening, 0, 0);
      addRot("TongueBase", -0.30 * tongueOut, 0, 0);
      addPos("TongueMid", 0, 0.003 * tongueOut, 0.020 * tongueOut);
      addPos("TongueTip", 0, 0, 0.028 * tongueOut);
      addRot("TongueMid", -0.30 * tongueCurl, 0, 0);
      addRot("TongueTip", -0.50 * tongueCurl, 0, 0);
    }
    if (faceSliders.smile !== 0) {
      addMorph("mouthSmile_L", faceSliders.smile);
      addMorph("mouthSmile_R", faceSliders.smile);
    }
    if (faceSliders.pucker !== 0) addMorph("mouthPucker", faceSliders.pucker);
    if (faceSliders.browUp !== 0) {
      addMorph("browInnerUp", faceSliders.browUp);
      addMorph("browOuterUp_L", faceSliders.browUp * 0.7);
      addMorph("browOuterUp_R", faceSliders.browUp * 0.7);
    }
    if (faceSliders.browDown !== 0) {
      addMorph("browDown_L", faceSliders.browDown);
      addMorph("browDown_R", faceSliders.browDown);
    }
    if (faceSliders.cheek !== 0) {
      addMorph("cheekSquint_L", faceSliders.cheek);
      addMorph("cheekSquint_R", faceSliders.cheek);
    }
    if (faceSliders.upperLip !== 0) {
      addPos("UpperLip_C", 0, faceSliders.upperLip * 0.008, faceSliders.upperLip * 0.004);
      addPos("UpperLip_L", 0, faceSliders.upperLip * 0.005, faceSliders.upperLip * 0.002);
      addPos("UpperLip_R", 0, faceSliders.upperLip * 0.005, faceSliders.upperLip * 0.002);
    }
    if (faceSliders.lowerLip !== 0) {
      addPos("LowerLip_C", 0, -faceSliders.lowerLip * 0.009, faceSliders.lowerLip * 0.005);
      addPos("LowerLip_L", 0, -faceSliders.lowerLip * 0.005, faceSliders.lowerLip * 0.002);
      addPos("LowerLip_R", 0, -faceSliders.lowerLip * 0.005, faceSliders.lowerLip * 0.002);
    }
    if (faceSliders.lidTop !== 0) {
      addRot("EyelidTop_L", faceSliders.lidTop * 0.72, 0, 0);
      addRot("EyelidTop_R", faceSliders.lidTop * 0.72, 0, 0);
    }
    if (faceSliders.lidBot !== 0) {
      addRot("EyelidBot_L", -faceSliders.lidBot * 0.34, 0, 0);
      addRot("EyelidBot_R", -faceSliders.lidBot * 0.34, 0, 0);
    }

    const totalEyeX = THREE.MathUtils.clamp(faceSliders.eyeX + gazeState.currentX, -1, 1);
    const totalEyeY = THREE.MathUtils.clamp(faceSliders.eyeY + gazeState.currentY, -1, 1);
    if (Math.abs(totalEyeX) > 1e-4 || Math.abs(totalEyeY) > 1e-4) {
      const ey = totalEyeX * 0.42;
      const ex = -totalEyeY * 0.30;
      bm.get("Eye_L").quaternion.setFromEuler(new THREE.Euler(ex, ey, 0, "YXZ"));
      bm.get("Eye_R").quaternion.setFromEuler(new THREE.Euler(ex, ey, 0, "YXZ"));
      addRot("EyelidTop_L", ex * 0.32, 0, 0);
      addRot("EyelidTop_R", ex * 0.32, 0, 0);
    }

    if (faceSliders.nose !== 0) {
      addPos("NoseTip", 0, faceSliders.nose * 0.005, -faceSliders.nose * 0.002);
      addPos("Nostril_L", faceSliders.nose * 0.004, faceSliders.nose * 0.004, 0.001);
      addPos("Nostril_R", -faceSliders.nose * 0.004, faceSliders.nose * 0.004, 0.001);
    }
    if (faceSliders.ears !== 0) {
      addRot("Ear_L", 0, -faceSliders.ears * 0.30, faceSliders.ears * 0.16);
      addRot("Ear_R", 0, faceSliders.ears * 0.30, -faceSliders.ears * 0.16);
    }
  }

  // Clamp a bone's yaw/pitch so procedural gaze can never exceed anatomical limits
  const limitBone = (b, max) => {
    const e = new THREE.Euler().setFromQuaternion(b.quaternion, "YXZ");
    e.y = THREE.MathUtils.clamp(e.y, -max, max);
    e.x = THREE.MathUtils.clamp(e.x, -max, max);
    b.quaternion.setFromEuler(e);
  };

  function update(dt: number, opts: CharacterUpdateOptions = {}) {
    const bm = rig.boneMap;

    // 0. Reset EVERY bone to its rest pose before the mixers run. Procedural offsets
    //    (gaze on Neck/Head, IK lean on Chest/Clavicle) are multiplied on top each frame;
    //    without this reset they accumulated forever on bones no clip animates (the spinning head).
    for (const b of rig.bones) {
      b.position.copy(restLocalPos.get(b.name));
      b.quaternion.copy(restLocalQuat.get(b.name));
    }
    if (opts.headEditor) {
      skinnedMesh.morphTargetInfluences.fill(0);
      root.updateMatrixWorld(true);
      return;
    }

    // 1. Base locomotion pass
    baseMixer.update(dt);

    // 2. Layered upper-body clip pass
    const targetUpper = (activeUpper === "waving" || activeUpper === "holding") ? 1 : 0;
    upperBlend = THREE.MathUtils.damp(upperBlend, targetUpper, 10, dt);

    if (upperBlend > 0.001 && activeUpperClip) {
      for (const name of RIGHT_ARM_BONES) {
        baseArmQuats.get(name).copy(bm.get(name).quaternion);
        bm.get(name).quaternion.copy(restLocalQuat.get(name));
      }
      upperMixer.update(dt);
      // PropertyMixer skips unchanged values, but our frame reset still needs
      // constant holding tracks. Sample the public tracks at each action's time.
      const sampled = new Map();
      for (const name of upperNames) {
        const action = upperActions[name], weight = action.getEffectiveWeight();
        if (!action.isRunning() || weight <= 0) continue;
        for (const sample of upperSamples[name]) {
          const q = new THREE.Quaternion().fromArray(sample.interpolant.evaluate(action.time));
          const prior = sampled.get(sample.bone);
          if (prior) {
            prior.q.slerp(q, weight / (prior.weight + weight));
            prior.weight += weight;
          } else sampled.set(sample.bone, { q, weight });
        }
      }
      for (const name of RIGHT_ARM_BONES) {
        const b = bm.get(name);
        const sample = sampled.get(name);
        const upperQ = restLocalQuat.get(name).clone();
        if (sample) upperQ.slerp(sample.q, Math.min(1, sample.weight));
        b.quaternion.copy(baseArmQuats.get(name)).slerp(upperQ, upperBlend);
      }
    } else if (upperBlend <= 0.001 && targetUpper === 0 && activeUpperClip) {
      upperMixer.stopAllAction();
      activeUpperClip = null;
    }

    // 3. Smoothly blended post-mixer 2-bone IK pass
    const targetReach = (activeUpper === "reaching" && opts.reachTarget) ? 1 : 0;
    reachBlend = THREE.MathUtils.damp(reachBlend, targetReach, 10, dt);

    if (reachBlend > 0.001 && opts.reachTarget) {
      for (const name of ikBlendBones) {
        preIkQuats.get(name).copy(bm.get(name).quaternion);
      }
      solveRightArmReachIK(rig, opts.reachTarget, root);
      if (reachBlend < 0.999) {
        for (const name of ikBlendBones) {
          const b = bm.get(name);
          const ikQ = b.quaternion.clone();
          b.quaternion.copy(preIkQuats.get(name)).slerp(ikQ, reachBlend);
        }
      }
    }

    for (const side of ["L", "R"]) {
      const gesture = handGestures[side];
      const overlay = gesture === "auto" && side === "R" && upperBlend > 0.001;
      const target = handPoseQuaternions(side, HAND_GESTURES[gesture === "auto" ? "relaxed" : gesture]);
      // While fingers are still travelling, the thumb moves clear (open-hand thumb) so curling or
      // uncurling fingers never sweep through it; it settles into its target once they arrive.
      let fingerError = 0;
      for (const [name, q] of target) if (!name.startsWith("Thumb")) fingerError = Math.max(fingerError, currentHandQuats.get(name).angleTo(q));
      const clearThumb = !overlay && fingerError > 0.3;
      const k = 1 - Math.exp(-14 * dt);
      for (const [name, q] of target) {
        const bone = bm.get(name), current = currentHandQuats.get(name);
        const goal = overlay ? bone.quaternion : clearThumb && name.startsWith("Thumb") ? openThumbQuats[side].get(name) : q;
        current.slerp(goal, k);
        bone.quaternion.copy(current);
      }
    }

    // Linear blend skinning collapses when one seam blends a large rotation difference.
    // Helpers split it into half-angle seams: Deltoid takes half of UpperArm's rotation,
    // ForearmTwist takes half of Hand's twist about the forearm axis.
    for (const side of ["L", "R"]) {
      bm.get(`Deltoid_${side}`).quaternion.identity().slerp(bm.get(`UpperArm_${side}`).quaternion, 0.5);
      const hq = bm.get(`Hand_${side}`).quaternion, axis = forearmTwistAxes[side];
      let twist = 2 * Math.atan2(hq.x * axis.x + hq.y * axis.y + hq.z * axis.z, hq.w);
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      bm.get(`ForearmTwist_${side}`).quaternion.setFromAxisAngle(axis, twist * 0.5);
    }

    // 4. Eye micro-saccades & coupled head/neck gaze follow
    const manualGazeActive = Math.abs(faceSliders.eyeX) > 0.01 || Math.abs(faceSliders.eyeY) > 0.01;
    if (opts.autoGaze && !manualGazeActive) {
      gazeState.saccadeTimer -= dt;
      if (gazeState.saccadeTimer <= 0) {
        const prevX = gazeState.targetX;
        const prevY = gazeState.targetY;
        if (Math.random() < 0.45) {
          gazeState.targetX = (Math.random() - 0.5) * 0.14;
          gazeState.targetY = (Math.random() - 0.5) * 0.10;
        } else {
          gazeState.targetX = (Math.random() - 0.5) * 0.72;
          gazeState.targetY = (Math.random() - 0.5) * 0.44;
        }
        const shiftMag = Math.hypot(gazeState.targetX - prevX, gazeState.targetY - prevY);
        if (shiftMag > 0.42 && opts.autoBlink) {
          triggerBlink();
          blinkTimer = 2.4 + Math.random() * 2.8;
        }
        gazeState.saccadeTimer = 0.75 + Math.random() * 2.2;
      }
    } else {
      gazeState.targetX = 0;
      gazeState.targetY = 0;
    }

    gazeState.currentX = THREE.MathUtils.damp(gazeState.currentX, gazeState.targetX, 28, dt);
    gazeState.currentY = THREE.MathUtils.damp(gazeState.currentY, gazeState.targetY, 28, dt);
    const desiredHeadYaw = gazeState.targetX * 0.16 + faceSliders.eyeX * 0.60;
    const desiredHeadPitch = -(gazeState.targetY * 0.11 + faceSliders.eyeY * 0.36);
    gazeState.headYaw = THREE.MathUtils.damp(gazeState.headYaw, desiredHeadYaw, 4.5, dt);
    gazeState.headPitch = THREE.MathUtils.damp(gazeState.headPitch, desiredHeadPitch, 4.5, dt);

    if (Math.abs(gazeState.headYaw) > 1e-4 || Math.abs(gazeState.headPitch) > 1e-4) {
      const neckQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(gazeState.headPitch * 0.4, gazeState.headYaw * 0.4, 0, "YXZ"));
      const headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(gazeState.headPitch * 0.6, gazeState.headYaw * 0.6, gazeState.headYaw * -0.15, "YXZ"));
      bm.get("Neck").quaternion.multiply(neckQ);
      bm.get("Head").quaternion.multiply(headQ);
      limitBone(bm.get("Neck"), 0.5);
      limitBone(bm.get("Head"), 0.7);
    }

    // 5. Clean facial reset -> faceMixer -> manual/FACS slider overrides
    if (opts.autoBlink) {
      blinkTimer -= dt;
      if (blinkTimer <= 0) {
        triggerBlink();
        blinkTimer = 2.6 + Math.random() * 3.4;
      }
    }
    resetFacialBonesToRest();
    faceMixer.update(dt);
    applyManualFacialOverrides();
  }

  const physicsDescriptor = createPhysicsDescriptor(rig);

  return {
    root, skinnedMesh, rig, clips, bodyParts, clothingRoot, clothingSlots,
    mixers: { base: baseMixer, upper: upperMixer, face: faceMixer },
    faceSliders, physicsDescriptor,
    setBaseAnimation, setUpperAnimation, setFaceExpression, triggerBlink, update,
    setHandGesture,
    get handGestures() { return { ...handGestures }; },
    get headDesign() { return structuredClone(headDesign); },
    createHeadPreview, commitHeadPreview,
    get animationState() { return { base: activeBase, upper: activeUpper, face: activeFace }; },
    setClothing, setOutfit, refreshClothingMaterials,
    get palette() { return currentPalette(); },
    setPalette,
    get torsoDetails() { return structuredClone(torsoDetails); },
    setTorsoDetails, resetTorsoDetails,
  };
}
