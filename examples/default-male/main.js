// Default adult male demo: the full character editor assembled from the package's editor elements.
// Everything here is page-specific: the viewport, camera views, the held prop and the reach target.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createAdultMaleCharacter, createParkMillerRng, createStudioLighting, handLayout } from "@kieranb662/procedural-human";
import { registerEditorElements } from "@kieranb662/procedural-human/editor";
import { applyTestQuality, frameDue, invalidate, testMode } from "../test-mode.js";

registerEditorElements();

// ?test freezes time and randomness so visual tests are deterministic, and renders cheaply on demand.

// --- Viewport --------------------------------------------------------------------------------
const container = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ antialias: !testMode, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.fog = new THREE.FogExp2(0x0f172a, 0.06);

const lighting = createStudioLighting();
scene.add(lighting.group);
lighting.attachEnvironment(scene, renderer);
applyTestQuality(renderer, lighting);

const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.05, 60);
camera.position.set(0.35, 1.35, 3.05);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.96, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 0.32;
controls.maxDistance = 8.0;

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x334155);
grid.position.y = 0.001;
grid.material.opacity = 0.35;
grid.material.transparent = true;
scene.add(grid);

// --- Character -------------------------------------------------------------------------------
const character = createAdultMaleCharacter(testMode ? { rng: createParkMillerRng(1) } : {});
scene.add(character.root);
window.proceduralHuman = { character, lighting, createAdultMaleCharacter };

const geometry = character.skinnedMesh.geometry;
document.getElementById("statsLine").textContent =
  `1 Unified SkinnedMesh · ${character.rig.bones.length} Bones · ${Object.keys(character.skinnedMesh.morphTargetDictionary ?? {}).length} FACS Morphs · ` +
  `${geometry.attributes.position.count.toLocaleString()} Verts · ${(geometry.index.count / 3).toLocaleString()} Tris`;

// Props driven by the upper-body layer: a cup for "holding" and an orbiting target for "reaching".
const heldProp = new THREE.Group();
const cupLid = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0118, 0.006, 24), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
cupLid.position.y = 0.048;
heldProp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0105, 0.090, 24),
  new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.32, metalness: 0.15 })), cupLid);
heldProp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), handLayout(-1).across);
heldProp.visible = false;
character.physicsDescriptor.handSockets.right.add(heldProp);

const reachOrb = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 20, 16),
  new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.9, roughness: 0.2 }),
);
reachOrb.position.set(-0.28, 1.38, 0.52);
reachOrb.visible = false;
scene.add(reachOrb);

// --- Editors ---------------------------------------------------------------------------------
const $ = (selector) => document.querySelector(selector);
const headEditor = $("ph-head-editor");
const animationEditor = $("ph-animation-editor");
for (const el of document.querySelectorAll("ph-clothing-editor, ph-animation-editor, ph-face-editor, ph-torso-editor, ph-materials-editor, ph-head-editor")) {
  el.character = character;
}
for (const el of document.querySelectorAll("ph-rig-debug, ph-physics-debug")) {
  el.character = character;
  el.debugScene = scene;
}
for (const el of document.querySelectorAll("ph-human-export")) {
  el.character = character;
  el.headDesignProvider = () => headEditor.headDesign;
}
$("ph-lighting-editor").lighting = lighting;
headEditor.viewport = { renderer, camera, controls, scene };

let propsBeforeHeadEdit = null;
document.addEventListener("ph-change", (event) => {
  const { section, layer, value } = event.detail;
  if (section === "animations" && layer === "upper") {
    heldProp.visible = value === "holding";
    reachOrb.visible = value === "reaching";
  }
});
document.addEventListener("ph-head-editing", (event) => {
  camLerp = null;
  focusedHand = null;
  if (event.detail.active) {
    propsBeforeHeadEdit = { held: heldProp.visible, reach: reachOrb.visible, view: cameraViews.value };
    heldProp.visible = reachOrb.visible = false;
    cameraViews.value = "";
  } else if (propsBeforeHeadEdit) {
    heldProp.visible = propsBeforeHeadEdit.held;
    reachOrb.visible = propsBeforeHeadEdit.reach;
    cameraViews.value = propsBeforeHeadEdit.view;
  }
  resizeViewport();
});

