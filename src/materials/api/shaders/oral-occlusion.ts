/**
 * Deep oral surfaces are occluded: scale specular/clearcoat by the baked vertex-colour depth
 * so the throat stays dark instead of catching the key light.
 */
import type * as THREE from "three";

export function applyOralOcclusion(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <aomap_fragment>", `#include <aomap_fragment>
            #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
              float oralOcclusion = clamp((max(vColor.r, max(vColor.g, vColor.b)) - 0.04) * 2.4, 0.0, 1.0);
              reflectedLight.directSpecular *= oralOcclusion;
              reflectedLight.indirectSpecular *= oralOcclusion;
              #ifdef USE_CLEARCOAT
                clearcoatSpecularDirect *= oralOcclusion;
                clearcoatSpecularIndirect *= oralOcclusion;
              #endif
            #endif`);
  };
}
