import type * as THREE from "three";
import { FACIAL_BONES } from "../../../rigging/api/bone-names.js";
import type { RestPose } from "../../../rigging/api/rest-pose.js";
import { createHumanoidSkeleton } from "../../../rigging/api/skeleton.js";
import type { HumanoidRig } from "../../../rigging/api/types.js";
import { mergeCharacterParts } from "../merge.js";
import type { MeshPart } from "../types.js";
import { buildHeadAndFaceParts } from "./head-parts.js";
import { buildFacialMorphTargets } from "./morph-targets.js";
import type { HeadDesign, HeadParts } from "./types.js";

/** A head rebuilt off-screen for live editing; pass it to commitHeadPreview() to apply. */
export interface HeadPreview {
  rig: HumanoidRig;
  parts: HeadParts;
  geometry: THREE.BufferGeometry;
  ranges: { part: MeshPart; offset: number; indexStart: number; indexCount: number }[];
}

export interface HeadEditingContext {
  rig: HumanoidRig;
  skinnedMesh: THREE.SkinnedMesh;
  characterRoot: THREE.Object3D;
  bodyParts: MeshPart[];
  restPose: RestPose;
  /** All animation clips: absolute position tracks are shifted when facial anchors move. */
  clips: Record<string, THREE.AnimationClip>;
  /** Neutral-head reference used to build facial morph targets. */
  reference: { rig: HumanoidRig; geometry: THREE.BufferGeometry; headGroupIdx: number; cavGroupIdx: number };
  initialDesign: HeadDesign;
  copyBodySurface(geometry: THREE.BufferGeometry): void;
  /** Called after the body is re-bound so garments can follow. */
  onRebound(): void;
  /** Stops face animation before facial bones move; returns a function that restarts it. */
  suspendFaceAnimation(): () => void;
}

/** Off-screen head previews and committing them onto the live, animated character. */
export function createHeadEditing(ctx: HeadEditingContext) {
  const { rig, skinnedMesh, bodyParts, restPose, clips, reference } = ctx;
  let headDesign = structuredClone(ctx.initialDesign);

  function createHeadPreview(design: HeadDesign): HeadPreview {
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

  function commitHeadPreview(preview: HeadPreview) {
    const geometry = preview.geometry.clone();
    ctx.copyBodySurface(geometry);
    buildFacialMorphTargets(geometry, reference.rig, reference.headGroupIdx, reference.cavGroupIdx, reference.geometry, preview.parts.design);
    const deltas = new Map<string, THREE.Vector3>();
    for (const bone of rig.bones) {
      deltas.set(bone.name, preview.rig.boneMap.get(bone.name).position.clone().sub(restPose.position.get(bone.name)));
    }
    const retargetFace = FACIAL_BONES.some((name) => deltas.get(name).lengthSq() > 1e-16);
    const resumeFace = retargetFace ? ctx.suspendFaceAnimation() : null;
    for (const bone of rig.bones) {
      const next = preview.rig.boneMap.get(bone.name).position;
      restPose.position.get(bone.name).copy(next);
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
    ctx.characterRoot.updateMatrixWorld(true);
    skinnedMesh.bind(rig.skeleton);
    ctx.onRebound();
    for (const bone of rig.bones) bone.quaternion.copy(restPose.quaternion.get(bone.name));
    resumeFace?.();
    previous.dispose();
    headDesign = structuredClone(preview.parts.design);
  }

  return {
    createHeadPreview, commitHeadPreview,
    get design() { return structuredClone(headDesign); },
  };
}