// Sculpt mode follows the Head tab; the viewport docks beside the panel for head and torso work.
const toolTabs = $("#toolTabs");
const activeTab = () => toolTabs.querySelectorAll("ph-tab-panel")[toolTabs.selected]?.getAttribute("label");
toolTabs.addEventListener("change", () => {
  headEditor.setEditing(activeTab() === "Head");
  resizeViewport();
});

// --- Camera views ----------------------------------------------------------------------------
const cameraViews = $("#cameraViews");
cameraViews.options = [{ value: "full", label: "Full Body" }, { value: "face", label: "Face Close-Up" }, { value: "hands", label: "Hands View" }];
cameraViews.value = "full";
let camLerp = null;
let focusedHand = null;

function setCameraView(pos, target, view = "") {
  if (headEditor.editing) headEditor.setEditing(false);
  focusedHand = null;
  camLerp = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) };
  cameraViews.value = view;
}
const handViewTarget = (side) => {
  const local = handLayout(side === "L" ? 1 : -1).palmDir.clone().multiplyScalar(0.070);
  return character.rig.boneMap.get(`Hand_${side}`).localToWorld(local);
};
function inspectHand(side) {
  character.root.updateMatrixWorld(true);
  const target = handViewTarget(side);
  setCameraView(target.clone().add(new THREE.Vector3(side === "L" ? 0.12 : -0.12, 0.04, 0.34)).toArray(), target.toArray(), "hands");
  focusedHand = side;
}
cameraViews.addEventListener("change", () => {
  if (cameraViews.value === "full") setCameraView([0.35, 1.35, 3.05], [0, 0.96, 0], "full");
  else if (cameraViews.value === "face") setCameraView([0.08, 1.66, 0.58], [0, 1.64, 0.04], "face");
  else inspectHand("L");
});
$("#viewLeftHand").addEventListener("click", () => inspectHand("L"));
$("#viewRightHand").addEventListener("click", () => inspectHand("R"));
$("#torsoFrontBtn").addEventListener("click", () => setCameraView([0.19, 1.33, 1.28], [0, 1.22, 0.03]));
$("#torsoRearBtn").addEventListener("click", () => setCameraView([0.24, 1.18, -1.17], [0, 1.09, -0.04]));

// --- Layout ----------------------------------------------------------------------------------
const controlPanel = $("#controlPanel");
$("#togglePanelBtn").addEventListener("click", () => controlPanel.classList.toggle("translate-x-[120%]"));
$("#closePanelBtn").addEventListener("click", () => controlPanel.classList.add("translate-x-[120%]"));

function resizeViewport() {
  const docked = (headEditor.editing || activeTab() === "Torso") && window.matchMedia("(min-width: 768px)").matches;
  container.style.width = docked ? "calc(100% - 340px)" : "100%";
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  invalidate();
}
window.addEventListener("resize", resizeViewport);

// --- Render loop -----------------------------------------------------------------------------
const timer = new THREE.Timer();
timer.connect(document);

renderer.setAnimationLoop((timestamp) => {
  if (!frameDue()) return;
  timer.update(timestamp);
  const dt = testMode ? 0 : Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();

  if (reachOrb.visible) {
    reachOrb.position.set(
      -0.24 + Math.sin(elapsed * 1.4) * 0.16,
      1.34 + Math.cos(elapsed * 1.9) * 0.14,
      0.48 + Math.sin(elapsed * 0.9) * 0.08,
    );
  }

  if (camLerp) {
    // Time is frozen in test mode, so jump straight to the target view.
    const t = testMode ? 1 : Math.min(1, dt * 6);
    camera.position.lerp(camLerp.pos, t);
    controls.target.lerp(camLerp.target, t);
    if (camera.position.distanceTo(camLerp.pos) < 0.01 && controls.target.distanceTo(camLerp.target) < 0.01) camLerp = null;
  }

  character.update(dt, {
    headEditor: headEditor.editing,
    autoBlink: !testMode && animationEditor.autoBlink,
    autoGaze: !testMode && animationEditor.autoGaze,
    reachTarget: reachOrb.visible ? reachOrb.position : null,
  });

  if (focusedHand && !headEditor.editing) {
    character.root.updateMatrixWorld(true);
    const target = handViewTarget(focusedHand);
    const delta = target.clone().sub(camLerp ? camLerp.target : controls.target);
    if (camLerp) {
      camLerp.pos.add(delta);
      camLerp.target.copy(target);
    } else {
      camera.position.add(delta);
      controls.target.copy(target);
    }
  }

  controls.update();
  renderer.render(scene, camera);
  window.__phReady = true;
});
