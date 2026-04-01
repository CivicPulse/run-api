import { defineConfig, devices } from "@playwright/test"
import fs from "fs"
import path from "path"

// Allow self-signed certs for local HTTPS preview server
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

// ── Optimization: Auth state caching (#7) ───────────────────────────────────
// Skip auth setup when cached tokens are fresh (< 30 min old).
// Delete playwright/.auth/ to force re-auth.
const AUTH_DIR = path.join(import.meta.dirname, "playwright/.auth")
const AUTH_MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

function isAuthFresh(role: string): boolean {
  try {
    const file = path.join(AUTH_DIR, `${role}.json`)
    const stat = fs.statSync(file)
    return Date.now() - stat.mtimeMs < AUTH_MAX_AGE_MS
  } catch {
    return false
  }
}

const allAuthFresh =
  ["owner", "admin", "manager", "volunteer", "viewer"].every(isAuthFresh)

// ── Optimization: Dev server mode (#3) ──────────────────────────────────────
// Set E2E_USE_DEV_SERVER=1 to skip build+preview and use the docker-compose
// web dev server on :5173 (faster iteration, no build step).
const useDevServer = process.env.E2E_USE_DEV_SERVER === "1"
const baseURL = useDevServer
  ? "http://localhost:5173"
  : "https://localhost:4173"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 16,
  reporter: process.env.CI ? "blob" : "html",

  timeout: 60_000,
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    // Valid Playwright option; type defs lag behind runtime API
    ...({ reducedMotion: "reduce" } as Record<string, unknown>),
  },

  projects: [
    // ── Optimization: Single shared auth setup (#1) ─────────────────────────
    // One setup project authenticates ALL roles in sequence.
    // When auth is cached (#7), this project is skipped entirely.
    { name: "setup-owner", testMatch: /auth-owner\.setup\.ts/ },
    { name: "setup-admin", testMatch: /auth-admin\.setup\.ts/ },
    { name: "setup-manager", testMatch: /auth-manager\.setup\.ts/ },
    { name: "setup-volunteer", testMatch: /auth-volunteer\.setup\.ts/ },
    { name: "setup-viewer", testMatch: /auth-viewer\.setup\.ts/ },

    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/owner.json",
      },
      dependencies: allAuthFresh
        ? []
        : [
            "setup-owner",
            "setup-admin",
            "setup-manager",
            "setup-volunteer",
            "setup-viewer",
          ],
      testIgnore: /.*\.setup\.ts/,
      testMatch:
        /^(?!.*\.(admin|manager|volunteer|viewer)\.spec\.ts).*\.spec\.ts$/,
    },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: allAuthFresh
        ? []
        : [
            "setup-owner",
            "setup-admin",
            "setup-manager",
            "setup-volunteer",
            "setup-viewer",
          ],
      testMatch: /.*\.admin\.spec\.ts/,
    },
    {
      name: "manager",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/manager.json",
      },
      dependencies: allAuthFresh
        ? []
        : [
            "setup-owner",
            "setup-admin",
            "setup-manager",
            "setup-volunteer",
            "setup-viewer",
          ],
      testMatch: /.*\.manager\.spec\.ts/,
    },
    {
      name: "volunteer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/volunteer.json",
      },
      dependencies: allAuthFresh
        ? []
        : [
            "setup-owner",
            "setup-admin",
            "setup-manager",
            "setup-volunteer",
            "setup-viewer",
          ],
      testMatch: /.*\.volunteer\.spec\.ts/,
    },
    {
      name: "viewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/viewer.json",
      },
      dependencies: allAuthFresh
        ? []
        : [
            "setup-owner",
            "setup-admin",
            "setup-manager",
            "setup-volunteer",
            "setup-viewer",
          ],
      testMatch: /.*\.viewer\.spec\.ts/,
    },
  ],

  // Skip webServer entirely when using dev server or when explicitly
  // started externally (parallel test script).
  ...(useDevServer
    ? {}
    : {
        webServer: {
          command: "npm run preview",
          url: "https://localhost:4173",
          reuseExistingServer: !process.env.CI,
          ignoreHTTPSErrors: true,
          timeout: 60_000,
        },
      }),
})
