import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          // Projects run one after the other: CPU-heavy crypto tests (Argon2id, 10k seals)
          // time out when they share the machine with the browser project's Argon2id.
          sequence: { groupOrder: 0 },
          include: ["src/**/*.test.ts"],
          setupFiles: ["src/test/fast-kdf.ts"],
        },
      },
      {
        // Component tests in a real browser (CLAUDE.md: "component (browser mode)"). The
        // installed Chrome is used, locally and on GitHub's runners, so nothing is downloaded.
        resolve: { alias },
        test: {
          name: "browser",
          sequence: { groupOrder: 1 },
          include: ["src/**/*.browser.test.tsx"],
          setupFiles: ["src/test/fast-kdf.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: "chrome" } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
