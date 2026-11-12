import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3456",
  },
  webServer: {
    command: "npm run start -- --port 3456",
    url: "http://127.0.0.1:3456/shell-check",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "android",
      use: { ...devices["Pixel 5"], browserName: "chromium" },
      testMatch: /nav-speed.spec.ts/,
    },
  ],
});
