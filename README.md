# @kieranb662/procedural-human

Procedurally generated, fully rigged three.js humans. Geometry, skin weights, textures,
shaders and animation clips are all generated in code: no asset files.

> **Status:** 0.x, under active migration from a single-file prototype. The API is not stable yet.

## Install

```sh
npm install @kieranb662/procedural-human three
```

`three` is a peer dependency (`>=0.186.0 <0.190.0`). The range is kept narrow because the
skin shaders patch three's built-in shader chunks.

## Entry points

| Import | Contents |
| --- | --- |
| `@kieranb662/procedural-human` | Headless API (no DOM): mesh, rigging, textures, materials, animations, lighting, codegen, physics |
| `@kieranb662/procedural-human/humans` | Prebuilt procedurally generated humans |
| `@kieranb662/procedural-human/editor` | Interactive editor tooling |
| `@kieranb662/procedural-human/ui` | Reusable web components (sliders, buttons, tabs, panels) |

## Quick start

```js
import * as THREE from "three";
import { createHuman, createStudioLighting } from "@kieranb662/procedural-human";
import { defaultAdultMale } from "@kieranb662/procedural-human/humans";

const human = createHuman(defaultAdultMale);
scene.add(human.root);
const lighting = createStudioLighting();
scene.add(lighting.group);
renderer.setAnimationLoop(() => human.update(clock.getDelta(), { autoBlink: true, autoGaze: true }));

// When you are done with it:
human.dispose(); // frees geometry, materials, textures, skeletons and mixers, and removes it from the scene
```

Pass `{ createCanvas }` to build characters outside a browser page (Workers, SSR, tests) and `{ rng }`
(e.g. `createParkMillerRng(seed)`) for deterministic blink and gaze timing.

### Height

Set `height` in a human design (or in `createAdultMaleCharacter` options), or call
`human.setHeight(multiplier)` on a live character. The supported range is `0.5` to `2`,
relative to the default neutral mesh height. `1` restores the default.
The torso editor includes a Height slider and a separate Reset Height button.

Height changes lengthen the torso and limb centerlines without scaling their width or thickness.
The entire head, including facial features and hair, retains its size and shape; hands and feet
also keep their size. Bone rest positions, bind matrices, animation position tracks, clothing
and physics descriptors update automatically. The body surface and its skin weights are
regenerated at the new proportions on the same topology (sculpted torso details are carried
over): limb shafts absorb most of the change while the shoulder girdle and pelvis keep their
joint shape, and joint weight blends keep a minimum physical width so short bodies bend without
creasing. Height is included in captured/exported designs.

### Shoulder deformation

Raising an arm past the rest A-pose drives the clavicle automatically (scapulohumeral rhythm, about
1° of girdle rotation for every 4° of arm elevation). This lifts the acromion and trapezius out of the
way, as a real shoulder girdle does. Elevation already authored on the clavicle counts toward it, and the
arm is re-aimed at the posed hand without changing its elbow angle. Shoulder skin weights are laid out
on the seated torso surface in physical distances. The trapezius rides the clavicle, and the deltoid
helper ramps from the socket rim into the arm, so waving and overhead poses round smoothly instead of
folding the top of the shoulder. Shorter characters have upper arms that are short but just as thick.
For them, the arm root rings are spaced evenly further down the humerus, the deltoid-to-arm ramp runs
along more of the shaft, and the socket rim takes a larger deltoid share with a wider fade. This spreads
the bend over a long enough stretch of skin that the arm root doesn't fold when the arm points straight
up or forward.

The deltoid helper turns half as far as the humerus, so any upper-arm ring that follows it lags
behind and shifts sideways. If its share ends abruptly mid-shaft, a raised arm kinks into a Z. The
share therefore falls steeply near the socket and tapers slowly toward the elbow. The best taper
depends on where the root rings sit along the humerus, which changes with arm length. Each height
range (`[0.5, 0.8)`, `[0.8, 1.4]`, `(1.4, 1.7]`, `(1.7, 2]`) has its own tuned upper-arm layout,
interpolated between knots inside the range.

A half-angle `Elbow_L`/`Elbow_R` helper bone carries the elbow joint ring. This stops the inner
elbow from collapsing and thinning as the forearm bends toward 90° and beyond
(`src/rigging/api/twist-helpers.ts`, `src/mesh/api/body/body-parts.ts`).

## Editors

Every section ships a themeable web component built from the shared `ph-*` UI components:

```js
import { registerEditorElements } from "@kieranb662/procedural-human/editor";
registerEditorElements();
document.querySelector("ph-materials-editor").character = human;
document.querySelector("ph-lighting-editor").lighting = lighting;
document.querySelector("ph-head-editor").viewport = { renderer, camera, controls, scene };
```

