import * as THREE from "three";
import { buildGeometryFromArrays } from "../geometry/attributes.js";
import { handLayout } from "../../../rigging/api/hand-layout.js";
import { normalizeAndPackWeights } from "../../../rigging/api/skin-weights.js";

// Palm sheets branch into open digit loops; all skin junctions share body indices.
export function buildJointedHand(rig, side, s, surface) {
  const { boneIndex } = rig;
  const hl = handLayout(s);
  const bi = (n) => boneIndex.get(n);
  const iHand = bi(`Hand_${side}`);
  const pk = (arr) => normalizeAndPackWeights(arr);
  const parts = [];
  const { addVertex, point, triangle, wrist } = surface;
  const { pHand, palmDir, palmNormal, across } = hl;
  const faces = [];
  const emit = (a, b, c, outward) => {
    const normal = point(b).sub(point(a)).cross(point(c).sub(point(a)));
    if (normal.dot(outward) < 0) [b, c] = [c, b];
    faces.push([a, b, c]);
  };
  const centerOf = (loop) => loop.reduce((p, i) => p.add(point(i)), new THREE.Vector3()).divideScalar(loop.length);
  const stitch = (a, b) => {
    const center = centerOf(a).add(centerOf(b)).multiplyScalar(0.5);
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      const ai = a[i % a.length], bj = b[j % b.length];
      if (j === b.length || (i < a.length && (i + 1) / a.length <= (j + 1) / b.length)) {
        const next = a[++i % a.length];
        emit(ai, next, bj, point(ai).add(point(next)).add(point(bj)).divideScalar(3).sub(center));
      } else {
        const next = b[++j % b.length];
        emit(ai, next, bj, point(ai).add(point(next)).add(point(bj)).divideScalar(3).sub(center));
      }
    }
  };
  const alignLoop = (loop, reference, tangent) => {
    const center = centerOf(loop);
    const orientation = (ring) => point(ring[1]).sub(point(ring[0]))
      .cross(point(ring[0]).sub(center)).dot(tangent);
    if (orientation(loop) * orientation(reference) < 0) loop.reverse();
    const first = reference[0], target = point(first);
    let nearest = 0;
    loop.forEach((v, i) => { if (point(v).distanceToSquared(target) < point(loop[nearest]).distanceToSquared(target)) nearest = i; });
    return [...loop.slice(nearest), ...loop.slice(0, nearest)];
  };
  const digitPairs = (names, t) => {
    const anchors = [0, 0.46, 0.76];
    return names.map((name, j) => {
      const left = j ? THREE.MathUtils.smoothstep(t, anchors[j] - 0.12, anchors[j] + 0.12) : 1;
      const right = j < 2 ? 1 - THREE.MathUtils.smoothstep(t, anchors[j + 1] - 0.12, anchors[j + 1] + 0.12) : 1;
      return [bi(name), left * right];
    });
  };
  const digitWeight = (names, t) => pk(digitPairs(names, t));
  const iThumb = bi(`Thumb_${side}`);
  const sheets = [[], []], thenarWeight = new Map();
  const cols = 22, rows = 10;
  for (let face = 0; face < 2; face++) {
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      sheets[face][r] = [];
      for (let c = 0; c <= cols; c++) {
        const q = c / cols * 2 - 1;
        const width = THREE.MathUtils.lerp(0.032, 0.036667, Math.sin(t * Math.PI / 2));
        const fi = Math.min(3, Math.floor(c / 6));
        const f = hl.fingers[3 - fi];
        const end = f.base - 0.010;
        const depth = 0.017 * (1 - 0.35 * t) * Math.sqrt(1 - 0.65 * q * q);
        const thenar = Math.exp(-(((q - 0.55) / 0.40) ** 2) - ((t - 0.42) / 0.30) ** 2) * 0.005;
        const p = pHand.clone().addScaledVector(palmDir, 0.010 + (end - 0.010) * t)
          .addScaledVector(across, width * q)
          .addScaledVector(palmNormal, (face ? -1 : 1) * depth + (face ? 0 : thenar));
        const fingerInfluence = 0.18 * THREE.MathUtils.smoothstep(t, 0.78, 1);
        // Thenar/first-web skin follows the thumb metacarpal part-way so the CMC saddle stays smooth.
        const thenarInfluence = (face ? 0.22 : 0.34) * THREE.MathUtils.smoothstep(q, 0.30, 1)
          * Math.exp(-(((t - 0.45) / 0.30) ** 2));
        sheets[face][r].push(addVertex(p, pk([[iHand, 1 - fingerInfluence - thenarInfluence],
          [bi(`${f.name}1_${side}`), fingerInfluence], [iThumb, thenarInfluence]])));
        thenarWeight.set(sheets[face][r].at(-1), thenarInfluence);
      }
    }
  }
  for (let face = 0; face < 2; face++) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = sheets[face][r], b = sheets[face][r + 1];
      const n = palmNormal.clone().multiplyScalar(face ? -1 : 1);
      emit(a[c], a[c + 1], b[c], n);
      emit(a[c + 1], b[c + 1], b[c], n);
    }
  }
  for (const c of [0, cols]) for (let r = 0; r < rows; r++) {
    // Leave the radial border open for the thumb's carpometacarpal saddle.
    if (c === cols && r >= 1 && r < 8) continue;
    const a = sheets[0][r][c], b = sheets[0][r + 1][c];
    const d = sheets[1][r][c], e = sheets[1][r + 1][c];
    const n = across.clone().multiplyScalar(c ? 1 : -1);
    if (r < rows - 1) {
      emit(a, b, d, n);
      emit(b, e, d, n);
    }
  }
  const proximal = [...sheets[0][0], ...sheets[1][0].slice().reverse()];
  stitch(wrist, alignLoop(proximal, wrist, palmDir));
  const top = sheets[0][rows], bottom = sheets[1][rows];
  const mids = new Map();
  for (const c of [0, 4, 6, 10, 12, 16, 18, 22]) {
    // Outer palm edges are rounded, not boxed: bulge the side midpoints so the index/pinky tubes meet them smoothly.
    const bulge = c === 0 || c === cols ? across.clone().multiplyScalar(c ? 0.0026 : -0.0026) : new THREE.Vector3();
    mids.set(c, addVertex(point(top[c]).add(point(bottom[c])).multiplyScalar(0.5).add(bulge), pk([[iHand, 0.8],
      [bi(`${hl.fingers[3 - Math.min(3, Math.floor(c / 6))].name}1_${side}`), 0.2]])));
  }
  for (const c of [0, cols]) {
    const a = sheets[0][rows - 1][c], d = sheets[1][rows - 1][c];
    const n = across.clone().multiplyScalar(c ? 1 : -1);
    emit(a, top[c], mids.get(c), n);
    emit(a, mids.get(c), d, n);
    emit(d, mids.get(c), bottom[c], n);
  }
  for (const c of [4, 5, 10, 11, 16, 17]) {
    const a = top[c], b = top[c + 1], d = bottom[c], e = bottom[c + 1];
    if (mids.has(c)) {
      emit(a, b, mids.get(c), palmDir);
      emit(mids.get(c), b, d, palmDir);
      emit(d, b, e, palmDir);
    } else {
      emit(a, b, d, palmDir);
      emit(d, b, mids.get(c + 1), palmDir);
      emit(d, mids.get(c + 1), e, palmDir);
    }
  }
  // Nail plates follow the dorsal skin profile (skinRadius(v)) and sit ~0.4 mm proud of it,
  // with a pale lunula at the base and a whiter free edge.
  const addNail = (start, dir, skinRadius, length, bone, weightAt, padNormal = palmNormal) => {
    const lateral = new THREE.Vector3().crossVectors(dir, padNormal).normalize();
    const dorsal = new THREE.Vector3().crossVectors(dir, lateral).normalize();
    const p = [], uv = [], col = [], si = [], sw = [], ix = [];
    for (let r = 0; r <= 8; r++) for (let c = 0; c <= 10; c++) {
      const u = c / 10 * 2 - 1, v = r / 8;
      const radius = skinRadius(v);
      const x = radius * 0.70 * u * (0.86 + 0.14 * Math.sin(Math.min(1, v * 1.4) * Math.PI / 2));
      const height = radius * 0.86 * Math.sqrt(Math.max(0, 1 - (x / radius) ** 2));
      const pos = start.clone().addScaledVector(dir, length * v)
        .addScaledVector(lateral, x)
        .addScaledVector(dorsal, height + 0.0004 * (1 - 0.6 * u * u));
      p.push(pos.x, pos.y, pos.z);
      uv.push(c / 10, v);
      const shade = v > 0.86 ? 1.12 : (v < 0.18 ? 1.04 : 0.93);
      col.push(shade, shade, shade);
      const weight = weightAt(v);
      si.push(...weight.indices); sw.push(...weight.weights);
    }
    for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) {
      const a = r * 11 + c, b = a + 1, d = a + 11, e = d + 1;
      const va = new THREE.Vector3().fromArray(p, a * 3);
      const n = new THREE.Vector3().fromArray(p, b * 3).sub(va)
        .cross(new THREE.Vector3().fromArray(p, d * 3).sub(va));
      ix.push(...(n.dot(dorsal) > 0 ? [a, b, d, b, e, d] : [a, d, b, b, d, e]));
    }
    parts.push({ geo: buildGeometryFromArrays(p, uv, col, si, sw, ix), mat: 11, tag: `nail_${side}_${bone}` });
  };
  const growDigit = (opening, centers, radii, weights, dir) => {
    let previous = opening;
    const lateral = new THREE.Vector3().crossVectors(dir, palmNormal).normalize();
    const dorsal = new THREE.Vector3().crossVectors(lateral, dir).normalize();
    const segs = 20;
    for (let r = 0; r < centers.length; r++) {
      let ring = Array.from({ length: segs }, (_, j) => {
        const angle = j / segs * Math.PI * 2;
        const p = centers[r].clone().addScaledVector(lateral, Math.cos(angle) * radii[r])
          .addScaledVector(dorsal, Math.sin(angle) * radii[r] * 0.86);
        return addVertex(p, weights[r]);
      });
      ring = alignLoop(ring, previous, dir);
      stitch(previous, ring);
      previous = ring;
    }
    const tip = addVertex(centers.at(-1).clone().addScaledVector(dir, 0.0012), weights.at(-1));
    for (let j = 0; j < previous.length; j++) emit(previous[j], previous[(j + 1) % previous.length], tip, dir);
  };
  for (let fi = 0; fi < 4; fi++) {
    const f = hl.fingers[3 - fi], c = fi * 6;
    const opening = [...top.slice(c, c + 5), mids.get(c + 4),
      ...bottom.slice(c, c + 5).reverse(), mids.get(c)];
    const ts = [0, 0.07, 0.16, 0.27, 0.37, 0.43, 0.46, 0.49, 0.55, 0.65, 0.73, 0.76, 0.79, 0.85, 0.91, 0.96, 0.985, 1];
    const names = [1, 2, 3].map((j) => `${f.name}${j}_${side}`);
    const centers = ts.map((t) => f.P.clone().addScaledVector(f.dir, f.L * t));
    const fingerRadius = (t) => {
      const knuckles = 0.10 * Math.exp(-(((t - 0.46) / 0.055) ** 2))
        + 0.06 * Math.exp(-(((t - 0.76) / 0.045) ** 2));
      return f.rad * (1 - 0.25 * t + knuckles) * (t > 0.91 ? Math.sqrt(Math.max(0.015, 1 - ((t - 0.91) / 0.092) ** 2)) : 1);
    };
    const radii = ts.map(fingerRadius);
    growDigit(opening, centers, radii, ts.map((t) => t < 0.1
      ? pk([[iHand, 0.40 * (1 - t / 0.1)], [bi(names[0]), 0.60 + 0.40 * t / 0.1]])
      : digitWeight(names, t)), f.dir);
    addNail(f.P.clone().addScaledVector(f.dir, f.L * 0.80), f.dir, (v) => fingerRadius(0.80 + v * 0.16), f.L * 0.16, bi(names[2]),
      (v) => digitWeight(names, 0.80 + v * 0.16));
  }
  const thumbOpening = [...sheets[0].slice(1, 9).map((r) => r[cols]),
    ...sheets[1].slice(1, 9).reverse().map((r) => r[cols])];
  const { tStart, tMid, tJ3, tTip } = hl.thumb;
  const thumbNames = [`Thumb_${side}`, `Thumb2_${side}`, `Thumb3_${side}`];
  // Thumb skeleton polyline (t: 0 CMC, 0.46 MCP, 0.76 IP, 1 tip). Rings sit perpendicular to the
  // local bone, blending direction across each joint, so knuckles don't shear when they flex.
  const thumbSegDirs = [[tStart, tMid], [tMid, tJ3], [tJ3, tTip]].map(([a, b]) => b.clone().sub(a).normalize());
  const thumbCenter = (t) => t <= 0.46 ? tStart.clone().lerp(tMid, t / 0.46)
    : t <= 0.76 ? tMid.clone().lerp(tJ3, (t - 0.46) / 0.30) : tJ3.clone().lerp(tTip, (t - 0.76) / 0.24);
  // Pronation ramps in along the metacarpal so the web joins the palm untwisted, reaching the
  // rig's hinge frame (hl.thumb.hingeNormals) by the MCP.
  const thumbFrame = (t) => {
    const dir = thumbSegDirs[0].clone().lerp(thumbSegDirs[1], THREE.MathUtils.smoothstep(t, 0.40, 0.52))
      .lerp(thumbSegDirs[2], THREE.MathUtils.smoothstep(t, 0.70, 0.82)).normalize();
    const radial = across.clone().addScaledVector(dir, -across.dot(dir)).normalize();
    const roll = hl.thumb.pronation * THREE.MathUtils.smoothstep(t, 0.30, 0.46);
    const pad = palmNormal.clone().multiplyScalar(Math.cos(roll)).addScaledVector(radial, -Math.sin(roll)).normalize();
    const lateral = new THREE.Vector3().crossVectors(dir, pad).normalize();
    return { dir, lateral, palmar: new THREE.Vector3().crossVectors(lateral, dir).normalize() };
  };
  // Half-widths: broad MCP and IP knuckles, a slimmer proximal phalanx, a wide distal pad, rounded tip.
  const thumbRadius = (t) => 0.0118 * (1 - 0.22 * t
    - 0.05 * Math.exp(-(((t - 0.62) / 0.07) ** 2)) + 0.05 * Math.exp(-(((t - 0.46) / 0.05) ** 2))
    + 0.04 * Math.exp(-(((t - 0.76) / 0.04) ** 2)) + 0.04 * Math.exp(-(((t - 0.87) / 0.05) ** 2)))
    * (t > 0.9 ? Math.sqrt(Math.max(0.015, 1 - ((t - 0.9) / 0.103) ** 2)) : 1);
  const THUMB_FLAT = 0.82;
  const thumbRingPoint = (t, angle, scale = 1) => {
    const { lateral, palmar } = thumbFrame(t), r = thumbRadius(t) * scale;
    // Fleshy palmar pulp under the distal phalanx.
    const pad = Math.sin(angle) > 0 ? 1 + 0.10 * Math.sin(angle) * THREE.MathUtils.smoothstep(t, 0.78, 0.86) : 1;
    return thumbCenter(t).addScaledVector(lateral, Math.cos(angle) * r).addScaledVector(palmar, Math.sin(angle) * r * THUMB_FLAT * pad);
  };
  const thumbTubeWeight = (t, hand) => pk([[iHand, hand], ...digitPairs(thumbNames, t).map(([b, w]) => [b, w * (1 - hand)])]);
  // Thenar / first-web bridge: loft the long radial palm opening into the thumb's first ring over
  // several rows, ramping skin from Hand to Thumb so abduction fans the web instead of pinching it.
  const T0 = 0.40, LOFT = 6;
  const f0 = thumbFrame(T0), c0 = thumbCenter(T0), cOpen = centerOf(thumbOpening);
  const lengths = thumbOpening.map((v, j) => point(v).distanceTo(point(thumbOpening[(j + 1) % thumbOpening.length])));
  const perimeter = lengths.reduce((a, b) => a + b, 0);
  const proximalSign = Math.sign(point(thumbOpening[0]).sub(point(thumbOpening[7])).dot(f0.lateral)) || 1;
  let walked = -lengths.at(-1) / 2;
  const loftAngles = thumbOpening.map((_, j) => {
    const u = (j ? (walked += lengths[j - 1]) : (walked += lengths.at(-1) / 2, 0)) / perimeter;
    return proximalSign > 0 ? u * Math.PI * 2 : Math.PI - u * Math.PI * 2;
  });
  let previous = thumbOpening;
  for (let k = 1; k <= LOFT; k++) {
    const e = k / LOFT;
    const center = cOpen.clone().lerp(c0, e);
    const row = thumbOpening.map((v, j) => {
      const target = thumbRingPoint(T0, loftAngles[j]);
      const p = point(v).lerp(target, e);
      // Slight convexity so the bridge reads as muscle (thenar) and web, not a flat fin.
      p.add(p.clone().sub(center).multiplyScalar(0.07 * Math.sin(Math.PI * e)));
      const thumbW = THREE.MathUtils.lerp(thenarWeight.get(v), 0.86, e);
      return addVertex(p, pk([[iHand, 1 - thumbW], [iThumb, thumbW]]));
    });
    stitch(previous, row);
    previous = row;
  }
  const thumbTs = [0.43, 0.46, 0.49, 0.53, 0.60, 0.67, 0.72, 0.76, 0.80, 0.85, 0.90, 0.94, 0.97, 0.99, 1];
  const THUMB_SEGS = 20;
  for (const t of thumbTs) {
    const hand = 0.14 * Math.max(0, 1 - (t - T0) / 0.12);
    let ring = Array.from({ length: THUMB_SEGS }, (_, j) => addVertex(thumbRingPoint(t, j / THUMB_SEGS * Math.PI * 2), thumbTubeWeight(t, hand)));
    ring = alignLoop(ring, previous, thumbFrame(t).dir);
    stitch(previous, ring);
    previous = ring;
  }
  const thumbTip = addVertex(thumbCenter(1).addScaledVector(thumbFrame(1).dir, 0.0012), thumbTubeWeight(1, 0));
  for (let j = 0; j < previous.length; j++) emit(previous[j], previous[(j + 1) % previous.length], thumbTip, thumbFrame(1).dir);
  const thumbNailStart = 0.76 + 0.24 * 0.18, thumbNailSpan = 0.24 * 0.56;
  addNail(tJ3.clone().lerp(tTip, 0.18), tTip.clone().sub(tJ3).normalize(), (v) => thumbRadius(thumbNailStart + v * thumbNailSpan) * THUMB_FLAT / 0.86,
    tTip.distanceTo(tJ3) * 0.56, bi(thumbNames[2]), (v) => digitWeight(thumbNames, thumbNailStart + v * thumbNailSpan), hl.thumb.hingeNormals[2]);
  // A concave thumb web has no radial "outward"; propagate the palm's winding
  // across shared edges instead of guessing a normal at the saddle.
  const edges = new Map(), adjacent = faces.map(() => []);
  faces.forEach((face, f) => face.forEach((a, j) => {
    const b = face[(j + 1) % 3], key = `${Math.min(a, b)},${Math.max(a, b)}`;
    const prior = edges.get(key);
    if (prior) {
      const same = prior.a === a;
      adjacent[f].push([prior.f, same]);
      adjacent[prior.f].push([f, same]);
    } else edges.set(key, { f, a });
  }));
  const flips = new Map([[0, false]]), queue = [0];
  for (let i = 0; i < queue.length; i++) {
    const f = queue[i];
    for (const [next, same] of adjacent[f]) {
      const flip = flips.get(f) !== same;
      if (flips.has(next)) {
        if (flips.get(next) !== flip) throw new Error(`Non-orientable hand surface: ${side}.`);
      } else {
        flips.set(next, flip);
        queue.push(next);
      }
    }
  }
  if (flips.size !== faces.length) throw new Error(`Disconnected hand surface: ${side}.`);
  faces.forEach(([a, b, c], f) => triangle(a, flips.get(f) ? c : b, flips.get(f) ? b : c, `hands_${side}`));
  return parts;
}
