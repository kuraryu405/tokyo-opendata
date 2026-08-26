import { defineConfig } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : undefined,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "user-mobile",
      testMatch: "user-mobile.spec.ts",
      use: { baseURL: "http://localhost:3000" }
    },
    {
      name: "municipality-mobile",
      testMatch: "municipality-mobile.spec.ts",
      use: { baseURL: "http://localhost:3001" }
    }
  ],
  webServer: [
    {
      command: "pnpm dev:user",
      port: 3000,
      reuseExistingServer: !isCi,
      timeout: 120_000
    },
    {
      command: "pnpm dev:municipality",
      port: 3001,
      reuseExistingServer: !isCi,
      timeout: 120_000
    }
  ]
});
