// End-to-end specs (ADR-0035). Needs the `nwt-e2e` services from compose.e2e.yml (or the
// CI service containers): Postgres on 55432, Mailpit on 1025/8025. The app is a production
// build served on :3100, migrated first. Separate from Vitest: `pnpm e2e`.
import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_ORIGIN } from "./e2e/env";

export default defineConfig({
  testDir: "e2e",
  // Specs share one database and walk multi-user flows: run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "pnpm db:migrate && pnpm build && pnpm start -p 3100",
    url: `${E2E_ORIGIN}/api/health`,
    env: E2E_ENV,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
