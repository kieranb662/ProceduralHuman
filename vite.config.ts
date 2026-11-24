import { defineConfig } from "vite";
import { resolve } from "node:path";

// Unpublished demo app. Pages import the library straight from src/.
export default defineConfig({
  root: "examples",
  resolve: {
    alias: { "@kieranb662/procedural-human": resolve(__dirname, "src") },
  },
  build: {
    outDir: resolve(__dirname, "dist-demo"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "default-male": resolve(__dirname, "examples/default-male/index.html"),
        "editor-playground": resolve(__dirname, "examples/editor-playground/index.html"),
      },
    },
  },
});
