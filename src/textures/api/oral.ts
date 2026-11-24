import { smoothstep } from "../../shared/math.js";
import { defaultCanvasFactory, finish, mk } from "./canvas.js";
import { fbm, hash2 } from "./noise.js";

/** Enamel (teeth) or mucosa (gums/tongue) microdetail. */
export function makeOralTextures(enamel, createCanvas = defaultCanvasFactory) {
  const S = 256, col = mk(S, createCanvas), bmp = mk(S, createCanvas);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x) * 4;
      const noise = fbm(u, v, 12, 3, 71) - 0.5;
      const grain = hash2(x, y, 72);
      if (enamel) {
        const neck = smoothstep(0.55, 1, v);
        const striation = Math.sin(u * Math.PI * 64) * 0.7;
        col.img.data.set([248 + noise * 5 - neck * 12, 245 + noise * 5 - neck * 17, 233 + noise * 4 - neck * 23, 255], i);
        const h = 128 + noise * 4 + striation;
        bmp.img.data.set([h, h, h, 255], i);
      } else {
        const papilla = Math.max(0, grain - 0.72) * 55;
        col.img.data.set([190 + noise * 18 + papilla * 0.35, 91 + noise * 12 + papilla * 0.25, 102 + noise * 12 + papilla * 0.25, 255], i);
        const h = 128 + noise * 9 + papilla;
        bmp.img.data.set([h, h, h, 255], i);
      }
    }
  }
  return { map: finish(col, true, [1, 1]), bump: finish(bmp, false, [1, 1]) };
}
