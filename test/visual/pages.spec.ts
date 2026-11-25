import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import type { Mesh } from "three";
import type { ProceduralCharacter } from "../../src/index.js";

/** Waits until the page has drawn every pending change (pages render on demand in ?test mode). */
async function settled(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __phSettled?: () => boolean }).__phSettled?.() === true, null, { timeout: 120_000 });
}

/** Opens an example page in deterministic test mode and waits for the first rendered frame. */
async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${path}?test`);
  await page.waitForFunction(() => (window as unknown as { __phReady?: boolean }).__phReady === true, null, { timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  return errors;
}

test.describe("default-male demo", () => {
  test("renders the character and editor panel", async ({ page }) => {
    const errors = await open(page, "/default-male/");
    await expect(page.locator("#statsLine")).toContainText("86 Bones");
    await expect(page.locator("#statsLine")).toContainText("125,412 Verts");
    await expect(page).toHaveScreenshot("default-male.png");
    expect(errors).toEqual([]);
  });

  test("head sculpt mode frames the face and records brush strokes", async ({ page }) => {
    const errors = await open(page, "/default-male/");
    await page.getByRole("tab", { name: "Head" }).click();
    await settled(page);
    await expect(page).toHaveScreenshot("head-sculpt.png");

    const canvas = page.locator("#viewport canvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.36, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.33, box.y + box.height * 0.66, { steps: 8 });
    await page.mouse.up();
    const strokes = await page.evaluate(() => (document.querySelector("ph-head-editor") as unknown as { headDesign: { strokes: unknown[] } }).headDesign.strokes.length);
    expect(strokes).toBeGreaterThan(0);
    const attached = page.getByRole("checkbox", { name: "Attached earlobes", exact: true });
    await expect(attached).not.toBeChecked();
    await attached.check();
    const hasAttachedLobes = () => page.evaluate(() => (document.querySelector("ph-head-editor") as unknown as {
      headDesign: { attachedEarlobes?: boolean };
    }).headDesign.attachedEarlobes ?? false);
    expect(await hasAttachedLobes()).toBe(true);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(attached).not.toBeChecked();
    expect(await hasAttachedLobes()).toBe(false);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(attached).toBeChecked();
    expect(await hasAttachedLobes()).toBe(true);
    expect(errors).toEqual([]);
  });

  test("ear controls preview and preserve size, placement and facing", async ({ page }) => {
    const errors = await open(page, "/default-male/");
    await page.getByRole("tab", { name: "Head" }).click();
    const size = page.getByRole("slider", { name: "Ear size", exact: true });
    const vertical = page.getByRole("slider", { name: "Ear vertical offset (mm)", exact: true });
    const depth = page.getByRole("slider", { name: "Ear depth offset (mm)", exact: true });
    const facing = page.getByRole("slider", { name: "Ear facing angle", exact: true });
    await expect(size).toHaveValue("100");
    await expect(vertical).toHaveValue("0");
    await expect(depth).toHaveValue("0");
    await expect(facing).toHaveValue("0");
    await expect(facing).toHaveAttribute("min", "0");
    await expect(facing).toHaveAttribute("max", "90");
    const earVertices = () => page.evaluate(() => {
      const { character } = (window as unknown as { proceduralHuman: { character: ProceduralCharacter } }).proceduralHuman;
      const preview = character.root.getObjectByName("NeutralHeadEditor") as Mesh | undefined;
      if (!preview) throw new Error("Missing head preview");
      const positions = preview.geometry.attributes.position, indices = preview.geometry.attributes.skinIndex;
      const top = (side: "L" | "R") => {
        const bone = character.rig.boneIndex.get(`Ear_${side}`);
        let vertex = -1;
        for (let i = 0; i < indices.count; i++) {
          if (indices.getX(i) === bone && (vertex < 0 || positions.getY(i) > positions.getY(vertex))) vertex = i;
        }
        if (vertex < 0) throw new Error(`Missing ear ${side}`);
        return [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)];
      };
      return { L: top("L"), R: top("R") };
    });
    const original = await earVertices();
    await size.press("End");
    const expectedHeight = 1.656 + (original.L[1] - 1.656) * 1.3;
    await expect.poll(async () => (await earVertices()).L[1]).toBeCloseTo(expectedHeight, 5);
    await vertical.press("Home");
    await expect.poll(async () => (await earVertices()).L[1]).toBeCloseTo(expectedHeight - 0.02, 5);
    await depth.press("End");
    const leftZ = -0.008 + (original.L[2] + 0.008) * 1.3;
    const rightZ = -0.008 + (original.R[2] + 0.008) * 1.3;
    await expect.poll(async () => (await earVertices()).L[2]).toBeCloseTo(leftZ + 0.015, 5);
    await expect.poll(async () => (await earVertices()).R[2]).toBeCloseTo(rightZ + 0.015, 5);
    const earDesign = () => page.evaluate(() => (document.querySelector("ph-head-editor") as unknown as {
      headDesign: { ears?: { size?: number; verticalOffset?: number; depthOffset?: number; facingAngle?: number } };
    }).headDesign.ears);
    expect(await earDesign()).toEqual({ size: 1.3, verticalOffset: -20, depthOffset: 15 });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(depth).toHaveValue("0");
    expect(await earDesign()).toEqual({ size: 1.3, verticalOffset: -20 });
    await expect.poll(async () => (await earVertices()).L[2]).toBeCloseTo(leftZ, 5);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(depth).toHaveValue("15");
    await expect.poll(async () => (await earVertices()).L[2]).toBeCloseTo(leftZ + 0.015, 5);
    const forwardSeparation = () => page.evaluate(() => {
      const { character } = (window as unknown as { proceduralHuman: { character: ProceduralCharacter } }).proceduralHuman;
      const preview = character.root.getObjectByName("NeutralHeadEditor") as Mesh | undefined;
      if (!preview) throw new Error("Missing head preview");
      const pos = preview.geometry.attributes.position, indices = preview.geometry.attributes.skinIndex;
      return (["L", "R"] as const).map((side) => {
        const bone = character.rig.boneIndex.get(`Ear_${side}`);
        const ear = Array.from({ length: indices.count }, (_, i) => i).filter((i) => indices.getX(i) === bone);
        if (!ear.length || ear.length % 2) throw new Error(`Missing ear ${side}`);
        return pos.getZ(ear[0]) - pos.getZ(ear[ear.length / 2]);
      });
    });
    await facing.press("End");
    await expect.poll(async () => Math.min(...await forwardSeparation())).toBeGreaterThan(0.001);
    expect(await earDesign()).toEqual({ size: 1.3, verticalOffset: -20, depthOffset: 15, facingAngle: 90 });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(facing).toHaveValue("0");
    await expect.poll(async () => Math.max(...(await forwardSeparation()).map(Math.abs))).toBeLessThan(0.00001);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(facing).toHaveValue("90");
    await expect.poll(async () => Math.min(...await forwardSeparation())).toBeGreaterThan(0.001);
    await page.getByRole("tab", { name: "Animate", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as {
      proceduralHuman: { character: { headDesign: { ears?: object } } };
    }).proceduralHuman.character.headDesign.ears)).toEqual({ size: 1.3, verticalOffset: -20, depthOffset: 15, facingAngle: 90 });
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __phReady?: boolean }).__phReady === true, null, { timeout: 120_000 });
    await page.getByRole("tab", { name: "Head" }).click();
    await expect(size).toHaveValue("130");
    await expect(vertical).toHaveValue("-20");
    await expect(depth).toHaveValue("15");
    await expect(facing).toHaveValue("90");
    expect(errors).toEqual([]);
  });
});

test.describe("editor playground", () => {
  test("debug controls stay in the viewport and control the scene", async ({ page }) => {
    const errors = await open(page, "/editor-playground/");
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const overlay = page.getByRole("region", { name: "Debug controls" });
    const skeleton = overlay.getByRole("button", { name: "Skeleton" });
    const wireframe = overlay.getByRole("button", { name: "Wireframe" });
    const capsule = overlay.getByRole("button", { name: "Collider" });
    const strain = overlay.getByRole("button", { name: "Strain heatmap" });
    const sceneState = () => page.evaluate(() => {
      const { scene, character } = (window as unknown as {
        playground: {
          scene: { children: { type: string; name: string; visible: boolean }[] };
          character: { skinnedMesh: {
            material: { wireframe: boolean }[];
            children: { name: string; visible: boolean }[];
          } };
        };
      }).playground;
      return {
        skeleton: scene.children.find((child) => child.type === "SkeletonHelper")?.visible,
        wireframe: character.skinnedMesh.material.every((material) => material.wireframe),
        capsule: scene.children.find((child) => child.name === "PhysicsCapsuleDebug")?.visible,
        strain: character.skinnedMesh.children.find((child) => child.name === "StrainHeatmap")?.visible,
      };
    });
    const materialIds = () => page.evaluate(() => (window as unknown as {
      playground: { character: { skinnedMesh: { material: { uuid: string }[] } } };
    }).playground.character.skinnedMesh.material.map((material) => material.uuid));

    await expect(overlay).toBeVisible();
    for (const button of [skeleton, wireframe, capsule, strain]) await expect(button).toHaveAttribute("aria-pressed", "false");
    expect(await sceneState()).toEqual({ skeleton: false, wireframe: false, capsule: false, strain: false });
    const originalMaterials = await materialIds();
    await skeleton.focus();
    await page.keyboard.press("Space");
    await wireframe.click();
    await capsule.click();
    await strain.click();
    for (const button of [skeleton, wireframe, capsule, strain]) await expect(button).toHaveAttribute("aria-pressed", "true");
    expect(await sceneState()).toEqual({ skeleton: true, wireframe: true, capsule: true, strain: true });
    expect(await materialIds()).toEqual(originalMaterials);
    await settled(page);
    await page.evaluate(() => {
      const { character } = (window as unknown as {
        playground: { character: { palette: object; setPalette: (palette: object) => void } };
      }).playground;
      character.setPalette(character.palette);
      for (const section of ["materials", "animations"]) {
        document.dispatchEvent(new CustomEvent("ph-change", { detail: { section } }));
      }
    });
    const rebuiltMaterials = await materialIds();
    expect(rebuiltMaterials).not.toEqual(originalMaterials);
    expect(await sceneState()).toEqual({ skeleton: true, wireframe: true, capsule: true, strain: true });
    await settled(page);
    await page.getByRole("tab", { name: "Lighting" }).click();
    await expect(overlay).toBeVisible();
    await skeleton.click();
    await wireframe.click();
    await capsule.click();
    await strain.click();
    for (const button of [skeleton, wireframe, capsule, strain]) await expect(button).toHaveAttribute("aria-pressed", "false");
    expect(await sceneState()).toEqual({ skeleton: false, wireframe: false, capsule: false, strain: false });
    expect(await materialIds()).toEqual(rebuiltMaterials);

    for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }, { width: 320, height: 812 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => {
        const canvasBox = (await page.locator("#viewport canvas").boundingBox())!;
        const overlayBox = (await overlay.boundingBox())!;
        return [
          Math.round(canvasBox.x + canvasBox.width - (overlayBox.x + overlayBox.width)),
          Math.round(canvasBox.y + canvasBox.height - (overlayBox.y + overlayBox.height)),
        ];
      }).toEqual([12, 12]);
      for (const button of [skeleton, wireframe, capsule, strain]) await expect(button).toBeInViewport({ ratio: 1 });
    }
    expect(errors).toEqual([]);
  });

  test("strain heatmap measures deformation and restores the original material", async ({ page }) => {
    const errors = await open(page, "/editor-playground/");
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const samples = await page.evaluate(async (moduleUrl) => {
      const { sampleStrainHeatmap } = await import(moduleUrl);
      return sampleStrainHeatmap() as Record<string, number[]>;
    }, `/@fs/${path.resolve("test/visual/strain-scene.js")}`);
    expect(samples.original).toEqual(samples.restored);
    expect(samples.neutral[2]).toBeGreaterThan(samples.neutral[0]);
    for (let i = 0; i < 3; i++) expect(Math.abs(samples.rigid[i] - samples.neutral[i])).toBeLessThan(8);
    expect(samples.mild[1]).toBeGreaterThan(samples.neutral[1]);
    expect(samples.moderate[1]).toBeGreaterThan(samples.moderate[0]);
    expect(samples.moderate[1]).toBeGreaterThan(samples.moderate[2]);
    for (const name of ["stretch", "compression", "shear", "morphed", "replacement"]) {
      expect(samples[name][0], name).toBeGreaterThan(samples[name][2]);
      expect(samples[name][0], name).toBeGreaterThan(samples[name][1]);
    }
    expect(errors).toEqual([]);
  });

  test("lighting and materials editors render", async ({ page }) => {
    const errors = await open(page, "/editor-playground/");
    await page.getByRole("tab", { name: "Lighting" }).click();
    await settled(page);
    await expect(page).toHaveScreenshot("playground-lighting.png");
    await page.getByRole("tab", { name: "Materials" }).click();
    await settled(page);
    await expect(page).toHaveScreenshot("playground-materials.png");
    expect(errors).toEqual([]);
  });
});

test.describe("height customization", () => {
  test("height extremes retain their surfaces in multi-angle stress poses", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1440 });
    const errors = await open(page, "/default-male/");
    await page.getByRole("tab", { name: "Torso" }).click();
    const slider = page.getByRole("slider", { name: "Height", exact: true });
    await expect(slider).toHaveAttribute("min", "0.5");
    await expect(slider).toHaveAttribute("max", "2");
    await slider.fill(String(1 / 2));
    expect(await page.evaluate(() => (window as unknown as { proceduralHuman: { character: { height: number } } }).proceduralHuman.character.height)).toBe(1 / 2);
    await slider.fill("2");
    await page.getByRole("button", { name: "Reset Height", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { proceduralHuman: { character: { height: number } } }).proceduralHuman.character.height)).toBe(1);

    for (const pose of ["neutral", "squat", "twist"] as const) {
      const metrics = await page.evaluate(async ({ moduleUrl, pose }) => {
        const { renderHeightStress } = await import(moduleUrl);
        return renderHeightStress(pose) as { height: number; finite: boolean; minAreaRatio: number; maxAreaRatio: number }[];
      }, { moduleUrl: `/@fs/${path.resolve("test/visual/height-scene.ts")}`, pose });
      expect(metrics.every((m) => m.finite)).toBe(true);
      for (const metric of metrics) {
        expect(metric.minAreaRatio, `${pose} at ${metric.height}x: collapsed surface triangle`).toBeGreaterThan(0.01);
        expect(metric.maxAreaRatio, `${pose} at ${metric.height}x: stretched surface triangle`).toBeLessThan(8);
      }
      const canvas = page.locator("#height-stress");
      await testInfo.attach(`height-${pose}-front-side-back-oblique`, { body: await canvas.screenshot(), contentType: "image/png" });
      await expect(canvas).toHaveScreenshot(`height-${pose}.png`, { maxDiffPixelRatio: 0, maxDiffPixels: 0 });
    }
    expect(errors).toEqual([]);
  });
});
