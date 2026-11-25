import type { CanvasFactory } from "../../src/index.js";

/** A no-op 2D canvas so characters can be generated in Node: every context call is a chainable no-op. */
export const stubCanvas: CanvasFactory = (size) => {
  const noop: any = new Proxy(function () {}, { get: () => noop, apply: () => noop });
  const ctx = new Proxy({}, {
    get: (_, key) => key === "createImageData"
      ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
      : noop,
    set: () => true,
  });
  return { width: size, height: size, getContext: () => ctx } as unknown as HTMLCanvasElement;
};
