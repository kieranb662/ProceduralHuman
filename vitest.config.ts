import { defineConfig } from "vitest/config";

// Library tests run headless in Node, independent of the demo's Vite root.
export default defineConfig({
  test: { root: ".", include: ["test/**/*.test.ts"], environment: "node", testTimeout: 60_000 },
});
