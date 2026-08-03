import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./qa/playwright",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4177", channel: "chrome", colorScheme: "dark", reducedMotion: "reduce" },
  webServer: { command: "bun run scripts/serve-ui-harness.ts", port: 4177, reuseExistingServer: true },
  reporter: [["list"]],
});
