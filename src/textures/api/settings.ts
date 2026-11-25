/** Tunables for the procedural textures and skin shader. */
export const DEFAULT_TEXTURE_SETTINGS = {
  skinDetail: 1, skinColorVariation: 1, skinRoughnessVariation: 1,
  skinPoreDepth: 1, skinScattering: 0.35, skinThicknessScale: 1,
  shirtContrast: 0.28, shortsContrast: 0.34, hairContrast: 1,
  skinTileSize: 0.064, shirtRepeatX: 10, shirtRepeatY: 10,
  shortsRepeatX: 10, shortsRepeatY: 10, hairRepeatX: 10, hairRepeatY: 3,
};

export type TextureSettings = typeof DEFAULT_TEXTURE_SETTINGS;

/** Merges overrides onto the defaults and validates the ranges the shaders depend on. */
export function resolveTextureSettings(overrides: Partial<TextureSettings> = {}): TextureSettings {
  const textureSettings = { ...DEFAULT_TEXTURE_SETTINGS, ...overrides };
  if (!Number.isFinite(textureSettings.skinTileSize) || textureSettings.skinTileSize <= 0) {
    throw new RangeError("palette.textures.skinTileSize must be a positive finite size in meters.");
  }
  for (const [key, min, max] of <[keyof TextureSettings, number, number][]>[
    ["skinPoreDepth", 0, 2], ["skinScattering", 0, 1], ["skinThicknessScale", 0.25, 4],
  ]) {
    if (!Number.isFinite(textureSettings[key]) || textureSettings[key] < min || textureSettings[key] > max) {
      throw new RangeError(`palette.textures.${key} must be between ${min} and ${max}.`);
    }
  }
  return textureSettings;
}
