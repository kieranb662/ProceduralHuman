import { createAdultMaleCharacter } from "../resources/procedural-human.js";

/**
 * Ready-to-use procedural character presets demonstrating how to generate
 * distinct character archetypes from the base procedural generator.
 */
export const CHARACTER_PRESETS = {
  defaultCasual: {
    palette: {
      skin: "#c68b59",
      shirt: "#2e5a88",
      shorts: "#4a4e4d",
      hair: "#241c18",
    },
    outfit: { torso: "shirt", arms: "short", legs: "shorts", feet: "none" },
  },

  athleticRunner: {
    palette: {
      skin: "#d89c70",
      shirt: "#e11d48",
      shorts: "#1e293b",
      hair: "#3b2818",
      textures: {
        skinRoughnessVariation: 1.35,
        skinScattering: 0.4,
      },
    },
    torsoDetails: {
      pectorals: { enabled: true, depth: 24, width: 102 },
      collarbones: { enabled: true, depth: 12, sharpness: 65 },
      abdominals: { enabled: true, depth: 18, width: 96 },
      buttocks: { enabled: true, depth: 46, width: 98, cleft: 24 },
    },
    headDesign: {
      transforms: {
        all: { sx: 0.97, sy: 1.02, sz: 0.99 },
      },
      features: {
        cheeks: -2.0,
        jawWidth: 2.5,
        chin: 2.0,
        noseTip: 1.5,
      },
      strokes: [],
    },
    outfit: { torso: "cropped", arms: "none", legs: "shorts", feet: "wraps" },
  },

  heavyBrawler: {
    palette: {
      skin: "#b5784a",
      shirt: "#334155",
      shorts: "#1f2937",
      hair: "#14110f",
    },
    torsoDetails: {
      pectorals: { enabled: true, depth: 36, width: 120 },
      collarbones: { enabled: true, depth: 8, sharpness: 35 },
      abdominals: { enabled: true, depth: 12, width: 118 },
      buttocks: { enabled: true, depth: 56, width: 115, cleft: 25 },
    },
    headDesign: {
      transforms: {
        all: { sx: 1.07, sy: 0.97, sz: 1.04 },
        brows: { sy: 1.2, z: 1.5 },
      },
      features: {
        forehead: 3.0,
        noseWidth: 3.5,
        cheeks: 4.0,
        jawWidth: 6.5,
        chin: 4.5,
        lips: 1.5,
      },
      strokes: [],
    },
    outfit: { torso: "none", arms: "none", legs: "trousers", feet: "wraps" },
  },

  elderScholar: {
    palette: {
      skin: "#dfb191",
      shirt: "#475569",
      shorts: "#334155",
      hair: "#cbd5e1",
      textures: {
        skinDetail: 1.45,
        skinPoreDepth: 1.5,
        skinColorVariation: 1.3,
      },
    },
    torsoDetails: {
      pectorals: { enabled: false, depth: 12, width: 95 },
      collarbones: { enabled: true, depth: 14, sharpness: 75 },
      abdominals: { enabled: false, depth: 8, width: 95 },
      buttocks: { enabled: true, depth: 36, width: 94, cleft: 20 },
    },
    headDesign: {
      transforms: {
        all: { sx: 0.96, sy: 1.03, sz: 0.98 },
        ears: { sx: 1.08, sy: 1.12, sz: 1.05 },
      },
      features: {
        forehead: 2.5,
        noseTip: 4.0,
        noseWidth: 1.5,
        cheeks: -4.5,
        jawWidth: -2.5,
        chin: 1.5,
        lips: -2.0,
      },
      strokes: [],
    },
    outfit: { torso: "shirt", arms: "long", legs: "trousers", feet: "wraps" },
  },

  stealthOperative: {
    palette: {
      skin: "#7a4b2a",
      shirt: "#0f172a",
      shorts: "#1e293b",
      hair: "#090a0f",
    },
    torsoDetails: {
      pectorals: { enabled: true, depth: 25, width: 104 },
      collarbones: { enabled: true, depth: 10, sharpness: 55 },
      abdominals: { enabled: true, depth: 16, width: 100 },
      buttocks: { enabled: true, depth: 44, width: 100, cleft: 23 },
    },
    headDesign: {
      transforms: {
        all: { sx: 1.0, sy: 1.01, sz: 1.0 },
      },
      features: {
        jawWidth: 2.0,
        chin: 1.5,
        lips: 2.0,
      },
      strokes: [],
    },
    outfit: { torso: "shirt", arms: "long", legs: "trousers", feet: "wraps" },
  },
};

/**
 * Instantiate a character from a named preset with optional deep overrides.
 */
export function createCharacterFromPreset(presetName = "defaultCasual", overrides = {}) {
  const base = CHARACTER_PRESETS[presetName];
  if (!base) {
    throw new Error(`Unknown character preset "${presetName}". Available: ${Object.keys(CHARACTER_PRESETS).join(", ")}`);
  }
  return createAdultMaleCharacter({
    ...base,
    ...overrides,
    palette: {
      ...base.palette,
      ...overrides.palette,
      textures: {
        ...base.palette?.textures,
        ...overrides.palette?.textures,
      },
    },
    torsoDetails: {
      ...base.torsoDetails,
      ...overrides.torsoDetails,
    },
    headDesign: overrides.headDesign ?? base.headDesign,
    outfit: {
      ...base.outfit,
      ...overrides.outfit,
    },
  });
}
