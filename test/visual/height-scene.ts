import * as THREE from "three";
import { createAdultMaleCharacter, createStudioLighting, createTwistHelpers } from "../../src/index.js";

/** Short character above tall character; columns are front, side, back and oblique. */
export function renderHeightStress(pose: "neutral" | "squat" | "twist", heights = [1 / 2, 2]) {
  const canvas = document.createElement("canvas");
  canvas.id = "height-stress";
  canvas.style.cssText = "position:fixed;inset:0;width:1920px;height:1440px;z-index:10000";
  document.querySelector("#height-stress")?.remove();
  document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1920, 1440);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#182030");
  const lighting = createStudioLighting();
  scene.add(lighting.group);
  lighting.attachEnvironment(scene, renderer);
  const views = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0.3, 1]];
  const metrics = [];
  renderer.setScissorTest(true);
  for (const [row, height] of heights.entries()) {
    const character = createAdultMaleCharacter({ height });
    scene.add(character.root);
    character.update(0, { headEditor: true });
    const bones = character.rig.boneMap;
    if (pose !== "neutral") {
      for (const [side, sign] of [["L", 1], ["R", -1]] as const) {
        bones.get(`Thigh_${side}`).rotation.x = pose === "squat" ? -1.1 : side === "R" ? -1.3 : 0.35;
        bones.get(`Shin_${side}`).rotation.x = pose === "squat" ? 1.8 : side === "R" ? 2 : 0.8;
        bones.get(`UpperArm_${side}`).rotation.z = sign * (pose === "squat" ? 1.5 : side === "R" ? 2.2 : -0.6);
        const hinge = new THREE.Vector3(0.84, sign * 0.54, 0).normalize();
        bones.get(`Forearm_${side}`).quaternion.setFromAxisAngle(hinge, -1.6);
        bones.get(`Hand_${side}`).rotation.y = sign * 1.1;
      }
      bones.get("Spine").rotation.set(pose === "squat" ? 0.3 : 0, pose === "twist" ? 0.6 : 0, 0);
      bones.get("Head").rotation.set(0.15, pose === "twist" ? -0.55 : 0.3, 0);
      createTwistHelpers(character.rig).update();
    }
    character.root.updateMatrixWorld(true);
    character.rig.skeleton.update();
    const bounds = new THREE.Box3(), point = new THREE.Vector3();
    const geometry = character.skinnedMesh.geometry;
    const deformed = new Float32Array(geometry.attributes.position.count * 3);
    let finite = true;
    for (let i = 0; i < character.skinnedMesh.geometry.attributes.position.count; i++) {
      character.skinnedMesh.getVertexPosition(i, point);
      point.toArray(deformed, i * 3);
      finite &&= Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
      bounds.expandByPoint(point);
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const area = (i: number, posed: boolean) => {
      const vertices = [a, b, c];
      vertices.forEach((v, k) => {
        const j = geometry.index!.getX(i + k);
        if (posed) v.fromArray(deformed, j * 3);
        else v.fromBufferAttribute(geometry.attributes.position, j);
      });
      return b.sub(a).cross(c.sub(a)).length();
    };
    let minAreaRatio = Infinity, maxAreaRatio = 0;
    for (let i = 0; i < character.bodyParts[0].geo.index!.count; i += 3) {
      const restArea = area(i, false);
      if (restArea < 1e-10) continue;
      const ratio = area(i, true) / restArea;
      minAreaRatio = Math.min(minAreaRatio, ratio);
      maxAreaRatio = Math.max(maxAreaRatio, ratio);
    }
    metrics.push({ height, finite, minAreaRatio, maxAreaRatio, size: bounds.getSize(point).toArray() });
    const center = bounds.getCenter(new THREE.Vector3());
    const dimensions = bounds.getSize(new THREE.Vector3());
    const size = Math.max(dimensions.y, Math.hypot(dimensions.x, dimensions.z) * 720 / 480) * 0.55;
    views.forEach((view, column) => {
      const camera = new THREE.OrthographicCamera(-size * 480 / 720, size * 480 / 720, size, -size, 0.01, 30);
      camera.position.copy(center).add(new THREE.Vector3(...view).normalize().multiplyScalar(8));
      camera.lookAt(center);
      renderer.setViewport(column * 480, (1 - row) * 720, 480, 720);
      renderer.setScissor(column * 480, (1 - row) * 720, 480, 720);
      renderer.render(scene, camera);
    });
    character.dispose();
  }
  lighting.dispose();
  renderer.dispose();
  return metrics;
}
