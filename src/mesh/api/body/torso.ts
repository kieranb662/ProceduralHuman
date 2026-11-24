import * as THREE from "three";
import { smoothstep } from "../../../shared/math.js";

export const TORSO_DETAILS = {
  pectorals: { label: "Pectoral muscles", enabled: false, sliders: [
    ["depth", "Projection (mm)", 0, 38, 1, 23],
    ["width", "Width (%)", 75, 125, 1, 100],
  ] },
  collarbones: { label: "Collarbones", enabled: false, sliders: [
    ["depth", "Relief (mm)", 0, 17, 1, 10],
    ["sharpness", "Sharpness (%)", 0, 100, 1, 50],
  ] },
  abdominals: { label: "Abdominal muscles", enabled: false, sliders: [
    ["depth", "Relief (mm)", 0, 24, 1, 14],
    ["width", "Width (%)", 75, 125, 1, 100],
  ] },
  buttocks: { label: "Buttocks", enabled: true, sliders: [
    ["depth", "Fullness (mm)", 0, 65, 1, 44],
    ["width", "Width (%)", 70, 135, 1, 100],
    ["cleft", "Cleft depth (mm)", 0, 30, 1, 23],
  ] },
};

export interface TorsoDetails {
  pectorals: { enabled: boolean; depth: number; width: number };
  collarbones: { enabled: boolean; depth: number; sharpness: number };
  abdominals: { enabled: boolean; depth: number; width: number };
  buttocks: { enabled: boolean; depth: number; width: number; cleft: number };
}
export type TorsoDetailChanges = { [K in keyof TorsoDetails]?: Partial<TorsoDetails[K]> };

/** Merges validated changes onto current (or default) torso details. Throws on unknown keys or out-of-range values. */
export function configureTorsoDetails(current: TorsoDetails | null = null, changes: TorsoDetailChanges = {}): TorsoDetails {
  for (const [key, values] of Object.entries(changes)) {
    if (!Object.hasOwn(TORSO_DETAILS, key) || !values || typeof values !== "object" || Array.isArray(values)) {
      throw new Error(`Invalid torso detail: ${key}.`);
    }
    for (const [name, value] of Object.entries(values)) {
      const slider = TORSO_DETAILS[key].sliders.find(([id]) => id === name);
      if (name === "enabled" ? typeof value !== "boolean"
        : !slider || !Number.isFinite(value) || value < slider[2] || value > slider[3]) {
        throw new Error(`Invalid torso detail parameter: ${key}.${name}.`);
      }
    }
  }
  return Object.fromEntries(Object.entries(TORSO_DETAILS).map(([key, { enabled, sliders }]) => [
    key, { enabled, ...Object.fromEntries(sliders.map(([name, , , , , value]) => [name, value])),
      ...current?.[key], ...changes[key] },
  ])) as unknown as TorsoDetails;
}

export function sculptTorso(geo, rest, { pectorals, collarbones, abdominals, buttocks }: TorsoDetails) {
  const pos = geo.attributes.position;
  const bell = (t) => Math.exp(-(t ** 2));
  const taper = (v, lo, start, end, hi) => smoothstep(lo, start, v) * (1 - smoothstep(end, hi, v));
  for (let i = 0; i < rest.length; i += 3) {
    const x = Math.abs(rest[i]), y = rest[i + 1], z = rest[i + 2];
    let dz = 0;
    if (z > 0.015 && y > 0.98 && y < 1.51) {
      const front = smoothstep(0.015, 0.085, z);
      if (pectorals.enabled) {
        const u = (x - 0.087) / (0.068 * pectorals.width / 100);
        const v = y - (1.326 + 0.20 * (x - 0.087));
        const plate = bell(u) * bell(v / (v < 0 ? 0.044 : 0.064));
        const lowerEdge = bell(u) * bell((v + 0.046) / 0.015);
        dz += pectorals.depth * (plate - 0.28 * lowerEdge)
          * taper(x, 0, 0.028, 0.118, 0.176) * taper(y, 1.22, 1.27, 1.38, 1.443);
      }
      if (collarbones.enabled) {
        const along = THREE.MathUtils.clamp((x - 0.016) / 0.138, 0, 1);
        const ridgeY = 1.445 + 0.022 * along + 0.007 * Math.sin(along * Math.PI);
        const ridgeWidth = THREE.MathUtils.lerp(0.022, 0.009, collarbones.sharpness / 100);
        const ridge = bell((y - ridgeY) / ridgeWidth);
        const hollow = bell((y - ridgeY + 0.031) / 0.018);
        dz += collarbones.depth * (ridge - 0.60 * hollow)
          * taper(x, 0, 0.027, 0.124, 0.167) * taper(y, 1.39, 1.42, 1.475, 1.51);
      }
      if (abdominals.enabled) {
        const w = abdominals.width / 100;
        const centerX = THREE.MathUtils.lerp(0.042, 0.051, smoothstep(1.05, 1.24, y)) * w;
        const pair = bell((x - centerX) / (0.039 * w)) * smoothstep(0, 0.022 * w, x);
        const separations = bell((y - 1.126 - 0.12 * x) / 0.013)
          + bell((y - 1.196 - 0.09 * x) / 0.013);
        dz += abdominals.depth * pair * (1 - 0.75 * separations)
          * taper(y, 0.98, 1.079, 1.239, 1.283) * (1 - smoothstep(0.09 * w, 0.13 * w, x));
      }
      dz *= front;
    } else if (buttocks.enabled && z < -0.015 && y > 0.825 && y < 1.075) {
      const rear = smoothstep(0.015, 0.102, -z);
      const w = buttocks.width / 100;
      const fullness = bell((y - 0.935) / 0.063) * taper(y, 0.825, 0.89, 0.99, 1.075);
      const cheeks = bell((x - 0.077 * w) / (0.060 * w));
      const cleft = bell(x / 0.019);
      dz -= rear * fullness * (buttocks.depth * cheeks - buttocks.cleft * cleft);
    }
    pos.array[i + 2] = z + dz * 0.001;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.boundingBox = geo.boundingSphere = null;
}
