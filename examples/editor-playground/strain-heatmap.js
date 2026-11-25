import * as THREE from "three";

const VARYINGS = `
varying vec3 vStrainRest;
varying vec3 vStrainPosed;
`;

const HEATMAP = `
vec3 strainColor() {
  vec3 restX = dFdx(vStrainRest);
  vec3 restY = dFdy(vStrainRest);
  vec3 posedX = dFdx(vStrainPosed);
  vec3 posedY = dFdy(vStrainPosed);
  float restXX = dot(restX, restX);
  float restXY = dot(restX, restY);
  float restYY = dot(restY, restY);
  float restDet = restXX * restYY - restXY * restXY;
  vec3 normal = cross(posedX, posedY);
  float normalLength = length(normal);
  float shade = 0.55;
  if (normalLength > 1e-12) {
    shade += 0.45 * abs(dot(normal / normalLength, normalize(vec3(0.35, 0.8, 1.0))));
  }
  vec3 blue = vec3(0.015, 0.06, 0.65);
  if (restDet <= max(restXX * restYY * 1e-6, 1e-30)) return blue * shade;

  // Generalized eigenvalues of the posed and rest surface metrics are squared principal stretches.
  float posedXX = dot(posedX, posedX);
  float posedXY = dot(posedX, posedY);
  float posedYY = dot(posedY, posedY);
  float trace = max((restYY * posedXX - 2.0 * restXY * posedXY + restXX * posedYY) / restDet, 0.0);
  float determinant = max(posedXX * posedYY - posedXY * posedXY, 0.0) / restDet;
  float largest = 0.5 * (trace + sqrt(max(trace * trace - 4.0 * determinant, 0.0)));
  float smallest = largest > 1e-12 ? determinant / largest : 0.0;
  float strain = max(abs(sqrt(largest) - 1.0), abs(sqrt(smallest) - 1.0));
  float heat = clamp(strain * 2.0, 0.0, 1.0);
  vec3 cyan = vec3(0.0, 0.8, 1.0);
  vec3 yellow = vec3(1.0, 0.8, 0.0);
  vec3 red = vec3(0.9, 0.015, 0.0);
  if (heat < 0.333333) return mix(blue, cyan, heat * 3.0) * shade;
  if (heat < 0.666667) return mix(cyan, yellow, (heat - 0.333333) * 3.0) * shade;
  return mix(yellow, red, (heat - 0.666667) * 3.0) * shade;
}
`;

function replaceChunk(shader, chunk, replacement) {
  if (!shader.includes(chunk)) throw new Error(`Strain heatmap requires shader chunk ${chunk}.`);
  return shader.replace(chunk, replacement);
}

/** Overlays the animated mesh without replacing its materials or modifying its geometry. */
export function createStrainHeatmap(mesh) {
  const material = new THREE.MeshBasicMaterial({
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = VARYINGS + replaceChunk(shader.vertexShader, "#include <skinning_vertex>", `
      #include <skinning_vertex>
      vStrainRest = position;
      vStrainPosed = transformed;
    `);
    shader.fragmentShader = VARYINGS + HEATMAP + replaceChunk(shader.fragmentShader, "#include <color_fragment>", `
      #include <color_fragment>
      diffuseColor.rgb = strainColor();
    `);
  };
  material.customProgramCacheKey = () => "strain-heatmap-v1";

  const overlay = new THREE.SkinnedMesh(mesh.geometry, material);
  overlay.name = "StrainHeatmap";
  overlay.frustumCulled = false;
  overlay.visible = false;
  overlay.raycast = () => {};
  overlay.bind(mesh.skeleton, mesh.bindMatrix);
  mesh.add(overlay);

  function update() {
    if (!overlay.visible) return;
    overlay.geometry = mesh.geometry;
    overlay.skeleton = mesh.skeleton;
    overlay.bindMode = mesh.bindMode;
    overlay.bindMatrix.copy(mesh.bindMatrix);
    overlay.morphTargetInfluences = mesh.morphTargetInfluences;
    overlay.morphTargetDictionary = mesh.morphTargetDictionary;
    overlay.layers.mask = mesh.layers.mask;
    overlay.renderOrder = mesh.renderOrder + 1;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Draw over the solid mesh, but behind its wireframe lines when both views are enabled.
    const offset = materials.every((item) => item.wireframe) ? 1 : -1;
    material.polygonOffsetFactor = offset;
    material.polygonOffsetUnits = offset;
  }

  return {
    get enabled() { return overlay.visible; },
    set enabled(enabled) {
      overlay.visible = enabled;
      update();
    },
    update,
  };
}
