import type { TextureSettings } from "./settings.js";
import { rgb } from "../../shared/color.js";
import { type CanvasFactory, defaultCanvasFactory, finish, mk } from "./canvas.js";
import { fbm, hash2 } from "./noise.js";

// Only microdetail tiles; broad tone variation is evaluated in rest-space below.
export function makeSkinTextures(hex: string, textureSettings: TextureSettings, createCanvas: CanvasFactory = defaultCanvasFactory) {
  const S = 1024, col = mk(S, createCanvas), bmp = mk(S, createCanvas), [R, G, B] = rgb(hex);
  const poreHeight = new Float32Array(S * S);
  const cells = 112;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (hash2(cx, cy, 41) > 0.88) continue;
      const px = (cx + 0.1 + hash2(cx, cy, 42) * 0.8) * S / cells;
      const py = (cy + 0.1 + hash2(cx, cy, 43) * 0.8) * S / cells;
      const rx = (0.7 + hash2(cx, cy, 44) * 0.8) * S / 512;
      const ry = rx * (0.55 + hash2(cx, cy, 45) * 0.45);
      const angle = hash2(cx, cy, 46) * Math.PI * 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const depth = 14 + hash2(cx, cy, 47) * 18;
      const radius = Math.ceil(rx * 1.5);
      // Wrap stamps across tile edges; the same pore spans both sides of the seam.
      for (let y = Math.floor(py) - radius; y <= Math.ceil(py) + radius; y++) {
        for (let x = Math.floor(px) - radius; x <= Math.ceil(px) + radius; x++) {
          const dx = x + 0.5 - px, dy = y + 0.5 - py;
          const u = (dx * cos + dy * sin) / rx;
          const v = (-dx * sin + dy * cos) / ry;
          const r2 = u * u + v * v;
          if (r2 >= 2.25) continue;
          const depression = Math.pow(Math.max(0, 1 - r2), 2);
          const rim = Math.exp(-Math.pow((Math.sqrt(r2) - 1.05) / 0.18, 2)) * 0.06;
          const i = ((y + S) % S) * S + (x + S) % S;
          poreHeight[i] += depth * (rim - depression);
        }
      }
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x) * 4;
      const fine = fbm(u, v, 64, 2, 17) - 0.5;
      const wr = fbm(u, v, 24, 3, 23) - 0.5;
      const detail = textureSettings.skinDetail;
      const k = 1 + (fine * 0.012 + poreHeight[y * S + x] * 0.00015) * detail;
      col.img.data.set([R * k, G * k, B * k, 255], i);
      const h = 128 + (fine * 12 + wr * 4 + poreHeight[y * S + x] * textureSettings.skinPoreDepth) * detail;
      bmp.img.data.set([h, h, h, 255], i);
    }
  }
  return { map: finish(col, true, [1, 1]), bump: finish(bmp, false, [1, 1]) };
}
