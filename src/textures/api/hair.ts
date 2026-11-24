import { rgb } from "../../shared/color.js";
import { defaultCanvasFactory, finish, mk } from "./canvas.js";
import { vnoise } from "./noise.js";

// Hair: strand streaks running along V
export function makeHairTextures(hex, textureSettings, createCanvas = defaultCanvasFactory) {
  const S = 256, col = mk(S, createCanvas), bmp = mk(S, createCanvas), [R, G, B] = rgb(hex);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x) * 4;
      const s = vnoise(u * 96, v * 3, 96, 8) * 0.7 + vnoise(u * 24, v * 2, 24, 2) * 0.3;
      const k = 1.2 + ((0.55 + s * 0.9) * 1.2 - 1.2) * textureSettings.hairContrast;
      col.img.data.set([R * k, G * k, B * k, 255], i);
      const h = 128 + (s * 255 - 128) * textureSettings.hairContrast;
      bmp.img.data.set([h, h, h, 255], i);
    }
  }
  const repeat = [textureSettings.hairRepeatX, textureSettings.hairRepeatY];
  return { map: finish(col, true, repeat, true), bump: finish(bmp, false, repeat, true) };
}
