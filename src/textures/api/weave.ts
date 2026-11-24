import { rgb } from "../../shared/color.js";
import { defaultCanvasFactory, finish, mk } from "./canvas.js";
import { fbm } from "./noise.js";

// Fabric: plain weave threads with fuzz + bump
export function makeWeaveTextures(hex, contrast, repeat, createCanvas = defaultCanvasFactory) {
  const S = 256, col = mk(S, createCanvas), bmp = mk(S, createCanvas), [R, G, B] = rgb(hex);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const t = ((x >> 1) + (y >> 1)) & 1;
      const ph = (((t ? y : x) % 4) + 0.5) / 4;
      const th = Math.sin(ph * Math.PI);
      const fuzz = fbm(x / S, y / S, 48, 2, 3) - 0.5;
      const k = 1 - contrast + contrast * (th + fuzz * 0.6);
      col.img.data.set([R * k, G * k, B * k, 255], i);
      const h = 255 * (th * 0.8 + fuzz * 0.4);
      bmp.img.data.set([h, h, h, 255], i);
    }
  }
  return { map: finish(col, true, repeat), bump: finish(bmp, false, repeat) };
}
