import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV } from "./e2e/env";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One dev server and one database: keep tests sequential.
  workers: 1,
  fullyParallel: false,
  use: { ...devices["Desktop Chrome"], baseURL: E2E_BASE_URL },
  projects: [
    // Runs first, against the freshly reset (empty) database.
    { name: "empty", testMatch: /empty\.spec\.ts/ },
    { name: "setup", testMatch: /\.setup\.ts/, dependencies: ["empty"] },
    { name: "chromium", dependencies: ["setup"], testIgnore: [/\.setup\.ts/, /empty\.spec\.ts/] },
  ],
  webServer: {
    // Production build, not `next dev`: dev HMR can reload-loop pages mid-test.
    command: "bash scripts/e2e-server.sh",
    url: `${E2E_BASE_URL}/robots.txt`,
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
