import * as THREE from "three";
import { handLayout } from "../../../rigging/api/hand-layout.js";
import type { TextureSettings } from "../../../textures/api/settings.js";

/**
 * Patches a physical material with rest-space triplanar skin detail, region tone masks,
 * palm creases, nostril shading and wrap/transmission scattering.
 * Relies on three's built-in shader chunks: keep the supported three range narrow.
 */
export function applySkinMapping(material: THREE.Material, textureSettings: TextureSettings): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skinTileSize = { value: textureSettings.skinTileSize };
    shader.uniforms.skinDetail = { value: textureSettings.skinDetail };
    shader.uniforms.skinColorVariation = { value: textureSettings.skinColorVariation };
    shader.uniforms.skinRoughnessVariation = { value: textureSettings.skinRoughnessVariation };
    shader.uniforms.skinScattering = { value: textureSettings.skinScattering };
    shader.uniforms.skinThicknessScale = { value: textureSettings.skinThicknessScale };
    const varyings = `
varying vec3 vSkinRestPosition;
varying vec3 vSkinRestNormal;
varying vec3 vFaceSurface;
`;
    shader.vertexShader = "attribute vec3 faceSurface;\n" + varyings + shader.vertexShader;
    // Capture before morphing/skinning so animation cannot move the texture through the skin.
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
vSkinRestPosition = position;
vSkinRestNormal = normal;
vFaceSurface = faceSurface;
#include <begin_vertex>
`);
    shader.fragmentShader = varyings + `
