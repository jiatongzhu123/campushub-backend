import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const baseURL: string = "http://127.0.0.1:5173";
const runId: string = randomUUID();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    [resolve(__dirname, "e2e/mongo-cleanup-reporter.ts"), { rootDir: __dirname, runId }],
  ],
  use: {
    baseURL,
    headless: true,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: [
    {
      command: "npm run build && node dist/e2e/server.js",
      url: "http://127.0.0.1:3000/api/v1/health",
      timeout: 180_000,
      reuseExistingServer: false,
      env: { CAMPUSHUB_E2E_RUN_ID: runId },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
      cwd: resolve(__dirname, "client"),
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
