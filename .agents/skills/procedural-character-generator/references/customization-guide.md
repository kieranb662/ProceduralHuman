# Procedural Character Customization & Extension Guide

This guide explains the mathematical and architectural techniques used in [procedural-human.js](../resources/procedural-human.js) and how to modify or extend them to generate new characters.

---

## 1. Architecture Overview

Every generated character consists of a single unified `THREE.SkinnedMesh` for the entire body and head, plus optional `THREE.SkinnedMesh` layers in `character.clothingRoot` that share the same `THREE.Skeleton` and `bindMatrix`.

### Material Slots (`skinnedMesh.material[0..11]`)
| Index | Slot Name | Description |
| :--- | :--- | :--- |
| `0` | **Body Skin** | Rest-space triplanar pore/bump + regional warmth/oil/roughness + wrapped-diffuse/backscatter SSS |
| `1` | **Tops / Sleeves** | Procedural plain-weave fabric texture + bump + cloth sheen (`shirt` color) |
| `2` | **Shorts / Trousers** | Procedural plain-weave fabric texture + bump + cloth sheen (`shorts` color) |
| `3` | **Hair / Brows** | Anisotropic strand-streak noise along V (`hair` color) |
| `4` | **Eyeballs** | 512×512 procedural sclera veins, radial iris fibers, collarette, pupil, and corneal clearcoat |
| `5` | **Head Skin** | Shares the rest-space triplanar SSS skin shader + `faceSurface` nostril shading attribute |
| `6` | **Teeth** | Procedural enamel texture with cervical shading and high-IOR clearcoat (`ior: 1.62`) |
| `7` | **Foot Wraps** | Matte fabric wrap material |
| `8` | **Clothing Trim** | Reserved accent/trim material |
| `9` | **Oral Mucosa / Gums** | Double-sided oral cavity & gingiva with depth-occluded specular |
| `10` | **Tongue** | Double-sided papillated dorsal/ventral tongue shader with depth-occluded clearcoat |
| `11` | **Nails** | Keratin nail plates with lunula/free-edge vertex color shading (`ior: 1.45`) |

---

## 2. Generating Distinct Characters via Options

### A. Skin Tone, Hair, Eye & Fabric Palettes (`options.palette`)
- **Skin tones**: Pass any hex string to `palette.skin` (e.g. `"#f1c6a7"`, `"#d99b72"`, `"#c68b59"`, `"#8d5524"`, `"#523218"`). Adjust `palette.textures.skinScattering` (`0.25–0.55`) and `palette.textures.skinColorVariation` (`0.6–1.4`) to tune complexion warmth and mottling.
- **Per-slot material overrides**: Pass `palette.materials` as a sparse array or object mapping slot index (`0..11`) to `MeshPhysicalMaterial` properties (e.g. `{ 4: { color: "#8ab4f8" } }` to tint eye color, or `{ 7: { color: "#1e293b" } }` for dark footwear).

### B. Facial Identity (`options.headDesign`)
You can generate radically different faces without touching vertex loops by combining `transforms` and `features`:

1. **`headDesign.features` (Millimeter Gaussian Contour Offsets, `-10` to `+10`)**:
   - `forehead`: Frontal bossing / slope (`y ≈ 1.710m`)
   - `noseWidth`: Alar wing flare (`|x| ≈ 0.013m, y ≈ 1.628m`)
   - `noseTip`: Nasal bridge & tip projection (`y ≈ 1.632m`)
   - `cheeks`: Zygomatic/malar fullness (`|x| ≈ 0.050m, y ≈ 1.644m`)
   - `jawWidth`: Mandibular angle/gonion width (`|x| ≈ 0.055m, y ≈ 1.594m`)
   - `chin`: Mental protuberance projection (`y ≈ 1.563m`)
   - `lips`: Upper & lower vermilion fullness (`y ≈ 1.595m`)

2. **`headDesign.transforms` (Part Scale & Millimeter Translation)**:
   - Valid targets: `"all"`, `"skin"`, `"eyes"`, `"lidTop"`, `"lidBot"`, `"brows"`, `"ears"`, `"hair"`, `"teeth"`, `"cavity"`.
   - Each target accepts `{ sx, sy, sz, x, y, z }` where `sx, sy, sz` are positive scale multipliers around the part's anatomical pivot and `x, y, z` are offsets in millimeters.
   -Note: `applyHeadDesign` automatically repositions the underlying facial bones (`Eye_L/R`, `EyelidTop/Bot_L/R`, `Brow_L/R`, `Ear_L/R`, `Jaw`, `Lip` bones, `Tongue` bones) and updates `mouthLoopIndices` so the inner oral cavity never separates from the lips!

