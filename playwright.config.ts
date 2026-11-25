import { defineConfig, devices } from "@playwright/test";

// Visual regression tests for the example pages. Pages run in ?test mode (frozen time, seeded rng).
// Baselines are per platform; regenerate with `npm run test:visual:update`.
export default defineConfig({
  testDir: "test/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{platform}{ext}",
  timeout: 300_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: {
    timeout: 30_000,
    toHaveScreenshot: { timeout: 60_000, maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      // Software WebGL keeps rendering identical across machines without a GPU.
      launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    },
  }],
  webServer: {
    command: "npx vite --port 4173 --strictPort",
    url: "http://localhost:4173/default-male/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
