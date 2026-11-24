import * as THREE from "three";

export type TextureCanvas = HTMLCanvasElement | OffscreenCanvas;
/** Creates a square canvas of the given pixel size. Supply one to run outside a browser page (Workers, SSR, tests). */
export type CanvasFactory = (size: number) => TextureCanvas;

export const defaultCanvasFactory: CanvasFactory = (size) => {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  throw new Error("No canvas implementation available: pass a createCanvas factory.");
};

/** A canvas plus its 2D context and a writable ImageData buffer. */
export const mk = (S, createCanvas: CanvasFactory = defaultCanvasFactory) => {
  const c = createCanvas(S);
  const x = c.getContext("2d") as CanvasRenderingContext2D;
  return { c, x, img: x.createImageData(S, S) };
};

/** Uploads a canvas buffer into a repeating THREE.CanvasTexture. */
export const finish = (o, srgb, rep, mirror = false) => {
  o.x.putImageData(o.img, 0, 0);
  const t = new THREE.CanvasTexture(o.c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8;
  return t;
};