### C. Body Musculature & Build (`options.torsoDetails`)
- `pectorals`: `{ enabled: boolean, depth: 0..38 (mm), width: 75..125 (%) }`
- `collarbones`: `{ enabled: boolean, depth: 0..17 (mm), sharpness: 0..100 (%) }`
- `abdominals`: `{ enabled: boolean, depth: 0..24 (mm), width: 75..125 (%) }`
- `buttocks`: `{ enabled: boolean, depth: 0..65 (mm), width: 70..135 (%), cleft: 0..30 (mm) }`

---

## 3. Advanced Structural Modifications

### A. Changing Body Proportions & Stature
When creating a taller, shorter, broader, or slender character at the geometry level:
1. **Torso Spline Table (`buildBaseBodyParts`)**:
   The torso is lofted from a Catmull-Rom cubic Hermite spline defined by `table` (`y` from `0.89m` to `1.515m`, with transverse radius `rx`, sagittal radius `rz`, and anteroposterior center offset `cz`).
   - Scaling `rx` and `rz` across `y ∈ [1.16, 1.39]` broadens or narrows the ribcage and shoulders.
   - Scaling `rx` and `rz` at `y ∈ [1.00, 1.08]` alters waist taper.
2. **Shoulder Socket (`shoulderSocket`)**:
   If you widen the upper torso (`y ∈ [1.30, 1.45]`), update `shoulderSocket.bottom` and `shoulderSocket.top` and `Clavicle_L/R` / `UpperArm_L/R` rest X positions in `createHumanoidSkeleton()` by the same delta so the tilted elliptical arm socket stays flush with the humeral head.
3. **Limb Profiles (`defs` in `buildBaseBodyParts`)**:
   - Arms and legs are extruded directly from the torso's shoulder and pelvis boundary loops via `extendTube(opening, defs, slot)`, sharing vertex indices at the seam (`interfaces.arm_L/R`, `interfaces.leg_L/R`) and relaxed with 6-pass Taubin smoothing (`[0.45, -0.46, ...]`).
   - Adjust the `(rx, rz)` radii in the arm or leg `defs` array to create muscular, slender, or stylized limbs.
4. **Watertight Cervical Bridge (`buildCervicalSurface`)**:
   - The neck is not a separate cylinder; `buildCervicalSurface` zippers the 72-column torso collar (`y = 1.515m`) to the dense skull base (`cutY ≈ 1.549–1.575m`) with Hermite tangent matching and sternocleidomastoid (`scm`), laryngeal (`larynx`), and trapezius (`nape`) relief.

### B. Adding New Clothing Slots or Garments
Clothing in `buildClothingGeometry(bodyParts, slot, item)` works by:
1. Filtering body triangles via `geo.userData.faceSlots` (`"torso"`, `"arms_L"`, `"arms_R"`, `"legs_L"`, `"legs_R"`, `"feet_L"`, `"feet_R"`, `"hands_L"`, `"hands_R"`) and longitudinal ring index `geo.userData.faceBands`.
2. Extruding matching vertices along their smooth surface normal by `offset` (`0.010m` for tops/sleeves, `0.007m` for legs/feet) while copying exact `skinIndex` and `skinWeight` attributes.
3. Recording `coveredTriangles` so `updateClothingCoverage()` collapses underlying body triangles to degenerate indices (`index[j+1] = index[j+2] = index[j]`), completely eliminating skin-through-cloth clipping during extreme poses while keeping vertex/group offsets intact for facial morph targets.

To add a new garment (e.g., `"vest"`, `"tank"`, `"boots"`, `"gloves"`):
- Register the item key in `CLOTHING_ITEMS[slot]`.
- Add its region/band/height predicate in `buildClothingGeometry`.

### C. Authoring New Procedural Animations
In `createHumanoidAnimations(rig)`:
- Use `makeQuatTrack(boneName, times, quats)` for bone rotations and `makePosTrack(boneName, times, offsets, true)` for root/hip/facial translations relative to rest pose.
- For elbow flexion, always use `elbowFlexQ(sideSign, radians)` (`sideSign = +1` for Left, `-1` for Right) because the rest arm hangs at an anatomical carrying angle rather than a T-pose.
- For hand poses inside an animation clip, use `...fingerCurlTracks(side, times, fingerCurls, thumbCurls, thumbPose)` which computes all 15 phalanx quaternions around each digit's pronated hinge normal.
- Remember that `Deltoid_L/R` and `ForearmTwist_L/R` are automatically driven in `update()` to half of `UpperArm` rotation and half of `Hand` axial twist respectively—do not animate helper twist bones directly in clips.
