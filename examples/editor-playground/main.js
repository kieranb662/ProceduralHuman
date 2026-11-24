// Minimal integration of the published APIs: a character, the studio lighting rig and every editor element.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createHuman, createStudioLighting } from "@kieranb662/procedural-human";
import { defaultAdultMale } from "@kieranb662/procedural-human/humans";
import { registerEditorElements } from "@kieranb662/procedural-human/editor";

registerEditorElements();

const container = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
camera.position.set(0.35, 1.35, 3.05);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.96, 0);
controls.enableDamping = true;

const lighting = createStudioLighting();
scene.add(lighting.group);
lighting.attachEnvironment(scene, renderer);

const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const character = createHuman(defaultAdultMale);
scene.add(character.root);

for (const el of document.querySelectorAll("ph-animation-editor, ph-face-editor, ph-clothing-editor, ph-torso-editor, ph-materials-editor, ph-human-export")) {
  el.character = character;
}
for (const el of document.querySelectorAll("ph-rig-debug, ph-physics-debug")) {
  el.character = character;
  el.debugScene = scene;
}
document.querySelector("ph-lighting-editor").lighting = lighting;
const animationEditor = document.querySelector("ph-animation-editor");
const reachTarget = new THREE.Vector3(-0.24, 1.34, 0.48);

function resize() {
  const { clientWidth: w, clientHeight: h } = container;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(container);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  character.update(dt, { autoBlink: animationEditor.autoBlink, autoGaze: animationEditor.autoGaze, reachTarget });
  controls.update();
  renderer.render(scene, camera);
});
window.playground = { character, lighting, scene };
