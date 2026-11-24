import * as THREE from "three";
import { createParkMillerRng } from "../../shared/random.js";
import { defaultCanvasFactory } from "./canvas.js";

// 512x512 procedural eye texture
export function makeEyeTexture(createCanvas = defaultCanvasFactory) {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const c = createCanvas(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;

  const rand = createParkMillerRng(4219);

  const scleraGrad = ctx.createRadialGradient(cx, cy, 96, cx, cy, 265);
  scleraGrad.addColorStop(0.0, "#f5f2eb");
  scleraGrad.addColorStop(0.62, "#ede6dc");
  scleraGrad.addColorStop(0.86, "#d9bfb7");
  scleraGrad.addColorStop(1.0, "#b88d86");
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  for (let v = 0; v < 28; v++) {
    const baseA = rand() * Math.PI * 2;
    let r = 250;
    let a = baseA;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    for (let step = 0; step < 6; step++) {
      r -= 16 + rand() * 10;
      a += (rand() - 0.5) * 0.14;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.strokeStyle = `rgba(176, 86, 82, ${0.07 + rand() * 0.08})`;
    ctx.lineWidth = 0.7 + rand() * 0.8;
    ctx.stroke();
  }
  ctx.restore();

  const irisR = 104;
  const pupilR = 40;
  const irisGrad = ctx.createRadialGradient(cx, cy, pupilR * 0.85, cx, cy, irisR);
  irisGrad.addColorStop(0.0, "#1c110a");
  irisGrad.addColorStop(0.28, "#58351c");
  irisGrad.addColorStop(0.68, "#7c4e2a");
  irisGrad.addColorStop(0.86, "#3b2313");
  irisGrad.addColorStop(0.95, "#19100b");
  irisGrad.addColorStop(1.0, "rgba(25, 16, 11, 0)");
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, irisR * 0.94, 0, Math.PI * 2);
  ctx.clip();

  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + (rand() - 0.5) * 0.03;
    const rIn = pupilR + rand() * 10;
    const rOut = irisR * (0.76 + rand() * 0.18);
    const bright = rand() > 0.42;
    ctx.strokeStyle = bright
      ? `rgba(182, 128, 72, ${0.14 + rand() * 0.24})`
      : `rgba(32, 18, 10, ${0.18 + rand() * 0.22})`;
    ctx.lineWidth = 0.8 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
    const midA = a + (rand() - 0.5) * 0.04;
    const midR = (rIn + rOut) * 0.5;
    ctx.quadraticCurveTo(
      cx + Math.cos(midA) * midR,
      cy + Math.sin(midA) * midR,
      cx + Math.cos(a) * rOut,
      cy + Math.sin(a) * rOut
    );
    ctx.stroke();
  }

  ctx.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const cr = pupilR + 14 + Math.sin(a * 9) * 3.5 + (rand() - 0.5) * 4.5;
    const px = cx + Math.cos(a) * cr;
    const py = cy + Math.sin(a) * cr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(198, 138, 68, 0.38)";
  ctx.lineWidth = 2.6;
  ctx.stroke();

  const topShade = ctx.createLinearGradient(cx, cy - irisR, cx, cy + 10);
  topShade.addColorStop(0.0, "rgba(10, 8, 8, 0.42)");
  topShade.addColorStop(0.55, "rgba(10, 8, 8, 0.08)");
  topShade.addColorStop(1.0, "rgba(10, 8, 8, 0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(cx - irisR, cy - irisR, irisR * 2, irisR * 2);
  ctx.restore();

  const pupilGrad = ctx.createRadialGradient(cx, cy, pupilR * 0.72, cx, cy, pupilR + 3);
  pupilGrad.addColorStop(0.0, "#050404");
  pupilGrad.addColorStop(0.85, "#090707");
  pupilGrad.addColorStop(1.0, "rgba(9, 7, 7, 0)");
  ctx.fillStyle = pupilGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, pupilR + 3, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
