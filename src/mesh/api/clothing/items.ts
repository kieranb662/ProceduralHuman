export const CLOTHING_ITEMS = {
  torso: { none: "None", shirt: "Shirt body", cropped: "Cropped top" },
  arms: { none: "None", short: "Short sleeves", long: "Long sleeves" },
  legs: { none: "None", shorts: "Shorts", trousers: "Trousers" },
  feet: { none: "Bare feet", wraps: "Open-toe foot wraps" },
} as const;

export type ClothingSlot = keyof typeof CLOTHING_ITEMS;
export type ClothingItem<S extends ClothingSlot = ClothingSlot> = keyof (typeof CLOTHING_ITEMS)[S];
/** Item per clothing slot; omitted slots are empty ("none"). */
export type Outfit = { [S in ClothingSlot]?: ClothingItem<S> };

/** Complete outfits; omitted slots are empty. */
export const OUTFIT_PRESETS = {
  base: { label: "Base body", outfit: {} },
  casual: { label: "Casual", outfit: { torso: "shirt", arms: "short", legs: "shorts" } },
  long: { label: "Long outfit", outfit: { torso: "shirt", arms: "long", legs: "trousers", feet: "wraps" } },
} as const satisfies Record<string, { label: string; outfit: Outfit }>;
