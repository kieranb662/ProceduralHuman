import { defineConfig } from "tsdown";

// One entry per published subpath. `three` (and its addons) is a peer dependency and is never bundled.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "humans/index": "src/humans/index.ts",
    editor: "src/editor.ts",
    ui: "src/ui.ts",
  },
  format: "esm",
  target: "es2022",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  minify: false,
  clean: true,
  external: [/^three($|\/)/],
});
