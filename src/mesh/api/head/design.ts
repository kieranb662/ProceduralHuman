import type { HeadDesign } from "./types.js";

// --- 2E. Sculpted Deformable Head, Oral Cavity, Eyes, Eyelids, Ears, Brows & Hair ---
export function headTargetTags(target: string): string[] {
  const tags: Record<string, string[]> = {
    all: ["head", "eye_L", "eye_R", "lidTop_L", "lidTop_R", "lidBot_L", "lidBot_R", "brow_L", "brow_R", "ear_L", "ear_R", "teethTop", "teethBot", "cavity", "tongue", "hair"],
    skin: ["head", "cavity", "tongue"], eyes: ["eye_L", "eye_R", "lidTop_L", "lidTop_R", "lidBot_L", "lidBot_R"],
    lidTop: ["lidTop_L", "lidTop_R"], lidBot: ["lidBot_L", "lidBot_R"],
    brows: ["brow_L", "brow_R"], ears: ["ear_L", "ear_R"],
    hair: ["hair"], teeth: ["teethTop", "teethBot"], cavity: ["cavity", "tongue"],
  };
  if (!tags[target]) throw new Error(`Unknown head part: ${target}`);
  return tags[target];
}

export function validateHeadDesign(design: HeadDesign): void {
  if (!design || typeof design !== "object" ||
      !design.transforms || typeof design.transforms !== "object" || Array.isArray(design.transforms) ||
      !design.features || typeof design.features !== "object" || Array.isArray(design.features) || !Array.isArray(design.strokes)) {
    throw new Error("Head design must contain transforms, features, and strokes.");
  }
  for (const [target, transform] of Object.entries(design.transforms)) {
    headTargetTags(target);
    if (!transform || typeof transform !== "object" || Array.isArray(transform) ||
        Object.keys(transform).some((key) => !["sx", "sy", "sz", "x", "y", "z"].includes(key))) {
      throw new Error(`Invalid head transform: ${target}`);
    }
    for (const key of ["sx", "sy", "sz", "x", "y", "z"] as const) {
      if (transform[key] !== undefined && (!Number.isFinite(transform[key]) || (key.startsWith("s") && transform[key] <= 0))) {
        throw new Error(`Invalid head transform: ${target}.${key}`);
      }
    }
  }
  const featureKeys = ["forehead", "noseWidth", "noseTip", "cheeks", "jawWidth", "chin", "lips"];
  for (const [key, value] of Object.entries(design.features)) {
    if (!featureKeys.includes(key) || !Number.isFinite(value)) throw new Error(`Invalid head contour: ${key}`);
  }
  for (const stroke of design.strokes) {
    if (!stroke || typeof stroke !== "object") throw new Error("Invalid procedural head brush stroke.");
    headTargetTags(stroke.target);
    if (!["raise", "lower", "move", "smooth"].includes(stroke.mode) ||
        !Number.isFinite(stroke.radius) || stroke.radius <= 0 ||
        !Number.isFinite(stroke.strength) || stroke.strength < 0 || stroke.strength > 1 ||
        ![stroke.center, stroke.delta].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) ||
        typeof stroke.mirror !== "boolean" || (stroke.mirrorX !== undefined && !Number.isFinite(stroke.mirrorX))) {
      throw new Error("Invalid procedural head brush stroke.");
    }
  }
}
