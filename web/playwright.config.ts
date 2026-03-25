import { defineConfig, devices } from "@playwright/test"

// Allow self-signed certs for local HTTPS preview server
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL: "https://localhost:4173",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
      testMatch: /^(?!.*\.(orgadmin|volunteer)\.spec\.ts).*\.spec\.ts$/,
    },
    { name: "setup-orgadmin", testMatch: /auth-orgadmin\.setup\.ts/ },
    {
      name: "orgadmin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/orgadmin.json",
      },
      dependencies: ["setup-orgadmin"],
      testMatch: /.*\.orgadmin\.spec\.ts/,
    },
    { name: "setup-volunteer", testMatch: /auth-volunteer\.setup\.ts/ },
    {
      name: "volunteer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/volunteer.json",
      },
      dependencies: ["setup-volunteer"],
      testMatch: /.*\.volunteer\.spec\.ts/,
    },
  ],

  webServer: {
    command: "npm run preview",
    url: "https://localhost:4173",
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 60_000,
  },
})
