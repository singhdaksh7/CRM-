import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { assertSafeBaseUrl } from "./tests/e2e/helpers/safety-guard";

dotenv.config({ path: process.env.E2E_ENV_FILE ?? ".env.qa" });

const PORT = process.env.E2E_PORT ?? "3100";
// localhost, not 127.0.0.1: Next dev's webpack-hmr WebSocket upgrade
// rejects the 127.0.0.1 origin, which cascades into breaking client-side
// interactivity (reproduced directly - see .env.qa for detail). Both hosts
// are equally local per assertSafeBaseUrl's ALLOWED_HOSTS.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Fail fast at config-load time, before any browser is launched.
assertSafeBaseUrl(baseURL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 retry locally too, not just CI: `next dev`'s on-demand-entries /
  // Fast Refresh occasionally serves a corrupted chunk under sustained
  // rapid sequential navigation (observed as a one-off "Invalid or
  // unexpected token" pageerror breaking a single login) - reproducibly
  // transient, never on an isolated re-run of the same test. A retry
  // absorbs that dev-server characteristic instead of every local run
  // needing a manual re-run.
  retries: process.env.CI ? 1 : 1,
  workers: 1,
  reporter: [["html", { outputFolder: "test-results/html-report", open: "never" }], ["list"]],
  timeout: 30_000,
  globalSetup: "./tests/e2e/setup/global-setup.ts",
  outputDir: "test-results/artifacts",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    { name: "setup", testMatch: /setup\/auth\.setup\.ts/ },

    { name: "admin", testDir: "./tests/e2e/admin", use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/admin.json" }, dependencies: ["setup"] },
    { name: "data-manager", testDir: "./tests/e2e/data-manager", use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/data-manager.json" }, dependencies: ["setup"] },
    { name: "field-executive", testDir: "./tests/e2e/field-executive", use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/field-executive.json" }, dependencies: ["setup"] },
    { name: "public", testDir: "./tests/e2e/public", use: { ...devices["Desktop Chrome"] } },
    { name: "responsive", testDir: "./tests/e2e/responsive", use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/admin.json" }, dependencies: ["setup"] },
  ],

  webServer: {
    // `next start` runs with NODE_ENV=production, and this app's own env
    // validation (src/lib/env.ts) correctly refuses a non-https NEXTAUTH_URL
    // in production - a safety guard we must not weaken. Using the dev
    // server for local QA is the sanctioned fallback for exactly this case.
    command: "npm run dev -- -p " + PORT,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT,
    } as Record<string, string>,
  },
});
