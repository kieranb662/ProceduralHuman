---
name: procedural-character-generator
description: >-
  Procedurally generates fully rigged, animated, deformable 3D humanoid characters
  (Three.js SkinnedMesh) with analytical skin weights, 16 FACS facial morph targets,
  rest-space triplanar PBR skin shaders with subsurface scattering, jointed 5-finger
  hands, removable clothing slots, layered locomotion/upper-body/facial animations,
  and 2-bone arm IK. Use this skill when the user asks to create, customize, rig,
  or animate procedural 3D human or humanoid characters in Three.js projects without
  external GLTF/FBX assets.
---

# Procedural 3D Character Generator Skill

This skill provides a complete, zero-asset procedural character generation pipeline for Three.js (`r186+`). It synthesizes a watertight, anatomically detailed humanoid `THREE.SkinnedMesh` (75 bones including facial rig, 3-joint fingers/thumb, and twist helpers; 16 FACS morph targets; 12 procedural PBR materials; removable clothing layers; and 14 procedural `AnimationClip`s) entirely from mathematical surfaces and analytical skinning weights.

## Directory Contents

- **[resources/procedural-human.js](./resources/procedural-human.js)**: Self-contained ES module exporting `createAdultMaleCharacter(options)` and all underlying procedural geometry, material, skeleton, IK, and animation builders.
- **[references/customization-guide.md](./references/customization-guide.md)**: Deep technical reference for generating new characters by customizing palettes, facial contours (`headDesign`), torso anatomy (`torsoDetails`), clothing slots (`outfit`), skeletal proportions, and procedural animations.
- **[examples/character-presets.js](./examples/character-presets.js)**: Ready-to-use character archetypes (`defaultCasual`, `athleticRunner`, `heavyBrawler`, `elderScholar`, `stealthOperative`) and a preset factory.

---

## Workflow: Generating a Character for a Project

### Step 1: Copy or Import the Procedural Character Module

For modular projects, copy [procedural-human.js](./resources/procedural-human.js) into the target project (e.g. `src/characters/procedural-human.js`) or inline its functions into a standalone HTML file.

Ensure the project's import map or bundler resolves `three` and `three/addons/`:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/"
    }
  }
</script>
```

### Step 2: Configure Character Parameters (`options`)

Call `createAdultMaleCharacter(options)` with a customized configuration object to generate a distinct character:

```javascript
import { createAdultMaleCharacter } from "./procedural-human.js";

const character = createAdultMaleCharacter({
  // 1. Color & Procedural PBR Texture Palette
  palette: {
    skin: "#c68b59",
    shirt: "#2e5a88",
    shorts: "#4a4e4d",
    hair: "#241c18",
    textures: {
      skinDetail: 1.0,
      skinColorVariation: 1.0,
      skinRoughnessVariation: 1.0,
      skinPoreDepth: 1.0,
      skinScattering: 0.35,      // 0..1 wrapped-diffuse + backscatter SSS
      skinThicknessScale: 1.0,   // 0.25..4 ear/nose/hand translucency scale
      skinTileSize: 0.064,       // microdetail tile size in meters
      shirtContrast: 0.28,
      shortsContrast: 0.34,
      hairContrast: 1.0,
    },
  },

  // 2. Torso Musculature & Anatomy Sculpting
  torsoDetails: {
    pectorals:   { enabled: true,  depth: 26, width: 105 },
    collarbones: { enabled: true,  depth: 11, sharpness: 60 },
    abdominals:  { enabled: true,  depth: 14, width: 100 },
    buttocks:    { enabled: true,  depth: 44, width: 100, cleft: 23 },
  },

  // 3. Facial Proportions, Part Transforms & Feature Contours
  headDesign: {
    transforms: {
      // Targets: "all" | "skin" | "eyes" | "lidTop" | "lidBot" | "brows" | "ears" | "hair" | "teeth" | "cavity"
      // sx/sy/sz: scale multipliers (>0); x/y/z: offset in millimeters
      all:   { sx: 1.0, sy: 1.0, sz: 1.0 },
      jaw:   undefined, // use features.jawWidth / features.chin below
      brows: { sy: 1.05, y: 1.0 },
      ears:  { sx: 1.0, sy: 1.0, sz: 1.0 },
    },
    features: {
      // Signed offsets in millimeters (-10 to +10)
      forehead: 0,
      noseWidth: 0,
      noseTip: 0,
      cheeks: 0,
      jawWidth: 0,
      chin: 0,
      lips: 0,
    },
    strokes: [], // Optional array of procedural 3D brush dabs
  },

  // 4. Removable Clothing Slots
  outfit: {
    torso: "shirt",    // "none" | "shirt" | "cropped"
    arms:  "short",    // "none" | "short" | "long"
    legs:  "shorts",   // "none" | "shorts" | "trousers"
    feet:  "none",     // "none" | "wraps"
  },
});