Elements: `ph-animation-editor`, `ph-face-editor`, `ph-clothing-editor`, `ph-torso-editor`, `ph-head-editor`,
`ph-materials-editor`, `ph-lighting-editor`, `ph-rig-debug`, `ph-physics-debug`, `ph-human-export`.
They emit a bubbling `ph-change` event (`{ section, ... }`). Restyle with `--ph-*` CSS custom properties
(see `PH_THEME_TOKENS`). `examples/editor-playground` is a minimal integration.
The debug components also expose `skeletonEnabled` and `wireframeEnabled` on `ph-rig-debug`
and `colliderEnabled` on `ph-physics-debug` for custom controls.
The head editor's **Attached earlobes** toggle selects attached or free-hanging lobes.
Set `head.attachedEarlobes: true` in a human design (or `headDesign.attachedEarlobes`
in character options) to select attached lobes programmatically; omitted or `false`
means free-hanging. The setting is saved with the head design and supports undo/redo.
The **Ear anatomy** controls also set ear size, symmetric vertical and depth offsets,
and facing angle. At 0 degrees the ears face sideways (orthogonal to the face);
at 90 degrees they face forward. Positive depth offsets move the ears toward the
face; positive vertical offsets move them upward. For example,
`defineHuman({ head: { ears: { size: 1.15, depthOffset: 2, verticalOffset: -3,
facingAngle: 45 } } })` uses a scale factor, millimeters, and degrees.
Size is applied around each ear's anchor, independently of the general part transforms.
The ear bases conform to the head mesh across the size, placement, and facing ranges.
The attachment edge follows the head during ear wiggles; the earlobe toggle still
controls whether the lobes themselves hang free.
Ears use a polar-grid shell with a concha depression, branching antihelix, tragus,
and a curled helix rim.
The playground's strain heatmap shows the largest surface stretch or compression relative to the
rest shape, from blue (none) to red (50% or more); it updates with animation and facial morphs.

## Source layout

```
src/
  <section>/api/      headless, DOM-free logic
  <section>/editor/   interactive tooling built from ui components
  humans/             prebuilt codified humans (bundled)
```

Sections: `mesh`, `rigging`, `textures`, `materials`, `animations`, `lighting`, `codegen`, `physics`, `ui`.

## Development

```sh
npm install
npm run dev        # demo app (examples/), served by Vite
npm run build      # library build to dist/ (tsdown)
npm run typecheck
npm test
```

## Testing

```sh
npm test              # unit tests (Node, headless character generation, animation snapshot)
npm run test:visual   # Playwright screenshots of the example pages in ?test mode
```

In `?test` mode the example pages render at full quality but only draw a frame after something changes
(see `examples/test-mode.js`), so CI's software WebGL stays fast.

Visual baselines are stored per platform in `test/visual/__screenshots__/` (`*-win32.png`, `*-linux.png`, ...).
CI writes missing Linux baselines on its first run and uploads them as the `visual-three-*` artifacts:
download them, check them, and commit them so later runs compare against them. After an intentional visual
change, run `npm run test:visual:update` and commit the new images.

The height regression test uses **half-height and double-height** characters in neutral,
deep-squat/raised-arm and twisted-lunge poses. Each sheet shows front, side, back and oblique
views (short above tall). Run it with `npm run test:visual -- --grep "height extremes"`.

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets) and npm trusted publishing (no npm token):

1. One-time setup on npmjs.com: package **@kieranb662/procedural-human** → Settings → Trusted publishing →
   add GitHub Actions with repository `kieranb662/ProceduralHuman` and workflow `release.yml`.
2. Describe changes with `npm run changeset` in your PR.
3. On `main`, the Release workflow opens a "Version Packages" PR; merging it publishes to npm with provenance.
   With no pending changesets, any version not yet on npm (e.g. the initial 0.1.0) is published.

## License

MIT

## Migration status

The library is being extracted from the original single-file prototype in stages:

1. ✅ Package scaffolding; prototype runs unchanged as the Vite demo (`examples/default-male`).
2. ✅ Prototype library code split into section modules under `src/` (verified identical output in the demo).
3. ✅ Public types (`ProceduralCharacter`, `CharacterOptions`, `HeadDesign`, `Palette`, ...); headless unit tests.
4. ✅ Data-driven code generation (`captureHumanDesign` + `generateHumanModule`) and the first bundled preset (`defaultAdultMale`).
5. ✅ Character factory split into section controllers; studio lighting; `ph-*` web components and section editors (including the viewport head sculptor).
6. ✅ `dispose()`, strict TypeScript across every section, Playwright visual tests (oldest and newest supported three), CI and Changesets release workflow.
