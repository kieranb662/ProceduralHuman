import * as THREE from "three";
import { defaultCanvasFactory, type CanvasFactory } from "../../textures/api/canvas.js";
import { makeEyeTexture } from "../../textures/api/eye.js";
import { makeHairTextures } from "../../textures/api/hair.js";
import { makeOralTextures } from "../../textures/api/oral.js";
import { resolveTextureSettings } from "../../textures/api/settings.js";
import { makeSkinTextures } from "../../textures/api/skin.js";
import { makeWeaveTextures } from "../../textures/api/weave.js";
import { applyOralOcclusion } from "./shaders/oral-occlusion.js";
import { applySkinMapping } from "./shaders/skin-shader.js";
import type { Palette } from "./palette.js";

export interface ProceduralMaterialOptions {
  createCanvas?: CanvasFactory;
}

/** Builds the 12 character material slots from a palette. */
export function createProceduralMaterials(palette: Palette = {}, { createCanvas = defaultCanvasFactory }: ProceduralMaterialOptions = {}) {
  const skinHex = palette.skin ?? "#c68b59";
  const shirtHex = palette.shirt ?? "#2e5a88";
  const shortsHex = palette.shorts ?? "#4a4e4d";
  const hairHex = palette.hair ?? "#241c18";
  const textureSettings = resolveTextureSettings(palette.textures);

  const skinTex = makeSkinTextures(skinHex, textureSettings, createCanvas);
  const shirtTex = makeWeaveTextures(shirtHex, textureSettings.shirtContrast, [textureSettings.shirtRepeatX, textureSettings.shirtRepeatY], createCanvas);
  const shortsTex = makeWeaveTextures(shortsHex, textureSettings.shortsContrast, [textureSettings.shortsRepeatX, textureSettings.shortsRepeatY], createCanvas);
  const hairTex = makeHairTextures(hairHex, textureSettings, createCanvas);
  const eyeMap = makeEyeTexture(createCanvas);
  const enamelTex = makeOralTextures(true, createCanvas);
  const oralTex = makeOralTextures(false, createCanvas);

  // 0: Body Skin, 1: T-Shirt, 2: Shorts, 3: Hair/Brows,
  // 4: Eyeball, 5: Head Skin, 6: Teeth, 7: Foot Wraps, 8: Clothing Trim, 9: Oral Mucosa/Gums, 10: Tongue, 11: Nails
  const materials = [
    new THREE.MeshPhysicalMaterial({
      map: skinTex.map, bumpMap: skinTex.bump, bumpScale: 0.00025,
      roughness: 0.56, metalness: 0.0, vertexColors: true, ior: 1.4,
      sheen: 0.08, sheenColor: new THREE.Color(0xffdfd0), sheenRoughness: 0.85,
      clearcoat: 0.025, clearcoatRoughness: 0.55,
    }),
    new THREE.MeshPhysicalMaterial({
      map: shirtTex.map, bumpMap: shirtTex.bump, bumpScale: 1.5,
      roughness: 0.88, metalness: 0.0,
      sheen: 0.65, sheenColor: new THREE.Color(0x9ab8d9), sheenRoughness: 0.72,
    }),
    new THREE.MeshPhysicalMaterial({
      map: shortsTex.map, bumpMap: shortsTex.bump, bumpScale: 1.5,
      roughness: 0.85, metalness: 0.0,
      sheen: 0.55, sheenColor: new THREE.Color(0x9ea3a2), sheenRoughness: 0.78,
    }),
    new THREE.MeshPhysicalMaterial({
      map: hairTex.map, bumpMap: hairTex.bump, bumpScale: 1.5, color: 0xffffff,
      roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color(0x8a6a50), sheenRoughness: 0.4,
    }),
    new THREE.MeshPhysicalMaterial({
      map: eyeMap, roughness: 0.04, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.02, ior: 1.38, envMapIntensity: 1.3,
    }),
    new THREE.MeshPhysicalMaterial({
      map: skinTex.map, bumpMap: skinTex.bump, bumpScale: 0.00025, vertexColors: true,
      roughness: 0.54, metalness: 0.0, ior: 1.4,
      sheen: 0.10, sheenColor: new THREE.Color(0xffdfd0), sheenRoughness: 0.82,
      clearcoat: 0.035, clearcoatRoughness: 0.48,
    }),
    new THREE.MeshPhysicalMaterial({
      map: enamelTex.map, bumpMap: enamelTex.bump, bumpScale: 0.000025,
      color: 0xffffff, vertexColors: true, roughness: 0.25, metalness: 0.0,
      clearcoat: 0.65, clearcoatRoughness: 0.16, ior: 1.62,
    }),
    new THREE.MeshStandardMaterial({ color: 0xebeef2, roughness: 0.90, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.62, metalness: 0.05 }),
    new THREE.MeshPhysicalMaterial({
      map: oralTex.map, bumpMap: oralTex.bump, bumpScale: 0.00006,
      color: 0xffffff, vertexColors: true, roughness: 0.60, metalness: 0.0,
      clearcoat: 0.08, clearcoatRoughness: 0.50, envMapIntensity: 0.35, side: THREE.DoubleSide,
    }),
    new THREE.MeshPhysicalMaterial({
      map: oralTex.map, bumpMap: oralTex.bump, bumpScale: 0.00012,
      color: 0xffffff, vertexColors: true, roughness: 0.43, metalness: 0.0,
      clearcoat: 0.45, clearcoatRoughness: 0.25, side: THREE.DoubleSide,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0xdca192, vertexColors: true, roughness: 0.32, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.28, ior: 1.45,
    }),
  ];
  materials.forEach((material, index) => {
    if (palette.materials?.[index]) material.setValues(palette.materials[index]);
    if (index === 0 || index === 5) applySkinMapping(material, textureSettings);
  });
  for (const index of [9, 10]) applyOralOcclusion(materials[index]);
  return materials;
}
