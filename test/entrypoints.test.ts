import { describe, expect, it } from "vitest";

// Every published entry point must import cleanly in Node (no DOM access at import time).
describe("entry points", () => {
  it.each(["../src/index.ts", "../src/editor.ts", "../src/ui.ts", "../src/humans/index.ts"])(
    "%s imports without side effects",
    async (path) => {
      await expect(import(path)).resolves.toBeTypeOf("object");
    },
  );
});
