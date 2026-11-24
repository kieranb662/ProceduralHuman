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

Visual baselines are stored per platform in `test/visual/__screenshots__/` (`*-win32.png`, `*-linux.png`, ...).
CI writes missing Linux baselines on its first run and uploads them as the `visual-three-*` artifacts:
download them, check them, and commit them so later runs compare against them. After an intentional visual
change, run `npm run test:visual:update` and commit the new images.

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
