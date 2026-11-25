import { expect, test, type Page } from "@playwright/test";

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
    await expect(page.locator("#statsLine")).toContainText("84 Bones");
    await expect(page.locator("#statsLine")).toContainText("111,382 Verts");
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
    expect(errors).toEqual([]);
  });
});

test.describe("editor playground", () => {
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
