import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  captureHumanDesign, createAdultMaleCharacter, createHuman, defineHuman, generateHumanModule,
} from "../src/index.js";
import { defaultAdultMale } from "../src/humans/index.js";
import { stubCanvas } from "./helpers/stub-canvas.js";

const createCanvas = stubCanvas;

describe("bundled presets", () => {
  // Regenerate with `npm run humans:update` after intentional changes to the defaults or the generator.
  it("default-adult-male.ts is the generator's capture of the default character", async () => {
    const design = captureHumanDesign(createAdultMaleCharacter({ createCanvas }), { name: "Default Adult Male" });
    const code = generateHumanModule(design, {
      language: "ts",
      importFrom: { defineHuman: "../design.js", createHuman: "../create-human.js" },
    });
    await expect(code).toMatchFileSnapshot("../src/humans/presets/default-adult-male.ts");
  });
});

describe("round trip", () => {
  it("createHuman(design) captures back to the identical design", () => {
    expect(captureHumanDesign(createHuman(defaultAdultMale, { createCanvas }), { name: defaultAdultMale.name }))
      .toEqual(defaultAdultMale);
  });

  it("preserves every attribute of a customized human", () => {
    const custom = defineHuman({
      name: "Custom Test Human",
      height: 1 / 2,
      head: { transforms: { ears: { sx: 1.2 } }, features: { chin: 0.4 }, strokes: [
        { target: "skin", mode: "raise", center: [0.02, 1.64, 0.1], delta: [0, 0, 0.002], radius: 0.015, strength: 0.4, mirror: true },
      ] },
      palette: { skin: "#8d5524", textures: { skinPoreDepth: 1.5 } },
      torso: { pectorals: { enabled: true, depth: 30 } },
      outfit: { torso: "shirt", legs: "trousers" },
      pose: { base: "walking", upper: "waving", face: "smiling", hands: { L: "grip" }, faceSliders: { jaw: 0.3 } },
    });
    const character = createHuman(custom, { createCanvas });
    const captured = captureHumanDesign(character, { name: custom.name });
    // Captures add the live per-slot surfaces; everything else must survive unchanged.
    expect({ ...captured, palette: { ...captured.palette, materials: [] } }).toEqual(custom);
    expect(captured.palette.materials).toHaveLength(12);
    expect(captureHumanDesign(createHuman(captured, { createCanvas }), { name: custom.name })).toEqual(captured);
  });
});

describe("generated module", () => {
  it("is a working standalone ES module", async () => {
    const design = defineHuman({ name: "3rd Test Human!", outfit: { feet: "wraps" } });
    const entry = pathToFileURL(path.resolve("src/index.ts")).href;
    const code = generateHumanModule(design, { importFrom: entry });
    const dir = path.resolve("test/.tmp");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "third-test-human.human.js");
    fs.writeFileSync(file, code);
    const mod = await import(pathToFileURL(file).href);
    expect(mod.default).toEqual(design);
    expect(mod.human3rdTestHuman).toEqual(design);
    const human = mod.createHuman3rdTestHuman({ createCanvas });
    expect(human.clothingSlots.feet.item).toBe("wraps");
  });

  it("rejects invalid designs with a clear message", () => {
    expect(() => defineHuman({ pose: { base: "flying" as any } })).toThrow(/pose\.base/);
    expect(() => defineHuman({ outfit: { torso: "cape" as any } })).toThrow(/torso: cape/);
    expect(() => defineHuman({ version: 2 })).toThrow(/version 2/);
  });
});
