// Playwright no va en package.json del frontend (el Docker hace npm ci con devDeps).
// Ejecutar con una instalación aparte, p. ej. /tmp/pw: NODE_PATH=/tmp/pw/node_modules npx --prefix /tmp/pw playwright test --config e2e/playwright.config.mjs
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.FRONTEND_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.E2E_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;

const viewports = [
  { name: "mobile", viewport: { width: 390, height: 844 } },
  { name: "desktop", viewport: { width: 1280, height: 800 } },
];

const browsers = [
  { name: "chromium", device: devices["Desktop Chrome"] },
  { name: "firefox", device: devices["Desktop Firefox"] },
  { name: "webkit", device: devices["Desktop Safari"] },
];

export default defineConfig({
  testDir: path.dirname(fileURLToPath(import.meta.url)),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 3,
  reporter: [["list"]],
  outputDir: "/tmp/pw-results/test-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    locale: "es-BO",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: root,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: browsers.flatMap((b) =>
    viewports.map((v) => ({
      name: `${b.name}-${v.name}`,
      use: {
        ...b.device,
        viewport: v.viewport,
        isMobile: undefined,
        hasTouch: v.name === "mobile",
      },
    })),
  ),
});
