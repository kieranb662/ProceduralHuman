import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Vec3Tuple } from "../../shared/vector.js";

export interface DirectionalLightSettings {
  color: string;
  intensity: number;
  /** World position; the light points at the origin. */
  position: Vec3Tuple;
}

/** Serializable settings for the three-point studio rig. */
export interface StudioLightingSettings {
  /** scene.environmentIntensity for the PMREM room environment. */
  environmentIntensity: number;
  hemisphere: { skyColor: string; groundColor: string; intensity: number };
  key: DirectionalLightSettings & { castShadow: boolean };
  rim: DirectionalLightSettings;
}

const defaults: StudioLightingSettings = {
  environmentIntensity: 0.65,
  hemisphere: { skyColor: "#dbeafe", groundColor: "#1e293b", intensity: 0.45 },
  key: { color: "#fff5e8", intensity: 2.0, position: [2.8, 4.5, 3.2], castShadow: true },
  rim: { color: "#7dd3fc", intensity: 0.85, position: [-2.5, 2.8, -2.8] },
};
export const DEFAULT_STUDIO_LIGHTING: Readonly<StudioLightingSettings> = Object.freeze(defaults);

export type StudioLightingChanges = {
  environmentIntensity?: number;
  hemisphere?: Partial<StudioLightingSettings["hemisphere"]>;
  key?: Partial<StudioLightingSettings["key"]>;
  rim?: Partial<StudioLightingSettings["rim"]>;
};

function merge(base: StudioLightingSettings, changes: StudioLightingChanges = {}): StudioLightingSettings {
  return {
    environmentIntensity: changes.environmentIntensity ?? base.environmentIntensity,
    hemisphere: { ...base.hemisphere, ...changes.hemisphere },
    key: { ...base.key, ...changes.key, position: [...(changes.key?.position ?? base.key.position)] as Vec3Tuple },
    rim: { ...base.rim, ...changes.rim, position: [...(changes.rim?.position ?? base.rim.position)] as Vec3Tuple },
  };
}

/** Azimuth (degrees around +Y from +Z), elevation (degrees above the ground) and distance of a light position. */
export function lightPositionToAngles([x, y, z]: Vec3Tuple) {
  const distance = Math.hypot(x, y, z);
  return {
    azimuth: THREE.MathUtils.radToDeg(Math.atan2(x, z)),
    elevation: THREE.MathUtils.radToDeg(Math.asin(distance ? y / distance : 0)),
    distance,
  };
}

export function anglesToLightPosition(azimuth: number, elevation: number, distance: number): Vec3Tuple {
  const az = THREE.MathUtils.degToRad(azimuth), el = THREE.MathUtils.degToRad(elevation);
  return [Math.sin(az) * Math.cos(el) * distance, Math.sin(el) * distance, Math.cos(az) * Math.cos(el) * distance];
}

/**
 * The studio rig the character was lit and tuned under: soft hemisphere fill, a shadow-casting
 * warm key light framed on a ~1.8 m figure, and a cool rim light. Add `group` to the scene and,
 * with a renderer, call `attachEnvironment(scene, renderer)` for image-based reflections.
 */
export function createStudioLighting(initial: StudioLightingChanges = {}) {
  let settings = merge(DEFAULT_STUDIO_LIGHTING as StudioLightingSettings, initial);
  const group = new THREE.Group();
  group.name = "StudioLighting";

  const hemisphere = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.camera.left = -1.8;
  key.shadow.camera.right = 1.8;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -0.3;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.028;
  const rim = new THREE.DirectionalLight();
  group.add(hemisphere, key, rim);

  let environmentScene: THREE.Scene | null = null;
  let environmentTarget: THREE.WebGLRenderTarget | null = null;

  function apply() {
    hemisphere.color.set(settings.hemisphere.skyColor);
    hemisphere.groundColor.set(settings.hemisphere.groundColor);
    hemisphere.intensity = settings.hemisphere.intensity;
    for (const [light, s] of [[key, settings.key], [rim, settings.rim]] as const) {
      light.color.set(s.color);
      light.intensity = s.intensity;
      light.position.set(...s.position);
    }
    key.castShadow = settings.key.castShadow;
    if (environmentScene) environmentScene.environmentIntensity = settings.environmentIntensity;
  }
  apply();

  return {
    group, hemisphere, key, rim,
    get settings(): StudioLightingSettings { return merge(settings); },
    /** Merges partial changes (e.g. from the lighting editor) and updates the lights. */
    setSettings(changes: StudioLightingChanges) {
      settings = merge(settings, changes);
      apply();
    },
    /** Generates the room environment map and assigns it to scene.environment. */
    attachEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      environmentTarget?.dispose();
      environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
      pmrem.dispose();
      scene.environment = environmentTarget.texture;
      environmentScene = scene;
      apply();
    },
    dispose() {
      group.removeFromParent();
      key.dispose();
      rim.dispose();
      hemisphere.dispose();
      environmentTarget?.dispose();
      if (environmentScene && environmentScene.environment === environmentTarget?.texture) environmentScene.environment = null;
    },
  };
}

export type StudioLighting = ReturnType<typeof createStudioLighting>;
