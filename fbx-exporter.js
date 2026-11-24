/*
 * fbx-exporter.js — Binary FBX 7.4 export for the procedural human.
 *
 * Produces a single .fbx with:
 *   - A Mixamo-named humanoid skeleton (mixamorig:Hips ... fingers, toes), core bones only.
 *   - The body (incl. hair, eyes, teeth, mouth) and any equipped clothing as skinned meshes,
 *     re-posed into a T-pose that is also the bind pose.
 *   - FACS morph targets as FBX blendshapes on the body mesh.
 *   - Albedo textures baked from the procedural shaders into fresh UV atlases, embedded in the file.
 *   - Centimetre units, Y-up, character facing +Z (Mixamo / Unity / Unreal / Godot / Blender friendly).
 *
 * Plain script (works from file:// too). Load it with <script src="fbx-exporter.js"></script>, then:
 *
 *   const { blob, filename, report } =
 *     await ProceduralHumanFBX.exportCharacterFBX(THREE, character, { renderer });
 *
 * `character` is the object returned by createAdultMaleCharacter(). `THREE` is the same three.js
 * module the character was built with. Passing the page's WebGLRenderer avoids a second GL context.
 *
 * Options:
 *   renderer        WebGLRenderer used for texture baking (a temporary one is created if omitted)
 *   pose            "tpose" (default) or "bind" (keep the authored A-pose)
 *   includeClothing true (default) — export equipped clothing meshes
 *   blendShapes     true (default) — export facial morph targets
 *   bakeTextures    true (default) — bake and embed albedo textures
 *   textureScale    1 (default) — multiplier on the per-material texture sizes
 *   imageType       "image/png" (default) or "image/jpeg"
 *   filename        output name (default "ProceduralHuman.fbx")
 *   onProgress      (message) => void
 */
