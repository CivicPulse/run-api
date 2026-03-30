import { defineConfig, devices } from "@playwright/test"

// Allow self-signed certs for local HTTPS preview server
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? "blob" : "html",

  use: {
    baseURL: "https://localhost:4173",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
  },

  projects: [
    // Owner auth setup (default role)
    { name: "setup-owner", testMatch: /auth-owner\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/owner.json",
      },
      dependencies: ["setup-owner"],
      testIgnore: /.*\.setup\.ts/,
      testMatch: /^(?!.*\.(admin|manager|volunteer|viewer)\.spec\.ts).*\.spec\.ts$/,
    },
    // Admin auth setup
    { name: "setup-admin", testMatch: /auth-admin\.setup\.ts/ },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
      testMatch: /.*\.admin\.spec\.ts/,
    },
    // Manager auth setup
    { name: "setup-manager", testMatch: /auth-manager\.setup\.ts/ },
    {
      name: "manager",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/manager.json",
      },
      dependencies: ["setup-manager"],
      testMatch: /.*\.manager\.spec\.ts/,
    },
    // Volunteer auth setup
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
    // Viewer auth setup
    { name: "setup-viewer", testMatch: /auth-viewer\.setup\.ts/ },
    {
      name: "viewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/viewer.json",
      },
      dependencies: ["setup-viewer"],
      testMatch: /.*\.viewer\.spec\.ts/,
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