uniform float skinTileSize;
uniform float skinDetail;
uniform float skinColorVariation;
uniform float skinRoughnessVariation;
uniform float skinScattering;
uniform float skinThicknessScale;
float skinHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float skinNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(skinHash(cell), skinHash(cell + vec3(1, 0, 0)), f.x),
        mix(skinHash(cell + vec3(0, 1, 0)), skinHash(cell + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(skinHash(cell + vec3(0, 0, 1)), skinHash(cell + vec3(1, 0, 1)), f.x),
        mix(skinHash(cell + vec3(0, 1, 1)), skinHash(cell + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float skinEllipse(float x, float y, float cx, float cy, float rx, float ry) {
  vec2 d = (vec2(x, y) - vec2(cx, cy)) / vec2(rx, ry);
  return exp(-dot(d, d) * 0.5);
}
vec3 skinRegionMasks(vec3 p) {
  float face = smoothstep(1.53, 1.57, p.y) * (1.0 - smoothstep(1.73, 1.77, p.y))
             * smoothstep(0.045, 0.085, p.z);
  float cheeks = skinEllipse(abs(p.x), p.y, 0.050, 1.638, 0.028, 0.026) * face;
  float nose = skinEllipse(p.x, p.y, 0.0, 1.636, 0.018, 0.031) * face;
  float forehead = skinEllipse(p.x, p.y, 0.0, 1.700, 0.060, 0.034) * face;
  float ears = skinEllipse(abs(p.x), p.y, 0.116, 1.640, 0.022, 0.038);
  float elbows = skinEllipse(abs(p.x), p.y, 0.390, 0.960, 0.065, 0.090);
  float knees = skinEllipse(abs(p.x), p.y, 0.105, 0.520, 0.050, 0.075);
  float joints = clamp(elbows + knees, 0.0, 1.0);
  float warmth = clamp(cheeks * 0.58 + nose * 0.75 + ears * 0.62 + joints * 0.22, 0.0, 1.0);
  float oil = clamp(nose * 0.90 + forehead * 0.68 + cheeks * 0.12, 0.0, 1.0);
  return vec3(warmth, oil, joints);
}
float skinThicknessMm(vec3 p) {
  float ears = smoothstep(0.088, 0.103, abs(p.x))
             * skinEllipse(abs(p.x), p.y, 0.108, 1.640, 0.024, 0.038);
  float nose = smoothstep(0.115, 0.135, p.z)
             * skinEllipse(p.x, p.y, 0.0, 1.631, 0.016, 0.018);
  float hands = skinEllipse(abs(p.x), p.y, 0.560, 0.995, 0.075, 0.085);
  float thin = clamp(max(ears, max(nose * 0.55, hands * 0.45)), 0.0, 1.0);
  return mix(12.0, 1.5, thin) * skinThicknessScale;
}
vec4 sampleSkinTexture(sampler2D skinTexture, vec3 restPosition) {
  vec3 weights = pow(abs(normalize(vSkinRestNormal)), vec3(4.0));
  weights /= max(weights.x + weights.y + weights.z, 0.00001);
  vec3 p = restPosition / skinTileSize;
  // All height samples need the same footprint, including the offset bump samples.
  vec3 dx = dFdx(vSkinRestPosition) / skinTileSize;
  vec3 dy = dFdy(vSkinRestPosition) / skinTileSize;
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  return textureGrad(skinTexture, rotate * p.yz + vec2(0.17, 0.43), rotate * dx.yz, rotate * dy.yz) * weights.x
       + textureGrad(skinTexture, rotate * p.xz + vec2(0.53, 0.29), rotate * dx.xz, rotate * dy.xz) * weights.y
       + textureGrad(skinTexture, rotate * p.xy + vec2(0.31, 0.71), rotate * dx.xy, rotate * dy.xy) * weights.z;
}
float skinPoreVisibility() {
  float footprint = max(length(dFdx(vSkinRestPosition)), length(dFdy(vSkinRestPosition)));
  return 1.0 - smoothstep(0.25, 1.25, footprint / (skinTileSize / 112.0));
}
float handCreases(vec3 p) {
  float side = sign(p.x);
  vec3 d = p - vec3(side * 0.560, 1.025, 0.008);
  vec3 along = normalize(vec3(side * 0.30, -0.94, 0.08));
  vec3 across = normalize(vec3(0.0, 0.0, 1.0) - along * along.z);
  vec3 palmar = normalize(cross(across, along)) * -side;
  float u = dot(d, along), v = dot(d, across);
  float region = smoothstep(0.006, 0.020, u) * (1.0 - smoothstep(0.080, 0.090, u))
    * (1.0 - smoothstep(0.029, 0.037, abs(v))) * smoothstep(0.15, 0.65, dot(vSkinRestNormal, palmar));
  // +v is radial (thumb side). Distal transverse ("heart") crease runs from the ulnar edge toward the
  // index/middle web; proximal transverse ("head") crease starts at the radial edge; the thenar
  // ("life") crease arcs around the thumb's ball toward the wrist.
  float heart = exp(-pow((u - 0.0765 - v * 0.16) / 0.00070, 2.0)) * (1.0 - smoothstep(0.012, 0.020, v));
  float head = exp(-pow((u - 0.0655 - v * 0.22) / 0.00065, 2.0)) * smoothstep(-0.030, -0.020, v);
  vec2 thenar = vec2((u - 0.034) / 0.035, (v - 0.034) / 0.026);
  float life = exp(-pow((length(thenar) - 1.0) * 0.026 / 0.00075, 2.0))
    * (1.0 - smoothstep(0.024, 0.030, v)) * smoothstep(0.010, 0.020, u);
  float palmLines = region * max(head, max(heart, life * 0.7));
  float fingerLines = 0.0;
  for (int i = 0; i < 4; i++) {
${(["spread", "base", "L"] as const).map((k) => `    float ${k === "L" ? "len" : k} = ${handLayout(1).fingers.map((f) => f[k].toFixed(4))
    .reduceRight((rest, v, i) => i === 3 ? v : `(i == ${i} ? ${v} : ${rest})`)};`).join("\n")}
    float lateral = v - spread - (u - base) * spread * 1.2;
    float digitMask = (1.0 - smoothstep(0.006, 0.009, abs(lateral))) * smoothstep(base, base + 0.008, u);
    float pip = exp(-pow((u - base - len * 0.46) / 0.0006, 2.0));
    float dip = exp(-pow((u - base - len * 0.76) / 0.0005, 2.0));
    fingerLines = max(fingerLines, digitMask * max(pip, dip) * abs(dot(vSkinRestNormal, palmar)));
  }
  return max(palmLines, fingerLines * 0.75);
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
${THREE.ShaderChunk.map_fragment.replace(
  "texture2D( map, vMapUv )", "sampleSkinTexture( map, vSkinRestPosition )")}
vec3 skinMasks = skinRegionMasks(vSkinRestPosition);
float skinMottle = skinNoise(vSkinRestPosition * 18.0 + vec3(7.1, 3.8, 1.4)) - 0.5;
float skinFlush = skinNoise(vSkinRestPosition * 43.0 + vec3(1.7, 9.2, 5.3)) - 0.5;
diffuseColor.rgb *= 1.0 + skinColorVariation * skinDetail
  * (skinMottle * 0.055 + skinFlush * vec3(0.035, -0.020, -0.025));
diffuseColor.rgb *= mix(vec3(1.0), vec3(1.035, 0.955, 0.935), skinMasks.x * skinColorVariation);
diffuseColor.rgb *= 1.0 - handCreases(vSkinRestPosition) * 0.13 * skinColorVariation;
float nostrilV = vFaceSurface.y - 1.6205;
// Teardrop openings: axes converge toward the tip and narrow at the front, as in nostrilField().
vec2 nostrilCoord = vec2(
  (abs(vFaceSurface.x) - 0.0074 + nostrilV * 0.42) / (0.0034 * (1.0 - 0.38 * tanh(nostrilV / 0.0030))),
  nostrilV / 0.0036);
float nostrilPit = exp(-dot(nostrilCoord, nostrilCoord));
float nostrilDark = smoothstep(0.20, 0.85, nostrilPit) * vFaceSurface.z;
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.12, 0.065, 0.055), nostrilDark);
`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
${THREE.ShaderChunk.roughnessmap_fragment}
roughnessFactor = clamp(
  roughnessFactor + skinRoughnessVariation
    * (-0.075 * skinMasks.y + 0.025 * skinMasks.z + skinMottle * 0.035 + skinFlush * 0.015),
  0.04, 1.0
);
`);
    let bumpChunk = THREE.ShaderChunk.bumpmap_pars_fragment
      .replace("vec2 dSTdx = dFdx( vBumpMapUv );", "vec3 dSTdx = dFdx( vSkinRestPosition );")
      .replace("vec2 dSTdy = dFdy( vBumpMapUv );", "vec3 dSTdy = dFdy( vSkinRestPosition );")
      .replace("texture2D( bumpMap, vBumpMapUv )", "sampleSkinTexture( bumpMap, vSkinRestPosition )")
      .replace("texture2D( bumpMap, vBumpMapUv + dSTdx )", "sampleSkinTexture( bumpMap, vSkinRestPosition + dSTdx )")
      .replace("texture2D( bumpMap, vBumpMapUv + dSTdy )", "sampleSkinTexture( bumpMap, vSkinRestPosition + dSTdy )");
    // Retain surface derivative lengths so bumpScale represents height in scene units.
    bumpChunk = bumpChunk
      .replaceAll("sampleSkinTexture( bumpMap, vSkinRestPosition ).x", "(sampleSkinTexture( bumpMap, vSkinRestPosition ).x * skinPoreVisibility() - handCreases(vSkinRestPosition) * 0.18)")
      .replaceAll("sampleSkinTexture( bumpMap, vSkinRestPosition + dSTdx ).x", "(sampleSkinTexture( bumpMap, vSkinRestPosition + dSTdx ).x * skinPoreVisibility() - handCreases(vSkinRestPosition + dSTdx) * 0.18)")
      .replaceAll("sampleSkinTexture( bumpMap, vSkinRestPosition + dSTdy ).x", "(sampleSkinTexture( bumpMap, vSkinRestPosition + dSTdy ).x * skinPoreVisibility() - handCreases(vSkinRestPosition + dSTdy) * 0.18)")
      .replace("normalize( dFdx( surf_pos.xyz ) )", "dFdx( surf_pos.xyz )")
      .replace("normalize( dFdy( surf_pos.xyz ) )", "dFdy( surf_pos.xyz )");
    shader.fragmentShader = shader.fragmentShader.replace("#include <bumpmap_pars_fragment>", bumpChunk);
    const diffuseLine = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
    const physicalChunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (!physicalChunk.includes(diffuseLine)) {
      throw new Error("Skin scattering requires the supported Three.js physical diffuse shader.");
    }
    // DirectLight.color already includes shadow attenuation. Leave all specular lobes untouched.
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>",
      physicalChunk.replace(diffuseLine, `
float skinDotNL = dot(geometryNormal, directLight.direction);
float skinWrapped = max(skinDotNL + 0.3, 0.0) / (1.3 * 1.3);
vec3 skinAttenuation = exp(-vec3(skinThicknessMm(vSkinRestPosition)) / vec3(3.5, 1.3, 0.65));
float skinBack = pow(max(-skinDotNL, 0.0), 2.0);
vec3 skinScattered = directLight.color * (
  skinWrapped * vec3(0.95, 0.83, 0.75) + skinBack * skinAttenuation * 0.4
);
#ifdef USE_SHEEN
skinScattered *= sheenEnergyComp;
#endif
vec3 skinExitFresnel = F_Schlick(
  material.specularColor, material.specularF90, saturate(dot(geometryNormal, geometryViewDir))
);
vec3 skinDiffuseIrradiance = mix(
  irradiance * (1.0 - F), skinScattered * (1.0 - skinExitFresnel), skinScattering
);
reflectedLight.directDiffuse += skinDiffuseIrradiance * BRDF_Lambert( material.diffuseContribution );
`));
  };
  material.customProgramCacheKey = () => "skin-rest-triplanar-v7-filtered-tone";
}
