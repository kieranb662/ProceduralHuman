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

## License

MIT

## Migration status

The library is being extracted from the original single-file prototype in stages:

1. ✅ Package scaffolding; prototype runs unchanged as the Vite demo (`examples/default-male`).
2. ✅ Prototype library code split into section modules under `src/` (verified identical output in the demo).
3. ✅ Public types (`ProceduralCharacter`, `CharacterOptions`, `HeadDesign`, `Palette`, ...); headless unit tests.
4. ✅ Data-driven code generation (`captureHumanDesign` + `generateHumanModule`) and the first bundled preset (`defaultAdultMale`).
5. ⏳ Split `createAdultMaleCharacter` orchestration; lighting, physics and editor layers; web components.
6. ⏳ `rng` option, `dispose()`, unit tests; strict TypeScript; CI publishing.
