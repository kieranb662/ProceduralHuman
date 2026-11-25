import * as THREE from "three";
import { createStrainHeatmap } from "../../examples/editor-playground/strain-heatmap.js";

export function sampleStrainHeatmap() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 64);
  const target = new THREE.WebGLRenderTarget(64, 64);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const positions = geometry.attributes.position;
  const indices = new Uint16Array(positions.count * 4);
  const weights = new Float32Array(positions.count * 4);
  const morph = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    weights[i * 4] = 1;
    morph[i * 3] = positions.getX(i) * 0.5;
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(morph, 3)];
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bone = new THREE.Bone();
  mesh.add(bone);
  scene.add(mesh);
  mesh.bind(new THREE.Skeleton([bone]));
  const heatmap = createStrainHeatmap(mesh);
  const pixel = new Uint8Array(4);
  const sample = () => {
    heatmap.update();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
    return Array.from(pixel);
  };

  const original = sample();
  heatmap.enabled = true;
  const neutral = sample();
  bone.rotation.z = Math.PI / 4;
  bone.position.set(0.1, 0.05, 0);
  const rigid = sample();
  bone.rotation.z = 0;
  bone.position.set(0, 0, 0);
  bone.scale.x = 1.1;
  const mild = sample();
  bone.scale.x = 1.25;
  const moderate = sample();
  bone.scale.x = 1.5;
  const stretch = sample();
  bone.scale.x = 0.5;
  const compression = sample();
  bone.scale.x = 1;
  bone.matrixAutoUpdate = false;
  bone.matrix.set(1, 0.8, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const shear = sample();
  bone.matrix.identity();
  mesh.morphTargetInfluences[0] = 1;
  const morphed = sample();
  const replacementGeometry = geometry.clone();
  mesh.geometry = replacementGeometry;
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences[0] = 1;
  const replacement = sample();
  heatmap.enabled = false;
  mesh.morphTargetInfluences[0] = 0;
  const restored = sample();

  target.dispose();
  geometry.dispose();
  replacementGeometry.dispose();
  material.dispose();
  mesh.children.find((child) => child.name === "StrainHeatmap").material.dispose();
  mesh.skeleton.dispose();
  renderer.dispose();
  return { original, neutral, rigid, mild, moderate, stretch, compression, shear, morphed, replacement, restored };
}
