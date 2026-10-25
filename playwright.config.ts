import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.ROUTES_TEST_URL || "http://127.0.0.1:31270",
    headless: true,
    proxy: process.env.https_proxy
      ? { server: process.env.https_proxy, bypass: "127.0.0.1,localhost" }
      : undefined,
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
        }
      : {},
  },
});