(function (root) {
  "use strict";

  // =====================================================================================
  // 1. Binary FBX encoder
  // =====================================================================================

  const FBX_VERSION = 7400;
  const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
  const HEAD_MAGIC = new Uint8Array([...ascii("Kaydara FBX Binary  "), 0x00, 0x1a, 0x00]);
  // Fixed FileId / CreationTime pair and footer bytes accepted by the Autodesk SDK (same values Blender writes).
  const FILE_ID = new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]);
  const CREATION_TIME = "1970-01-01 10:00:00:000";
  const FOOT_ID = new Uint8Array([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
  const FOOT_MAGIC = new Uint8Array([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);
  const NULL_RECORD = new Uint8Array(13);
  const ARRAY_TYPES = new Set(["i", "d", "f", "l", "b"]);
  const utf8 = new TextEncoder();

  class ByteWriter {
    constructor(capacity = 1 << 20) {
      this.buf = new Uint8Array(capacity);
      this.view = new DataView(this.buf.buffer);
      this.pos = 0;
    }
    ensure(n) {
      if (this.pos + n <= this.buf.length) return;
      let cap = this.buf.length * 2;
      while (cap < this.pos + n) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.pos));
      this.buf = next;
      this.view = new DataView(next.buffer);
    }
    u8(v) { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; }
    i16(v) { this.ensure(2); this.view.setInt16(this.pos, v, true); this.pos += 2; }
    i32(v) { this.ensure(4); this.view.setInt32(this.pos, v, true); this.pos += 4; }
    u32(v) { this.ensure(4); this.view.setUint32(this.pos, v, true); this.pos += 4; }
    f32(v) { this.ensure(4); this.view.setFloat32(this.pos, v, true); this.pos += 4; }
    f64(v) { this.ensure(8); this.view.setFloat64(this.pos, v, true); this.pos += 8; }
    i64(v) { this.ensure(8); this.view.setBigInt64(this.pos, BigInt(v), true); this.pos += 8; }
    bytes(arr) { this.ensure(arr.length); this.buf.set(arr, this.pos); this.pos += arr.length; }
    patchU32(at, v) { this.view.setUint32(at, v, true); }
    result() { return this.buf.slice(0, this.pos); }
  }

  // Property constructors. Arrays are typed arrays; L values are BigInt-compatible.
  const P = {
    C: (v) => ({ t: "C", v }),
    Y: (v) => ({ t: "Y", v }),
    I: (v) => ({ t: "I", v }),
    F: (v) => ({ t: "F", v }),
    D: (v) => ({ t: "D", v }),
    L: (v) => ({ t: "L", v: BigInt(v) }),
    S: (v) => ({ t: "S", v: String(v) }),
    R: (v) => ({ t: "R", v }),
    i: (a) => ({ t: "i", v: a instanceof Int32Array ? a : Int32Array.from(a) }),
    d: (a) => ({ t: "d", v: a instanceof Float64Array ? a : Float64Array.from(a) }),
  };
  const N = (name, props = [], children = []) => ({ name, props, children });

  function writeProp(w, p) {
    w.u8(p.t.charCodeAt(0));
    switch (p.t) {
      case "C": w.u8(p.v ? 1 : 0); break;
      case "Y": w.i16(p.v); break;
      case "I": w.i32(p.v); break;
      case "F": w.f32(p.v); break;
      case "D": w.f64(p.v); break;
      case "L": w.i64(p.v); break;
      case "S":
      case "R": {
        const bytes = p.t === "S" ? utf8.encode(p.v) : p.v;
        w.u32(bytes.length);
        w.bytes(bytes);
        break;
      }
      default: {
        if (!ARRAY_TYPES.has(p.t)) throw new Error(`Unknown FBX property type ${p.t}`);
        const raw = new Uint8Array(p.v.buffer, p.v.byteOffset, p.v.byteLength);
        w.u32(p.v.length);
        if (p.zip) {
          w.u32(1);
          w.u32(p.zip.length);
          w.bytes(p.zip);
        } else {
          w.u32(0);
          w.u32(raw.length);
          w.bytes(raw);
        }
      }
    }
  }

  function writeNode(w, node, isLast) {
    const start = w.pos;
    w.u32(0); // end offset, patched below
    w.u32(node.props.length);
    w.u32(0); // property list length, patched below
    const name = utf8.encode(node.name);
    w.u8(name.length);
    w.bytes(name);
    const propStart = w.pos;
    for (const p of node.props) writeProp(w, p);
    w.patchU32(start + 8, w.pos - propStart);
    if (node.children.length) {
      node.children.forEach((child, i) => writeNode(w, child, i === node.children.length - 1));
      w.bytes(NULL_RECORD);
    } else if (!node.props.length && !isLast) {
      w.bytes(NULL_RECORD);
    }
    w.patchU32(start, w.pos);
  }

  async function zlibDeflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function compressArrays(nodes) {
    if (typeof CompressionStream === "undefined") return;
    const jobs = [];
    const visit = (node) => {
      for (const p of node.props) if (ARRAY_TYPES.has(p.t) && p.v.byteLength > 512) jobs.push(p);
      node.children.forEach(visit);
    };
    nodes.forEach(visit);
    await Promise.all(jobs.map(async (p) => {
      p.zip = await zlibDeflate(new Uint8Array(p.v.buffer, p.v.byteOffset, p.v.byteLength));
    }));
  }

  /** Encodes a list of top-level FBX nodes as a binary FBX 7.4 file. */
  async function encodeFBX(nodes, { compress = true } = {}) {
    if (compress) await compressArrays(nodes);
    const w = new ByteWriter();
    w.bytes(HEAD_MAGIC);
    w.u32(FBX_VERSION);
    nodes.forEach((node, i) => writeNode(w, node, i === nodes.length - 1));
    w.bytes(NULL_RECORD);
    w.bytes(FOOT_ID);
    w.bytes(new Uint8Array(4));
    let pad = ((w.pos + 15) & ~15) - w.pos;
    if (pad === 0) pad = 16;
    w.bytes(new Uint8Array(pad));
    w.u32(FBX_VERSION);
    w.bytes(new Uint8Array(120));
    w.bytes(FOOT_MAGIC);
    return w.result();
  }

  // Properties70 helpers.
  const nm = (name, cls) => `${name}\x00\x01${cls}`;
  const p70 = (...entries) => N("Properties70", [], entries);
  const pInt = (n, v) => N("P", [P.S(n), P.S("int"), P.S("Integer"), P.S(""), P.I(v)]);
  const pBool = (n, v) => N("P", [P.S(n), P.S("bool"), P.S(""), P.S(""), P.I(v ? 1 : 0)]);
  const pEnum = (n, v) => N("P", [P.S(n), P.S("enum"), P.S(""), P.S(""), P.I(v)]);
  const pDouble = (n, v) => N("P", [P.S(n), P.S("double"), P.S("Number"), P.S(""), P.D(v)]);
  const pNumberA = (n, v) => N("P", [P.S(n), P.S("Number"), P.S(""), P.S("A"), P.D(v)]);
  const pColorRGB = (n, r, g, b) => N("P", [P.S(n), P.S("ColorRGB"), P.S("Color"), P.S(""), P.D(r), P.D(g), P.D(b)]);
  const pColorA = (n, r, g, b) => N("P", [P.S(n), P.S("Color"), P.S(""), P.S("A"), P.D(r), P.D(g), P.D(b)]);
  const pString = (n, v, sub = "") => N("P", [P.S(n), P.S("KString"), P.S(sub), P.S(""), P.S(v)]);
  const pTime = (n, v) => N("P", [P.S(n), P.S("KTime"), P.S("Time"), P.S(""), P.L(v)]);
  const pLcl = (n, x, y, z) => N("P", [P.S(n), P.S(n), P.S(""), P.S("A"), P.D(x), P.D(y), P.D(z)]);

  const translationMatrix = (x, y, z) => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

  // =====================================================================================
  // 2. Mixamo skeleton mapping and T-pose solve
  // =====================================================================================

  const MIXAMO_PREFIX = "mixamorig:";
  const FINGERS = ["Index", "Middle", "Ring", "Pinky"];
  const SIDES = [["L", "Left", 1], ["R", "Right", -1]];

  /** Core humanoid bones in Mixamo naming, parents before children. `src` is the procedural rig bone. */
  function mixamoSkeletonSpec() {
    const spec = [];
    const add = (name, src, parent, end = false) => spec.push({ name, src, parent, end });
    add("Hips", "Hips", null);
    add("Spine", "Spine", "Hips");
    add("Spine1", "Spine1", "Spine");
    add("Spine2", "Chest", "Spine1");
    add("Neck", "Neck", "Spine2");
    add("Head", "Head", "Neck");
    add("HeadTop_End", null, "Head", true);
    for (const [s, Side] of SIDES) {
      add(`${Side}Shoulder`, `Clavicle_${s}`, "Spine2");
      add(`${Side}Arm`, `UpperArm_${s}`, `${Side}Shoulder`);
      add(`${Side}ForeArm`, `Forearm_${s}`, `${Side}Arm`);
      add(`${Side}Hand`, `Hand_${s}`, `${Side}ForeArm`);
      [`Thumb_${s}`, `Thumb2_${s}`, `Thumb3_${s}`].forEach((src, i) =>
        add(`${Side}HandThumb${i + 1}`, src, i ? `${Side}HandThumb${i}` : `${Side}Hand`));
      add(`${Side}HandThumb4`, null, `${Side}HandThumb3`, true);
      for (const f of FINGERS) {
        for (let j = 1; j <= 3; j++) {
          add(`${Side}Hand${f}${j}`, `${f}${j}_${s}`, j === 1 ? `${Side}Hand` : `${Side}Hand${f}${j - 1}`);
        }
        add(`${Side}Hand${f}4`, null, `${Side}Hand${f}3`, true);
      }
    }
    for (const [s, Side] of SIDES) {
      add(`${Side}UpLeg`, `Thigh_${s}`, "Hips");
      add(`${Side}Leg`, `Shin_${s}`, `${Side}UpLeg`);
      add(`${Side}Foot`, `Foot_${s}`, `${Side}Leg`);
      add(`${Side}ToeBase`, `Toe_${s}`, `${Side}Foot`);
      add(`${Side}Toe_End`, null, `${Side}ToeBase`, true);
    }
    return spec;
  }

  /**
   * For each procedural bone index, the core bones (and fractions) that inherit its skin weights.
   * Stripped bones fall back to their nearest kept ancestor. The Deltoid helper took half of the
   * upper arm's rotation, so its weight is split between shoulder and arm to keep that blend.
   */
  function buildWeightRedirect(bones, spec) {
    const bySrc = new Map(spec.filter((b) => b.src).map((b) => [b.src, b.name]));
    const special = {};
    for (const [s, Side] of SIDES) special[`Deltoid_${s}`] = [[`${Side}Shoulder`, 0.5], [`${Side}Arm`, 0.5]];
    return bones.map((bone) => {
      if (special[bone.name]) return special[bone.name];
      let b = bone;
      while (b && b.isBone && !bySrc.has(b.name)) b = b.parent;
      return [[b && b.isBone ? bySrc.get(b.name) : "Hips", 1]];
    });
  }

  /**
   * Bind-space (mesh-local) position of every skeleton bone, from the bind inverses.
   * Uses inverse(bindMatrix), not mesh.bindMatrixInverse: in three's default "attached" bind mode
   * bindMatrixInverse tracks the mesh's *current* world matrix, so it moves as the character walks.
   */
  function bindPositions(THREE, mesh) {
    const out = new Map();
    const m = new THREE.Matrix4();
    const toMeshLocal = mesh.bindMatrix.clone().invert();
    mesh.skeleton.bones.forEach((bone, i) => {
      m.copy(mesh.skeleton.boneInverses[i]).invert().premultiply(toMeshLocal);
      out.set(bone.name, new THREE.Vector3().setFromMatrixPosition(m));
    });
    return out;
  }

  /**
   * World-space pose for the core bones. In T-pose mode the upper arm, forearm and hand are each
   * rotated (shortest arc) to point straight along ±X, which also leaves the palms facing down.
   */
  function solvePose(THREE, spec, srcPos, mode) {
    const missing = spec.filter((b) => b.src && !srcPos.has(b.src)).map((b) => b.src);
    if (missing.length) throw new Error(`Rig is missing bones needed for export: ${missing.join(", ")}`);
    const explicit = new Map();
    if (mode === "tpose") {
      for (const [s, Side, x] of SIDES) {
        const target = new THREE.Vector3(x, 0, 0);
        const seg = (a, b) => srcPos.get(b).clone().sub(srcPos.get(a)).normalize();
        explicit.set(`${Side}Arm`, new THREE.Quaternion().setFromUnitVectors(seg(`UpperArm_${s}`, `Forearm_${s}`), target));
        explicit.set(`${Side}ForeArm`, new THREE.Quaternion().setFromUnitVectors(seg(`Forearm_${s}`, `Hand_${s}`), target));
        explicit.set(`${Side}Hand`, new THREE.Quaternion().setFromUnitVectors(seg(`Hand_${s}`, `Middle1_${s}`), target));
      }
    }
    const bind = new Map(), pos = new Map(), rot = new Map();
    for (const b of spec) {
      if (b.end) continue;
      const bp = srcPos.get(b.src);
      bind.set(b.name, bp.clone());
      if (!b.parent) {
        pos.set(b.name, bp.clone());
        rot.set(b.name, new THREE.Quaternion());
        continue;
      }
      const parentRot = rot.get(b.parent);
      pos.set(b.name, bp.clone().sub(bind.get(b.parent)).applyQuaternion(parentRot).add(pos.get(b.parent)));
      rot.set(b.name, explicit.get(b.name) ?? parentRot.clone());
    }
    return { bind, pos, rot };
  }

  /** Places the unweighted *_End leaf bones once the posed mesh is known. */
  function placeEndBones(THREE, spec, pose, headTopY) {
    const byName = new Map(spec.map((b) => [b.name, b]));
    for (const b of spec) {
      if (!b.end) continue;
      const parent = pose.pos.get(b.parent);
      const grand = pose.pos.get(byName.get(b.parent).parent);
      let p;
      if (b.name === "HeadTop_End") {
        p = new THREE.Vector3(parent.x, Math.max(headTopY, parent.y + 0.1), parent.z);
      } else if (b.name.endsWith("Toe_End")) {
        const dir = parent.clone().sub(grand);
        dir.y = 0;
        p = parent.clone().addScaledVector(dir.normalize(), 0.06);
      } else {
        p = parent.clone().add(parent.clone().sub(grand).multiplyScalar(0.8));
      }
      pose.pos.set(b.name, p);
      pose.rot.set(b.name, pose.rot.get(b.parent).clone());
    }
  }

  // =====================================================================================
  // 3. Mesh extraction, weight remap, re-posing and morph targets
  // =====================================================================================

  const comp = (attr, i, k) => (k === 0 ? attr.getX(i) : k === 1 ? attr.getY(i) : k === 2 ? attr.getZ(i) : attr.getW(i));

  function extractMesh(THREE, mesh, name, ctx) {
    const geo = mesh.geometry;
    const index = geo.index;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const total = index ? index.count : pos.count;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const getIndex = index ? (k) => index.getX(k) : (k) => k;

    // Triangles per material; clothing-covered body triangles are degenerate and dropped.
    const triSrc = [], triMat = [];
    for (const g of groups) {
      const material = mats[g.materialIndex ?? 0];
      if (!material) continue;
      const end = Math.min(g.start + g.count, total);
      for (let k = g.start; k + 2 < end; k += 3) {
        const a = getIndex(k), b = getIndex(k + 1), c = getIndex(k + 2);
        if (a === b || b === c || a === c) continue;
        triSrc.push(a, b, c);
        triMat.push(material);
      }
    }
    if (!triSrc.length) return null;

    const remap = new Int32Array(pos.count).fill(-1);
    const src = [];
    const tris = new Int32Array(triSrc.length);
    triSrc.forEach((v, i) => {
      if (remap[v] < 0) { remap[v] = src.length; src.push(v); }
      tris[i] = remap[v];
    });
    const n = src.length;

    // Skin weights → core bones, top 4, normalized.
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const redirect = buildWeightRedirect(mesh.skeleton.bones, ctx.spec);
    const wIdx = new Int32Array(n * 4), wVal = new Float32Array(n * 4);
    const acc = new Map();
    for (let i = 0; i < n; i++) {
      const v = src[i];
      acc.clear();
      for (let k = 0; k < 4; k++) {
        const w = comp(sw, v, k);
        if (!(w > 0)) continue;
        for (const [target, f] of redirect[comp(si, v, k)]) {
          const ci = ctx.coreIndex.get(target);
          acc.set(ci, (acc.get(ci) ?? 0) + w * f);
        }
      }
      let entries = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      if (!entries.length) entries = [[ctx.coreIndex.get("Hips"), 1]];
      const sum = entries.reduce((s, e) => s + e[1], 0);
      entries.forEach(([ci, w], k) => { wIdx[i * 4 + k] = ci; wVal[i * 4 + k] = w / sum; });
    }

    // Linear-blend re-pose: p' = Σ w (R (p - bind) + posed).
    const { coreBind, corePos, coreRot } = ctx;
    const tmp = new THREE.Vector3(), out = new THREE.Vector3();
    const skinPoint = (x, y, z, i) => {
      out.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = wVal[i * 4 + k];
        if (!w) continue;
        const c = wIdx[i * 4 + k];
        tmp.set(x, y, z).sub(coreBind[c]).applyQuaternion(coreRot[c]).add(corePos[c]);
        out.addScaledVector(tmp, w);
      }
      return out;
    };
    const skinVector = (x, y, z, i) => {
      out.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = wVal[i * 4 + k];
        if (!w) continue;
        tmp.set(x, y, z).applyQuaternion(coreRot[wIdx[i * 4 + k]]);
        out.addScaledVector(tmp, w);
      }
      return out;
    };

    const positions = new Float64Array(n * 3), normals = new Float64Array(n * 3);
    const restPos = new Float32Array(n * 3), restNrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), color = new Float32Array(n * 3).fill(1), faceSurface = new Float32Array(n * 3);
    const uvAttr = geo.attributes.uv, colAttr = geo.attributes.color, fsAttr = geo.attributes.faceSurface;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      restPos.set([x, y, z], i * 3);
      const p = skinPoint(x, y, z, i);
      positions.set([p.x, p.y, p.z], i * 3);
      const nx = nrm ? nrm.getX(v) : 0, ny = nrm ? nrm.getY(v) : 1, nz = nrm ? nrm.getZ(v) : 0;
      restNrm.set([nx, ny, nz], i * 3);
      const q = skinVector(nx, ny, nz, i).normalize();
      normals.set([q.x, q.y, q.z], i * 3);
      if (uvAttr) uv.set([uvAttr.getX(v), uvAttr.getY(v)], i * 2);
      if (colAttr) color.set([colAttr.getX(v), colAttr.getY(v), colAttr.getZ(v)], i * 3);
      if (fsAttr) faceSurface.set([fsAttr.getX(v), fsAttr.getY(v), fsAttr.getZ(v)], i * 3);
    }

    // Morph targets → blendshape deltas, re-posed with the same per-vertex rotation blend.
    const morphs = [];
    const morphPos = geo.morphAttributes?.position;
    if (ctx.blendShapes && morphPos?.length) {
      const morphNrm = geo.morphAttributes.normal;
      const relative = geo.morphTargetsRelative;
      const names = [];
      for (const [key, i] of Object.entries(mesh.morphTargetDictionary ?? {})) names[i] = key;
      morphPos.forEach((attr, t) => {
        const nAttr = morphNrm?.[t];
        const indexes = [], deltas = [], ndeltas = [];
        for (let i = 0; i < n; i++) {
          const v = src[i];
          let dx = attr.getX(v), dy = attr.getY(v), dz = attr.getZ(v);
          if (!relative) { dx -= pos.getX(v); dy -= pos.getY(v); dz -= pos.getZ(v); }
          if (dx * dx + dy * dy + dz * dz < 1e-14) continue;
          indexes.push(i);
          const d = skinVector(dx, dy, dz, i);
          deltas.push(d.x, d.y, d.z);
          if (nAttr) {
            let ex = nAttr.getX(v), ey = nAttr.getY(v), ez = nAttr.getZ(v);
            if (!relative && nrm) { ex -= nrm.getX(v); ey -= nrm.getY(v); ez -= nrm.getZ(v); }
            const e = skinVector(ex, ey, ez, i);
            ndeltas.push(e.x, e.y, e.z);
          } else {
            ndeltas.push(0, 0, 0);
          }
        }
        if (indexes.length) morphs.push({ name: names[t] || attr.name || `Shape${t}`, indexes, deltas, ndeltas });
      });
    }

    return {
      name, mesh, n, tris, triMat, wIdx, wVal, positions, normals, restPos, restNrm, uv, color, faceSurface, morphs,
      cornerUV: new Float32Array(tris.length * 2),
    };
  }

  // =====================================================================================
  // 4. UV atlas generation (box-projected charts, shelf-packed per material)
  // =====================================================================================

  function buildCharts(use) {
    const r = use.meshRec, P3 = r.restPos, T = r.tris, faces = use.faces;
    // Weld coincident vertices so original UV seams don't split charts.
    const weld = new Int32Array(r.n), keys = new Map();
    for (let i = 0; i < r.n; i++) {
      const key = `${Math.round(P3[i * 3] * 1e5)},${Math.round(P3[i * 3 + 1] * 1e5)},${Math.round(P3[i * 3 + 2] * 1e5)}`;
      let id = keys.get(key);
      if (id === undefined) { id = keys.size; keys.set(key, id); }
      weld[i] = id;
    }
    const label = new Uint8Array(faces.length);
    faces.forEach((t, f) => {
      const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      const ux = P3[b] - P3[a], uy = P3[b + 1] - P3[a + 1], uz = P3[b + 2] - P3[a + 2];
      const vx = P3[c] - P3[a], vy = P3[c + 1] - P3[a + 1], vz = P3[c + 2] - P3[a + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      let axis = 0;
      if (Math.abs(n[1]) > Math.abs(n[axis])) axis = 1;
      if (Math.abs(n[2]) > Math.abs(n[axis])) axis = 2;
      label[f] = axis * 2 + (n[axis] < 0 ? 1 : 0);
    });
    const parent = Int32Array.from(faces, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edges = new Map();
    faces.forEach((t, f) => {
      for (let e = 0; e < 3; e++) {
        const a = weld[T[t * 3 + e]], b = weld[T[t * 3 + (e + 1) % 3]];
        const key = ((a < b ? a : b) * 2097152 + (a < b ? b : a)) * 8 + label[f];
        const other = edges.get(key);
        if (other === undefined) edges.set(key, f);
        else { const ra = find(f), rb = find(other); if (ra !== rb) parent[ra] = rb; }
      }
    });
    const charts = new Map();
    faces.forEach((t, f) => {
      const root = find(f);
      let chart = charts.get(root);
      if (!chart) {
        const axis = label[f] >> 1;
        chart = { use, faces: [], axis, flip: label[f] & 1, minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity };
        charts.set(root, chart);
      }
      chart.faces.push(t);
    });
    for (const chart of charts.values()) {
      const ua = (chart.axis + 1) % 3, va = (chart.axis + 2) % 3, su = chart.flip ? -1 : 1;
      chart.project = (i) => [P3[i * 3 + ua] * su, P3[i * 3 + va]];
      for (const t of chart.faces) {
        for (let e = 0; e < 3; e++) {
          const [u, v] = chart.project(T[t * 3 + e]);
          chart.minU = Math.min(chart.minU, u); chart.maxU = Math.max(chart.maxU, u);
          chart.minV = Math.min(chart.minV, v); chart.maxV = Math.max(chart.maxV, v);
        }
      }
      chart.w = (chart.maxU - chart.minU) * use.density;
      chart.h = (chart.maxV - chart.minV) * use.density;
    }
    return [...charts.values()];
  }

  function shelfPack(charts, scale, pad, place) {
    let x = pad, y = pad, shelf = 0;
    for (const c of charts) {
      const w = c.w * scale, h = c.h * scale;
      if (w + 2 * pad > 1 || h + 2 * pad > 1) return false;
      if (x + w + pad > 1) { x = pad; y += shelf + pad; shelf = 0; }
      if (y + h + pad > 1) return false;
      if (place) { c.x = x; c.y = y; }
      x += w + pad;
      shelf = Math.max(shelf, h);
    }
    return true;
  }

  function buildAtlas(matRec) {
    const charts = matRec.uses.flatMap(buildCharts).sort((a, b) => b.h - a.h);
    const pad = 4 / matRec.size;
    const maxDim = Math.max(1e-9, ...charts.map((c) => Math.max(c.w, c.h)));
    let lo = 0, hi = 1 / maxDim;
    for (let it = 0; it < 32; it++) {
      const mid = (lo + hi) / 2;
      if (shelfPack(charts, mid, pad, false)) lo = mid; else hi = mid;
    }
    if (!shelfPack(charts, lo, pad, true)) throw new Error(`Could not pack UV atlas for ${matRec.name}`);
    for (const c of charts) {
      const r = c.use.meshRec, T = r.tris, s = lo * c.use.density;
      for (const t of c.faces) {
        for (let e = 0; e < 3; e++) {
          const [u, v] = c.project(T[t * 3 + e]);
          r.cornerUV[(t * 3 + e) * 2] = (u - c.minU) * s + c.x;
          r.cornerUV[(t * 3 + e) * 2 + 1] = (v - c.minV) * s + c.y;
        }
      }
    }
    return charts.length;
  }

  // =====================================================================================
  // 5. Albedo baking (renders each material's surface colour into its atlas)
  // =====================================================================================

  const BAKE_VERTEX = /* glsl */ `
attribute vec2 atlasUv;
attribute vec3 bakeColor;
attribute vec3 faceSurface;
varying vec2 vBakeUv;
varying vec3 vBakeColor;
varying vec3 vSkinRestPosition;
varying vec3 vSkinRestNormal;
varying vec3 vFaceSurface;
void main() {
  vBakeUv = uv;
  vBakeColor = bakeColor;
  vSkinRestPosition = position;
  vSkinRestNormal = normal;
  vFaceSurface = faceSurface;
  gl_Position = vec4(atlasUv * 2.0 - 1.0, 0.0, 1.0);
}`;

  const TO_SRGB = /* glsl */ `
vec3 bakeToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}`;

  const GENERIC_FRAGMENT = /* glsl */ `
uniform vec3 diffuse;
uniform sampler2D map;
uniform mat3 mapTransform;
uniform float hasMap;
uniform float useVertexColor;
varying vec2 vBakeUv;
varying vec3 vBakeColor;
${TO_SRGB}
void main() {
  vec4 c = vec4(diffuse, 1.0);
  if (hasMap > 0.5) c *= texture2D(map, (mapTransform * vec3(vBakeUv, 1.0)).xy);
  if (useVertexColor > 0.5) c.rgb *= vBakeColor;
  gl_FragColor = vec4(bakeToSRGB(c.rgb), 1.0);
}`;

  // Template handed to the skin material's onBeforeCompile; it swaps <map_fragment> for its
  // triplanar rest-space skin code, which we then evaluate in UV space.
  const SKIN_TEMPLATE = /* glsl */ `
uniform vec3 diffuse;
uniform sampler2D map;
varying vec3 vBakeColor;
${TO_SRGB}
void main() {
  vec4 diffuseColor = vec4(diffuse, 1.0);
  #include <map_fragment>
  diffuseColor.rgb *= vBakeColor;
  gl_FragColor = vec4(bakeToSRGB(diffuseColor.rgb), 1.0);
}`;

  /** Returns a bake ShaderMaterial for `material`, reusing its custom skin shader code when present. */
  function createBakeMaterial(THREE, material, renderer) {
    const common = { vertexShader: BAKE_VERTEX, side: THREE.DoubleSide, depthTest: false, depthWrite: false };
    const custom = material.onBeforeCompile && material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;
    if (custom && material.map) {
      try {
        const shader = { uniforms: {}, defines: {}, vertexShader: "#include <begin_vertex>", fragmentShader: SKIN_TEMPLATE };
        material.onBeforeCompile(shader, renderer);
        if (shader.fragmentShader.includes("sampleSkinTexture")) {
          return new THREE.ShaderMaterial({
            ...common,
            defines: { USE_MAP: "" },
            uniforms: { ...shader.uniforms, map: { value: material.map }, diffuse: { value: material.color.clone() } },
            fragmentShader: shader.fragmentShader,
          });
        }
      } catch (err) {
        console.warn(`[fbx-exporter] Falling back to plain bake for ${material.name || material.type}:`, err);
      }
    }
    if (material.map) material.map.updateMatrix();
    return new THREE.ShaderMaterial({
      ...common,
      uniforms: {
        diffuse: { value: material.color ? material.color.clone() : new THREE.Color(1, 1, 1) },
        map: { value: material.map ?? null },
        mapTransform: { value: material.map ? material.map.matrix.clone() : new THREE.Matrix3() },
        hasMap: { value: material.map ? 1 : 0 },
        useVertexColor: { value: material.vertexColors ? 1 : 0 },
      },
      fragmentShader: GENERIC_FRAGMENT,
    });
  }

  function bakeGeometry(THREE, matRec) {
    let corners = 0;
    for (const use of matRec.uses) corners += use.faces.length * 3;
    const atlasUv = new Float32Array(corners * 2), position = new Float32Array(corners * 3), normal = new Float32Array(corners * 3);
    const uv = new Float32Array(corners * 2), color = new Float32Array(corners * 3), faceSurface = new Float32Array(corners * 3);
    let o = 0;
    for (const use of matRec.uses) {
      const r = use.meshRec;
      for (const t of use.faces) {
        for (let e = 0; e < 3; e++, o++) {
          const v = r.tris[t * 3 + e], c = (t * 3 + e) * 2;
          atlasUv.set([r.cornerUV[c], r.cornerUV[c + 1]], o * 2);
          position.set(r.restPos.subarray(v * 3, v * 3 + 3), o * 3);
          normal.set(r.restNrm.subarray(v * 3, v * 3 + 3), o * 3);
          uv.set(r.uv.subarray(v * 2, v * 2 + 2), o * 2);
          color.set(r.color.subarray(v * 3, v * 3 + 3), o * 3);
          faceSurface.set(r.faceSurface.subarray(v * 3, v * 3 + 3), o * 3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("atlasUv", new THREE.BufferAttribute(atlasUv, 2));
    geo.setAttribute("bakeColor", new THREE.BufferAttribute(color, 3));
    geo.setAttribute("faceSurface", new THREE.BufferAttribute(faceSurface, 3));
    return geo;
  }

  /** Grows covered texels outward so mipmaps and bilinear filtering never pull in empty space. */
  function dilate(px, size, passes) {
    const filled = new Uint8Array(size * size);
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < size * size; i++) {
      if (px[i * 4 + 3] > 0) {
        filled[i] = 1;
        r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; count++;
      }
    }
    const neighbours = (i, fn) => {
      const x = i % size, y = (i / size) | 0;
      if (x > 0) fn(i - 1);
      if (x < size - 1) fn(i + 1);
      if (y > 0) fn(i - size);
      if (y < size - 1) fn(i + size);
    };
    let frontier = [];
    const queued = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      if (!filled[i]) continue;
      neighbours(i, (j) => { if (!filled[j] && !queued[j]) { queued[j] = 1; frontier.push(j); } });
    }
    for (let pass = 0; pass < passes && frontier.length; pass++) {
      for (const i of frontier) {
        let sr = 0, sg = 0, sb = 0, n = 0;
        neighbours(i, (j) => { if (filled[j] === 1) { sr += px[j * 4]; sg += px[j * 4 + 1]; sb += px[j * 4 + 2]; n++; } });
        px[i * 4] = sr / n; px[i * 4 + 1] = sg / n; px[i * 4 + 2] = sb / n; px[i * 4 + 3] = 255;
      }
      for (const i of frontier) filled[i] = 1;
      const next = [];
      for (const i of frontier) {
        neighbours(i, (j) => { if (!filled[j] && !queued[j]) { queued[j] = 1; next.push(j); } });
      }
      frontier = next;
    }
    const avg = count ? [r / count, g / count, b / count] : [128, 128, 128];
    for (let i = 0; i < size * size; i++) {
      if (!filled[i]) { px[i * 4] = avg[0]; px[i * 4 + 1] = avg[1]; px[i * 4 + 2] = avg[2]; }
      px[i * 4 + 3] = 255;
    }
  }

  async function encodeImage(px, size, type) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx2d = canvas.getContext("2d");
    const img = ctx2d.createImageData(size, size);
    const row = size * 4;
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    ctx2d.putImageData(img, 0, 0);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Texture encoding failed"))), type, 0.92));
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function bakeTexture(THREE, renderer, matRec, imageType) {
    const size = matRec.size;
    const geometry = bakeGeometry(THREE, matRec);
    const material = createBakeMaterial(THREE, matRec.material, renderer);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, generateMipmaps: false });

    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAutoClear = renderer.autoClear;
    const prevShadows = renderer.shadowMap.autoUpdate;
    const px = new Uint8Array(size * size * 4);
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.autoClear = prevAutoClear;
      renderer.shadowMap.autoUpdate = prevShadows;
      target.dispose();
      geometry.dispose();
      material.dispose();
    }
    dilate(px, size, 16);
    return encodeImage(px, size, imageType);
  }

  // =====================================================================================
  // 6. Materials
  // =====================================================================================

  // Names and default atlas sizes for createProceduralMaterials() slots 0-11.
  const MATERIAL_SLOTS = [
    ["Skin_Body", 2048], ["Shirt", 2048], ["Shorts", 2048], ["Hair", 1024],
    ["Eyes", 1024], ["Skin_Head", 2048], ["Teeth", 512], ["FootWraps", 1024],
    ["ClothingTrim", 512], ["Mouth", 512], ["Tongue", 512], ["Nails", 256],
  ];

  function needsBake(matRec) {
    const m = matRec.material;
    if (m.map) return true;
    if (!m.vertexColors) return false;
    for (const use of matRec.uses) {
      const c = use.meshRec.color;
      for (const t of use.faces) {
        for (let e = 0; e < 3; e++) {
          const v = use.meshRec.tris[t * 3 + e] * 3;
          if (c[v] < 0.98 || c[v + 1] < 0.98 || c[v + 2] < 0.98) return true;
        }
      }
    }
    return false;
  }

  function srgbOf(THREE, color) {
    const out = { r: 1, g: 1, b: 1 };
    if (color) color.getRGB(out, THREE.SRGBColorSpace);
    return out;
  }

  // =====================================================================================
  // 7. FBX document assembly
  // =====================================================================================

  function buildDocument(THREE, ctx) {
    const CM = 100; // metres → centimetres
    let nextId = 1000000n;
    const uid = () => nextId++;
    const objects = [], connections = [];
    const OO = (child, parent) => connections.push(N("C", [P.S("OO"), P.L(child), P.L(parent)]));
    const OP = (child, parent, prop) => connections.push(N("C", [P.S("OP"), P.L(child), P.L(parent), P.S(prop)]));
    const counts = { Model: 0, NodeAttribute: 0, Geometry: 0, Deformer: 0, Material: 0, Texture: 0, Video: 0, Pose: 1 };
    const poseNodes = [];

    // --- Skeleton ---
    const boneIds = new Map();
    for (const b of ctx.spec) {
      const modelId = uid(), attrId = uid();
      boneIds.set(b.name, modelId);
      const full = MIXAMO_PREFIX + b.name;
      const p = ctx.pose.pos.get(b.name);
      const parentPos = b.parent ? ctx.pose.pos.get(b.parent) : new THREE.Vector3();
      objects.push(N("NodeAttribute", [P.L(attrId), P.S(nm(full, "NodeAttribute")), P.S("LimbNode")], [
        p70(pDouble("Size", 1)),
        N("TypeFlags", [P.S("Skeleton")]),
      ]));
      objects.push(N("Model", [P.L(modelId), P.S(nm(full, "Model")), P.S("LimbNode")], [
        N("Version", [P.I(232)]),
        p70(
          pLcl("Lcl Translation", (p.x - parentPos.x) * CM, (p.y - parentPos.y) * CM, (p.z - parentPos.z) * CM),
          pLcl("Lcl Rotation", 0, 0, 0),
          pLcl("Lcl Scaling", 1, 1, 1),
          pInt("DefaultAttributeIndex", 0),
          pEnum("InheritType", 1),
        ),
        N("Shading", [P.C(true)]),
        N("Culling", [P.S("CullingOff")]),
      ]));
      counts.NodeAttribute++;
      counts.Model++;
      OO(attrId, modelId);
      OO(modelId, b.parent ? boneIds.get(b.parent) : 0n);
      poseNodes.push(N("PoseNode", [], [N("Node", [P.L(modelId)]), N("Matrix", [P.d(translationMatrix(p.x * CM, p.y * CM, p.z * CM))])]));
    }

    // --- Materials, textures, videos ---
    const materialIds = new Map();
    for (const matRec of ctx.materials) {
      const id = uid();
      materialIds.set(matRec, id);
      const m = matRec.material;
      const base = matRec.image ? { r: 1, g: 1, b: 1 } : srgbOf(THREE, m.color);
      const rough = THREE.MathUtils.clamp(m.roughness ?? 0.8, 0.04, 1);
      const shininess = Math.min(1000, 2 / Math.pow(rough, 4) - 2);
      objects.push(N("Material", [P.L(id), P.S(nm(matRec.name, "Material")), P.S("")], [
        N("Version", [P.I(102)]),
        N("ShadingModel", [P.S("Phong")]),
        N("MultiLayer", [P.I(0)]),
        p70(
          pColorA("DiffuseColor", base.r, base.g, base.b),
          pNumberA("DiffuseFactor", 1),
          pColorA("AmbientColor", 0, 0, 0),
          pColorA("EmissiveColor", 0, 0, 0),
          pColorA("SpecularColor", 1, 1, 1),
          pNumberA("SpecularFactor", 0.5 * (1 - rough)),
          pNumberA("ShininessExponent", shininess),
          pNumberA("Shininess", shininess),
          pNumberA("ReflectionFactor", 0),
          pNumberA("Opacity", 1),
        ),
      ]));
      counts.Material++;
      if (!matRec.image) continue;
      const texId = uid(), videoId = uid();
      const texName = `T_${matRec.name}`;
      const file = `${texName}.${ctx.imageExt}`;
      objects.push(N("Video", [P.L(videoId), P.S(nm(texName, "Video")), P.S("Clip")], [
        N("Type", [P.S("Clip")]),
        p70(pString("Path", file, "XRefUrl")),
        N("UseMipMap", [P.I(0)]),
        N("Filename", [P.S(file)]),
        N("RelativeFilename", [P.S(file)]),
        N("Content", [P.R(matRec.image)]),
      ]));
      objects.push(N("Texture", [P.L(texId), P.S(nm(texName, "Texture")), P.S("")], [
        N("Type", [P.S("TextureVideoClip")]),
        N("Version", [P.I(202)]),
        N("TextureName", [P.S(nm(texName, "Texture"))]),
        p70(pBool("UseMaterial", true), pString("UVSet", "UVMap")),
        N("Media", [P.S(nm(texName, "Video"))]),
        N("FileName", [P.S(file)]),
        N("RelativeFilename", [P.S(file)]),
        N("ModelUVTranslation", [P.D(0), P.D(0)]),
        N("ModelUVScaling", [P.D(1), P.D(1)]),
        N("Texture_Alpha_Source", [P.S("None")]),
        N("Cropping", [P.I(0), P.I(0), P.I(0), P.I(0)]),
      ]));
      counts.Video++;
      counts.Texture++;
      OO(videoId, texId);
      OP(texId, id, "DiffuseColor");
    }

    // --- Meshes, skins, clusters, blendshapes ---
    const coreCluster = ctx.spec.filter((b) => !b.end);
    for (const r of ctx.meshRecs) {
      const geomId = uid(), modelId = uid();
      const triCount = r.tris.length / 3;
      const vertices = new Float64Array(r.n * 3);
      for (let i = 0; i < vertices.length; i++) vertices[i] = r.positions[i] * CM;
      const pvi = new Int32Array(r.tris.length);
      for (let i = 0; i < r.tris.length; i++) pvi[i] = i % 3 === 2 ? ~r.tris[i] : r.tris[i];
      const cornerNormals = new Float64Array(r.tris.length * 3);
      for (let i = 0; i < r.tris.length; i++) cornerNormals.set(r.normals.subarray(r.tris[i] * 3, r.tris[i] * 3 + 3), i * 3);
      const localMats = [...new Set(r.triMat)].map((m) => ctx.materialByThree.get(m));
      const matIndex = new Int32Array(triCount);
      for (let t = 0; t < triCount; t++) matIndex[t] = localMats.indexOf(ctx.materialByThree.get(r.triMat[t]));
      const uvIndex = Int32Array.from({ length: r.tris.length }, (_, i) => i);

      const layerElement = (type) => N("LayerElement", [], [N("Type", [P.S(type)]), N("TypedIndex", [P.I(0)])]);
      objects.push(N("Geometry", [P.L(geomId), P.S(nm(r.name, "Geometry")), P.S("Mesh")], [
        p70(),
        N("GeometryVersion", [P.I(124)]),
        N("Vertices", [P.d(vertices)]),
        N("PolygonVertexIndex", [P.i(pvi)]),
        N("LayerElementNormal", [P.I(0)], [
          N("Version", [P.I(101)]),
          N("Name", [P.S("")]),
          N("MappingInformationType", [P.S("ByPolygonVertex")]),
          N("ReferenceInformationType", [P.S("Direct")]),
          N("Normals", [P.d(cornerNormals)]),
        ]),
        N("LayerElementSmoothing", [P.I(0)], [
          N("Version", [P.I(102)]),
          N("Name", [P.S("")]),
          N("MappingInformationType", [P.S("ByPolygon")]),
          N("ReferenceInformationType", [P.S("Direct")]),
          N("Smoothing", [P.i(new Int32Array(triCount).fill(1))]),
        ]),
        N("LayerElementUV", [P.I(0)], [
          N("Version", [P.I(101)]),
          N("Name", [P.S("UVMap")]),
          N("MappingInformationType", [P.S("ByPolygonVertex")]),
          N("ReferenceInformationType", [P.S("IndexToDirect")]),
          N("UV", [P.d(Float64Array.from(r.cornerUV))]),
          N("UVIndex", [P.i(uvIndex)]),
        ]),
        N("LayerElementMaterial", [P.I(0)], [
          N("Version", [P.I(101)]),
          N("Name", [P.S("")]),
          N("MappingInformationType", [P.S("ByPolygon")]),
          N("ReferenceInformationType", [P.S("IndexToDirect")]),
          N("Materials", [P.i(matIndex)]),
        ]),
        N("Layer", [P.I(0)], [
          N("Version", [P.I(100)]),
          layerElement("LayerElementNormal"),
          layerElement("LayerElementSmoothing"),
          layerElement("LayerElementUV"),
          layerElement("LayerElementMaterial"),
        ]),
      ]));
      objects.push(N("Model", [P.L(modelId), P.S(nm(r.name, "Model")), P.S("Mesh")], [
        N("Version", [P.I(232)]),
        p70(
          pLcl("Lcl Translation", 0, 0, 0),
          pLcl("Lcl Rotation", 0, 0, 0),
          pLcl("Lcl Scaling", 1, 1, 1),
          pInt("DefaultAttributeIndex", 0),
          pEnum("InheritType", 1),
        ),
        N("Shading", [P.C(true)]),
        N("Culling", [P.S("CullingOff")]),
      ]));
      counts.Geometry++;
      counts.Model++;
      OO(modelId, 0n);
      OO(geomId, modelId);
      for (const matRec of localMats) OO(materialIds.get(matRec), modelId);
      poseNodes.push(N("PoseNode", [], [N("Node", [P.L(modelId)]), N("Matrix", [P.d(translationMatrix(0, 0, 0))])]));

      // Skin + one cluster per core bone.
      const skinId = uid();
      objects.push(N("Deformer", [P.L(skinId), P.S(nm(r.name, "Deformer")), P.S("Skin")], [
        N("Version", [P.I(101)]),
        N("Link_DeformAcuracy", [P.D(50)]),
      ]));
      counts.Deformer++;
      OO(skinId, geomId);
      const perBone = coreCluster.map(() => ({ idx: [], w: [] }));
      for (let i = 0; i < r.n; i++) {
        for (let k = 0; k < 4; k++) {
          const w = r.wVal[i * 4 + k];
          if (w > 0) { perBone[r.wIdx[i * 4 + k]].idx.push(i); perBone[r.wIdx[i * 4 + k]].w.push(w); }
        }
      }
      coreCluster.forEach((b, ci) => {
        const clusterId = uid();
        const p = ctx.pose.pos.get(b.name);
        const children = [N("Version", [P.I(100)]), N("UserData", [P.S(""), P.S("")])];
        if (perBone[ci].idx.length) {
          children.push(N("Indexes", [P.i(perBone[ci].idx)]), N("Weights", [P.d(perBone[ci].w)]));
        }
        children.push(
          N("Transform", [P.d(translationMatrix(-p.x * CM, -p.y * CM, -p.z * CM))]),
          N("TransformLink", [P.d(translationMatrix(p.x * CM, p.y * CM, p.z * CM))]),
        );
        objects.push(N("Deformer", [P.L(clusterId), P.S(nm(MIXAMO_PREFIX + b.name, "SubDeformer")), P.S("Cluster")], children));
        counts.Deformer++;
        OO(clusterId, skinId);
        OO(boneIds.get(b.name), clusterId);
      });

      if (r.morphs.length) {
        const blendId = uid();
        objects.push(N("Deformer", [P.L(blendId), P.S(nm(`${r.name}_Shapes`, "Deformer")), P.S("BlendShape")], [N("Version", [P.I(100)])]));
        counts.Deformer++;
        OO(blendId, geomId);
        for (const morph of r.morphs) {
          const channelId = uid(), shapeId = uid();
          objects.push(N("Deformer", [P.L(channelId), P.S(nm(morph.name, "SubDeformer")), P.S("BlendShapeChannel")], [
            N("Version", [P.I(100)]),
            N("DeformPercent", [P.D(0)]),
            N("FullWeights", [P.d([100])]),
          ]));
          objects.push(N("Geometry", [P.L(shapeId), P.S(nm(morph.name, "Geometry")), P.S("Shape")], [
            N("Version", [P.I(100)]),
            N("Indexes", [P.i(morph.indexes)]),
            N("Vertices", [P.d(morph.deltas.map((v) => v * CM))]),
            N("Normals", [P.d(morph.ndeltas)]),
          ]));
          counts.Deformer++;
          counts.Geometry++;
          OO(channelId, blendId);
          OO(shapeId, channelId);
        }
      }
    }

    const poseId = uid();
    objects.push(N("Pose", [P.L(poseId), P.S(nm("BindPose", "Pose")), P.S("BindPose")], [
      N("Type", [P.S("BindPose")]),
      N("Version", [P.I(100)]),
      N("NbPoseNodes", [P.I(poseNodes.length)]),
      ...poseNodes,
    ]));

    // --- Top-level sections ---
    const now = new Date();
    const header = N("FBXHeaderExtension", [], [
      N("FBXHeaderVersion", [P.I(1003)]),
      N("FBXVersion", [P.I(FBX_VERSION)]),
      N("EncryptionType", [P.I(0)]),
      N("CreationTimeStamp", [], [
        N("Version", [P.I(1000)]),
        N("Year", [P.I(now.getFullYear())]),
        N("Month", [P.I(now.getMonth() + 1)]),
        N("Day", [P.I(now.getDate())]),
        N("Hour", [P.I(now.getHours())]),
        N("Minute", [P.I(now.getMinutes())]),
        N("Second", [P.I(now.getSeconds())]),
        N("Millisecond", [P.I(now.getMilliseconds())]),
      ]),
      N("Creator", [P.S(ctx.creator)]),
      N("SceneInfo", [P.S(nm("GlobalInfo", "SceneInfo")), P.S("UserData")], [
        N("Type", [P.S("UserData")]),
        N("Version", [P.I(100)]),
        N("MetaData", [], [
          N("Version", [P.I(100)]),
          N("Title", [P.S("")]),
          N("Subject", [P.S("")]),
          N("Author", [P.S("")]),
          N("Keywords", [P.S("")]),
          N("Revision", [P.S("")]),
          N("Comment", [P.S("")]),
        ]),
        p70(
          pString("DocumentUrl", ctx.filename, "Url"),
          pString("SrcDocumentUrl", ctx.filename, "Url"),
          pString("Original|ApplicationVendor", "ProceduralHuman"),
          pString("Original|ApplicationName", "ProceduralHuman FBX Exporter"),
          pString("Original|ApplicationVersion", "1.0"),
        ),
      ]),
    ]);

    const globalSettings = N("GlobalSettings", [], [
      N("Version", [P.I(1000)]),
      p70(
        pInt("UpAxis", 1), pInt("UpAxisSign", 1),
        pInt("FrontAxis", 2), pInt("FrontAxisSign", 1),
        pInt("CoordAxis", 0), pInt("CoordAxisSign", 1),
        pInt("OriginalUpAxis", 1), pInt("OriginalUpAxisSign", 1),
        pDouble("UnitScaleFactor", 1), pDouble("OriginalUnitScaleFactor", 1),
        pColorRGB("AmbientColor", 0, 0, 0),
        pString("DefaultCamera", "Producer Perspective"),
        pEnum("TimeMode", 6),
        pEnum("TimeProtocol", 2),
        pEnum("SnapOnFrameMode", 0),
        pTime("TimeSpanStart", 0),
        pTime("TimeSpanStop", 46186158000),
        pDouble("CustomFrameRate", -1),
      ),
    ]);

    const documentId = uid();
    const documents = N("Documents", [], [
      N("Count", [P.I(1)]),
      N("Document", [P.L(documentId), P.S(""), P.S("Scene")], [
        p70(
          N("P", [P.S("SourceObject"), P.S("object"), P.S(""), P.S("")]),
          pString("ActiveAnimStackName", ""),
        ),
        N("RootNode", [P.L(0)]),
      ]),
    ]);

    const defTypes = Object.entries(counts).filter(([, c]) => c > 0);
    const definitions = N("Definitions", [], [
      N("Version", [P.I(100)]),
      N("Count", [P.I(1 + defTypes.reduce((s, [, c]) => s + c, 0))]),
      N("ObjectType", [P.S("GlobalSettings")], [N("Count", [P.I(1)])]),
      ...defTypes.map(([type, c]) => N("ObjectType", [P.S(type)], [N("Count", [P.I(c)])])),
    ]);

    return [
      header,
      N("FileId", [P.R(FILE_ID)]),
      N("CreationTime", [P.S(CREATION_TIME)]),
      N("Creator", [P.S(ctx.creator)]),
      globalSettings,
      documents,
      N("References"),
      definitions,
      N("Objects", [], objects),
      N("Connections", [], connections),
      N("Takes", [], [N("Current", [P.S("")])]),
    ];
  }

  // =====================================================================================
  // 8. Public entry point
  // =====================================================================================

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function exportCharacterFBX(THREE, character, options = {}) {
    if (!THREE || !THREE.Matrix4) throw new Error("exportCharacterFBX: pass the three.js module as the first argument.");
    if (!character?.skinnedMesh?.skeleton) throw new Error("exportCharacterFBX: character.skinnedMesh with a skeleton is required.");
    const opts = {
      pose: "tpose", includeClothing: true, blendShapes: true, bakeTextures: true,
      textureScale: 1, imageType: "image/png", filename: "ProceduralHuman.fbx",
      ...options,
    };
    const progress = async (msg) => { opts.onProgress?.(msg); await tick(); };
    const body = character.skinnedMesh;

    await progress("Solving skeleton");
    const spec = mixamoSkeletonSpec();
    const srcPos = bindPositions(THREE, body);
    const pose = solvePose(THREE, spec, srcPos, opts.pose === "bind" ? "bind" : "tpose");
    const coreSpec = spec.filter((b) => !b.end);
    const ctx = {
      spec,
      blendShapes: opts.blendShapes,
      coreIndex: new Map(coreSpec.map((b, i) => [b.name, i])),
      coreBind: coreSpec.map((b) => pose.bind.get(b.name)),
      corePos: coreSpec.map((b) => pose.pos.get(b.name)),
      coreRot: coreSpec.map((b) => pose.rot.get(b.name)),
    };

    await progress("Extracting meshes");
    const meshRecs = [];
    const bodyRec = extractMesh(THREE, body, "Body", ctx);
    if (bodyRec) meshRecs.push(bodyRec);
    if (opts.includeClothing && character.clothingSlots) {
      for (const [slot, state] of Object.entries(character.clothingSlots)) {
        if (!state.mesh?.skeleton) continue;
        const rec = extractMesh(THREE, state.mesh, `Clothing_${slot}_${state.item}`, ctx);
        if (rec) meshRecs.push(rec);
      }
    }

    // Head top for the HeadTop_End leaf: highest posed vertex weighted mostly to the head.
    const headIdx = ctx.coreIndex.get("Head");
    let headTop = -Infinity;
    for (const r of meshRecs) {
      for (let i = 0; i < r.n; i++) {
        if (r.wIdx[i * 4] === headIdx && r.wVal[i * 4] > 0.5) headTop = Math.max(headTop, r.positions[i * 3 + 1]);
      }
    }
    placeEndBones(THREE, spec, pose, headTop);

    // Collect materials in first-use order.
    const bodyMaterials = Array.isArray(body.material) ? body.material : [body.material];
    const materialByThree = new Map();
    const materials = [];
    const usedNames = new Set();
    for (const r of meshRecs) {
      const facesByMat = new Map();
      r.triMat.forEach((m, t) => {
        if (!facesByMat.has(m)) facesByMat.set(m, []);
        facesByMat.get(m).push(t);
      });
      for (const [m, faces] of facesByMat) {
        let rec = materialByThree.get(m);
        if (!rec) {
          const slot = bodyMaterials.indexOf(m);
          let name = (slot >= 0 && MATERIAL_SLOTS[slot]?.[0]) || m.name || `Material${materials.length}`;
          while (usedNames.has(name)) name += "_";
          usedNames.add(name);
          const baseSize = (slot >= 0 && MATERIAL_SLOTS[slot]?.[1]) || 1024;
          const size = THREE.MathUtils.clamp(THREE.MathUtils.floorPowerOfTwo(baseSize * opts.textureScale), 64, 8192);
          rec = { material: m, name, size, uses: [], image: null };
          materialByThree.set(m, rec);
          materials.push(rec);
        }
        rec.uses.push({ meshRec: r, faces, density: 1 });
      }
    }
    ctx.materials = materials;
    ctx.materialByThree = materialByThree;
    ctx.meshRecs = meshRecs;

    const report = { bones: spec.length, meshes: [], blendShapes: 0, textures: [], charts: 0 };
    await progress("Building UV atlases");
    for (const matRec of materials) report.charts += buildAtlas(matRec);

    if (opts.bakeTextures) {
      let renderer = opts.renderer;
      const ownRenderer = !renderer;
      if (ownRenderer) renderer = new THREE.WebGLRenderer({ antialias: false });
      try {
        for (const matRec of materials) {
          if (!needsBake(matRec)) continue;
          await progress(`Baking ${matRec.name} (${matRec.size}px)`);
          matRec.image = await bakeTexture(THREE, renderer, matRec, opts.imageType);
          report.textures.push({ name: matRec.name, size: matRec.size, bytes: matRec.image.length });
        }
      } finally {
        if (ownRenderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
      }
    }

    await progress("Writing FBX");
    ctx.imageExt = opts.imageType === "image/jpeg" ? "jpg" : "png";
    ctx.creator = "ProceduralHuman FBX Exporter 1.0";
    ctx.filename = opts.filename;
    ctx.pose = pose;
    const nodes = buildDocument(THREE, ctx);
    const bytes = await encodeFBX(nodes);

    for (const r of meshRecs) {
      report.meshes.push({ name: r.name, vertices: r.n, triangles: r.tris.length / 3, blendShapes: r.morphs.length });
      report.blendShapes += r.morphs.length;
    }
    report.bytes = bytes.length;
    await progress("Done");
    return { blob: new Blob([bytes], { type: "application/octet-stream" }), bytes, filename: opts.filename, report };
  }

  /** Convenience: export and trigger a browser download. */
  async function downloadCharacterFBX(THREE, character, options = {}) {
    const result = await exportCharacterFBX(THREE, character, options);
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return result;
  }

  root.ProceduralHumanFBX = {
    exportCharacterFBX,
    downloadCharacterFBX,
    encodeFBX,
    mixamoSkeletonSpec,
    MIXAMO_PREFIX,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
