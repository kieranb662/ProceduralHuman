import * as THREE from "three";
import { RIGHT_ARM_BONES } from "../../rigging/api/bone-names.js";
import type { RestPose } from "../../rigging/api/rest-pose.js";
import type { HumanoidRig, KeyedMap } from "../../rigging/api/types.js";
import {
  BASE_ANIMATIONS, FACE_EXPRESSIONS, UPPER_ANIMATIONS,
  type BaseAnimation, type ClipName, type FaceExpression, type FaceExpressionClip,
  type UpperAnimation, type UpperAnimationClip,
} from "./names.js";

/**
 * Three clip layers on one SkinnedMesh: full-body base locomotion, a right-arm upper-body overlay,
 * and facial expressions (including one-shot blinks).
 */
export function createAnimationLayers(
  skinnedMesh: THREE.SkinnedMesh,
  clips: Record<ClipName, THREE.AnimationClip>,
  rig: HumanoidRig,
  restPose: RestPose,
) {
  const bm = rig.boneMap;
  const baseMixer = new THREE.AnimationMixer(skinnedMesh);
  const upperMixer = new THREE.AnimationMixer(skinnedMesh);
  const faceMixer = new THREE.AnimationMixer(skinnedMesh);

  const baseActions = {} as Record<BaseAnimation, THREE.AnimationAction>;
  const upperActions = {} as Record<UpperAnimationClip, THREE.AnimationAction>;
  const faceActions = {} as Record<FaceExpressionClip, THREE.AnimationAction>;
  const upperSamples = Object.fromEntries(UPPER_ANIMATIONS.map((name) => [name,
    clips[name].tracks.filter((track) => track instanceof THREE.QuaternionKeyframeTrack).map((track) => ({
      bone: track.name.slice(0, track.name.indexOf(".")),
      // createInterpolant() exists at runtime but is missing from @types/three.
      interpolant: (track as any).createInterpolant(),
    }))]));

  for (const n of BASE_ANIMATIONS) baseActions[n] = baseMixer.clipAction(clips[n]);
  for (const n of UPPER_ANIMATIONS) upperActions[n] = upperMixer.clipAction(clips[n]);
  for (const n of FACE_EXPRESSIONS) faceActions[n] = faceMixer.clipAction(clips[n]);
  faceActions.blinking.setLoop(THREE.LoopOnce, 1);

  let activeBase: BaseAnimation = "idle";
  let activeUpper: UpperAnimation = "none";
  let activeUpperClip: UpperAnimationClip | null = null;
  let activeFace: FaceExpression = "neutral";
  baseActions.idle.play();

  let upperBlend = 0;
  let reboundFades: { mixer: THREE.AnimationMixer; action: THREE.AnimationAction; from: number; to: number; elapsed: number; duration: number }[] = [];
  function updateReboundFades(mixer: THREE.AnimationMixer, dt: number) {
    reboundFades = reboundFades.filter((fade) => {
      if (fade.mixer !== mixer) return true;
      fade.elapsed += dt;
      const t = Math.min(1, fade.elapsed / fade.duration);
      fade.action.setEffectiveWeight(THREE.MathUtils.lerp(fade.from, fade.to, t));
      if (t === 1 && fade.to === 0) fade.action.stop();
      return t < 1;
    });
  }
  const baseArmQuats = new Map<string, THREE.Quaternion>() as KeyedMap<THREE.Quaternion>;
  for (const name of RIGHT_ARM_BONES) baseArmQuats.set(name, new THREE.Quaternion());

  function setBaseAnimation(name: BaseAnimation) {
    if (!baseActions[name] || name === activeBase) return;
    reboundFades = reboundFades.filter((fade) => fade.mixer !== baseMixer);
    const prev = baseActions[activeBase];
    const next = baseActions[name];
    next.reset().setEffectiveWeight(1).play();
    prev.crossFadeTo(next, 0.25, false);
    activeBase = name;
  }

  // "none" and "reaching" are layer states without a clip.
  const upperLookup = upperActions as Partial<Record<UpperAnimation, THREE.AnimationAction>>;

  function setUpperAnimation(name: UpperAnimation) {
    if (name === activeUpper) return;
    reboundFades = reboundFades.filter((fade) => fade.mixer !== upperMixer);
    if (upperLookup[name]) {
      if (activeUpperClip && activeUpperClip !== name && upperActions[activeUpperClip]) {
        const prev = upperActions[activeUpperClip];
        const next = upperLookup[name]!;
        next.reset().setEffectiveWeight(1).play();
        prev.crossFadeTo(next, 0.2, false);
      } else {
        upperLookup[name]!.reset().setEffectiveWeight(1).play();
      }
      activeUpperClip = name as UpperAnimationClip;
    }
    activeUpper = name;
  }

  function setFaceExpression(name: FaceExpression) {
    if (name === activeFace) return;
    reboundFades = reboundFades.filter((fade) => fade.mixer !== faceMixer);
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

  function updateBase(dt: number) {
    updateReboundFades(baseMixer, dt);
    baseMixer.update(dt);
  }

  /** Layered upper-body clip pass over the right arm. Returns the current overlay blend (0..1). */
  function updateUpper(dt: number): number {
    updateReboundFades(upperMixer, dt);
    const targetUpper = (activeUpper === "waving" || activeUpper === "holding") ? 1 : 0;
    upperBlend = THREE.MathUtils.damp(upperBlend, targetUpper, 10, dt);

    if (upperBlend > 0.001 && activeUpperClip) {
      for (const name of RIGHT_ARM_BONES) {
        baseArmQuats.get(name).copy(bm.get(name).quaternion);
        bm.get(name).quaternion.copy(restPose.quaternion.get(name));
      }
      upperMixer.update(dt);
      // PropertyMixer skips unchanged values, but our frame reset still needs
      // constant holding tracks. Sample the public tracks at each action's time.
      const sampled = new Map<string, { q: THREE.Quaternion; weight: number }>();
      for (const name of UPPER_ANIMATIONS) {
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
        const upperQ = restPose.quaternion.get(name).clone();
        if (sample) upperQ.slerp(sample.q, Math.min(1, sample.weight));
        b.quaternion.copy(baseArmQuats.get(name)).slerp(upperQ, upperBlend);
      }
    } else if (upperBlend <= 0.001 && targetUpper === 0 && activeUpperClip) {
      upperMixer.stopAllAction();
      activeUpperClip = null;
    }
    return upperBlend;
  }

  function updateFace(dt: number) {
    updateReboundFades(faceMixer, dt);
    faceMixer.update(dt);
  }

  /**
   * Stops the face layer before facial bones move (head re-sculpt). Call the returned function
   * after the mesh is re-bound to restart the active expression and any in-flight blink.
   */
  function suspendFace(): () => void {
    const faceTimes: Partial<Record<FaceExpressionClip, number>> = {};
    const resumeBlink = faceActions.blinking.isScheduled();
    for (const name of FACE_EXPRESSIONS) faceTimes[name] = faceActions[name].time;
    faceMixer.stopAllAction();
    faceMixer.uncacheRoot(skinnedMesh);
    // Rebinding also refreshes the mixer's saved original pose used during expression fade-outs.
    return () => {
      for (const name of FACE_EXPRESSIONS) faceActions[name] = faceMixer.clipAction(clips[name]);
      faceActions.blinking.setLoop(THREE.LoopOnce, 1);
      for (const state of [activeFace, ...(resumeBlink ? ["blinking"] : [])] as FaceExpression[]) {
        if (state === "neutral") continue;
        faceActions[state].reset().setEffectiveWeight(1).play();
        faceActions[state].time = faceTimes[state]!;
      }
    };
  }

  /** Refreshes all saved mixer rest values when body lengths change. */
  function suspendBody(): () => void {
    const groups: { mixer: THREE.AnimationMixer; actions: Partial<Record<ClipName, THREE.AnimationAction>>; names: readonly ClipName[] }[] = [
      { mixer: baseMixer, actions: baseActions, names: BASE_ANIMATIONS },
      { mixer: upperMixer, actions: upperActions, names: UPPER_ANIMATIONS },
      { mixer: faceMixer, actions: faceActions, names: FACE_EXPRESSIONS },
    ];
    const saved = groups.map(({ actions, names }) => names.map((name) => {
      const action = actions[name]!;
      return { name, scheduled: action.isScheduled(), time: action.time,
        weight: action.getEffectiveWeight(), timeScale: action.getEffectiveTimeScale(), paused: action.paused };
    }));
    reboundFades = [];
    for (const { mixer } of groups) {
      mixer.stopAllAction();
      mixer.uncacheRoot(skinnedMesh);
    }
    return () => {
      groups.forEach(({ mixer, actions }, i) => {
        for (const state of saved[i]) {
          const action = mixer.clipAction(clips[state.name]);
          actions[state.name] = action;
          if (state.name === "blinking") action.setLoop(THREE.LoopOnce, 1);
          if (state.scheduled) {
            action.setEffectiveWeight(state.weight).setEffectiveTimeScale(state.timeScale).play();
            action.time = state.time;
            action.paused = state.paused;
            const target = state.name === activeBase || state.name === activeUpperClip
              || state.name === activeFace || state.name === "blinking" ? 1 : 0;
            if (state.weight !== target) {
              reboundFades.push({
                mixer, action, from: state.weight, to: target, elapsed: 0,
                duration: Math.abs(target - state.weight) * (mixer === baseMixer ? 0.25 : 0.2),
              });
            }
          }
        }
      });
    };
  }

  /** Stops every action and releases the cached mixer bindings. */
  function dispose() {
    for (const mixer of [baseMixer, upperMixer, faceMixer]) {
      mixer.stopAllAction();
      mixer.uncacheRoot(skinnedMesh);
    }
  }

  return {
    dispose,
    mixers: { base: baseMixer, upper: upperMixer, face: faceMixer },
    setBaseAnimation, setUpperAnimation, setFaceExpression, triggerBlink,
    updateBase, updateUpper, updateFace, suspendFace, suspendBody,
    get state() { return { base: activeBase, upper: activeUpper, face: activeFace }; },
  };
}

export type AnimationLayers = ReturnType<typeof createAnimationLayers>;