scene.add(character.root);
```

### Step 3: Drive Animations, Gestures, Expressions & IK in the Render Loop

In your `requestAnimationFrame` / `renderer.setAnimationLoop` callback, call `character.update(dt, opts)` every frame:

```javascript
// Switch base locomotion ("idle" | "walking" | "running" | "jumping" | "crouching" | "sitting")
character.setBaseAnimation("walking");

// Layer upper-body action ("none" | "waving" | "holding" | "reaching")
character.setUpperAnimation("none");

// Set facial expression ("neutral" | "smiling" | "frowning" | "shocked" | "skeptical" | "speaking")
character.setFaceExpression("neutral");

// Set hand gesture ("auto" | "relaxed" | "open" | "grip" | "point" | "thumbsUp" | "spread")
character.setHandGesture("auto", "both"); // side: "both" | "L" | "R"

// Inside the render loop:
character.update(dt, {
  autoBlink: true,          // Periodic procedural blinking
  autoGaze: true,           // Micro-saccades + coupled head/neck turn
  reachTarget: targetVec3,  // THREE.Vector3 world target when activeUpper === "reaching"
});
```

### Step 4: Creating Structurally New Character Archetypes

When a user requests a character beyond parameter tweaks (e.g., different stature, body build, new clothing items, or custom animations), consult [references/customization-guide.md](./references/customization-guide.md) for instructions on:
1. Modifying the spline profile table in `buildBaseBodyParts(rig)` and bone rest coordinates in `createHumanoidSkeleton()` to create new body types while keeping all junction loops (`interfaces.neck`, `arm_L/R`, `wrist_L/R`, `leg_L/R`) watertight.
2. Adding new clothing items in `CLOTHING_ITEMS` and `buildClothingGeometry()` using body face slots (`faceSlots` and `faceBands`) and normal-offset shells that degenerate covered skin triangles to prevent clipping.
3. Synthesizing new `THREE.AnimationClip`s in `createHumanoidAnimations(rig)` using `makeQuatTrack`, `makePosTrack`, `makeMorphTrack`, and `fingerCurlTracks`.

---

## Validation Checklist

After generating a character or scene using this skill, verify:
1. **No Skin/Clothing Clipping**: All clothing meshes must bind to `rig.skeleton` using `skinnedMesh.bindMatrix`, and `updateClothingCoverage()` must degenerate covered body triangles.
2. **No Foot Sliding**: Match world translation speed to the active gait cycle (`~1.42 m/s` for `"walking"`, `~3.15 m/s` for `"running"`).
3. **Shadow Frustum Tracking**: When the character walks across a scene, keep the shadow-casting `DirectionalLight` and its `.target` centered on `character.root.position`.
4. **Rest-Pose Frame Reset**: Always animate via `character.update(dt, opts)` so procedural gaze, IK lean, and facial bone offsets reset cleanly before mixers evaluate each frame.
