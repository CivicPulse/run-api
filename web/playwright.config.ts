import { defineConfig, devices } from "@playwright/test"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const WORKTREE_WEB_DIR = import.meta.dirname
const LOCAL_AUTH_DIR = path.join(WORKTREE_WEB_DIR, "playwright/.auth")
const AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function resolveSharedAuthDir(): string | null {
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd: WORKTREE_WEB_DIR,
      encoding: "utf8",
    }).trim()
    const repoRoot = path.resolve(gitCommonDir, "..")
    return path.join(repoRoot, "web/playwright/.auth")
  } catch {
    return null
  }
}

const SHARED_AUTH_DIR = resolveSharedAuthDir()
const forceAuthSetup = process.env.PLAYWRIGHT_FORCE_AUTH_SETUP === "1"

function authStatePath(role: string): string {
  const localFile = path.join(LOCAL_AUTH_DIR, `${role}.json`)
  if (fs.existsSync(localFile)) return localFile

  if (SHARED_AUTH_DIR) {
    const sharedFile = path.join(SHARED_AUTH_DIR, `${role}.json`)
    if (fs.existsSync(sharedFile)) return sharedFile
  }

  return localFile
}

function isAuthFresh(role: string): boolean {
  for (const authDir of [LOCAL_AUTH_DIR, SHARED_AUTH_DIR].filter(
    (dir): dir is string => Boolean(dir),
  )) {
    try {
      const stat = fs.statSync(path.join(authDir, `${role}.json`))
      if (Date.now() - stat.mtimeMs < AUTH_MAX_AGE_MS) return true
    } catch {
      // Try the next location.
    }
  }

  return false
}

const allAuthFresh =
  !forceAuthSetup &&
  ["owner", "admin", "manager", "volunteer", "viewer"].every(isAuthFresh)

const setupProjectNames = [
  "setup-owner",
  "setup-admin",
  "setup-manager",
  "setup-volunteer",
  "setup-viewer",
]

const useDevServer = process.env.E2E_USE_DEV_SERVER !== "0"
// Allow pointing at an external (docker) dev server. When E2E_DEV_SERVER_URL
// is set, skip the built-in webServer and use that URL directly — this is
// the path used when the web container publishes Vite on a non-default
// host port (e.g., 49372) and we want Playwright to reuse it instead of
// spawning its own preview build.
const externalDevServerUrl = process.env.E2E_DEV_SERVER_URL || ""
const baseURL =
  externalDevServerUrl ||
  (useDevServer ? "https://localhost:5173" : "https://localhost:4173")

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
    ...({ reducedMotion: "reduce" } as Record<string, unknown>),
  },

  projects: [
    ...(!allAuthFresh
      ? [
          { name: "setup-owner", testMatch: /auth-owner\.setup\.ts/ },
          { name: "setup-admin", testMatch: /auth-admin\.setup\.ts/ },
          { name: "setup-manager", testMatch: /auth-manager\.setup\.ts/ },
          { name: "setup-volunteer", testMatch: /auth-volunteer\.setup\.ts/ },
          { name: "setup-viewer", testMatch: /auth-viewer\.setup\.ts/ },
        ]
      : []),
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath("owner"),
      },
      dependencies: allAuthFresh ? [] : setupProjectNames,
      testIgnore: /.*\.setup\.ts/,
      testMatch: /^(?!.*\.(admin|manager|volunteer|viewer)\.spec\.ts).*\.spec\.ts$/,
    },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath("admin"),
      },
      dependencies: allAuthFresh ? [] : setupProjectNames,
      testMatch: /.*\.admin\.spec\.ts/,
    },
    {
      name: "manager",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath("manager"),
      },
      dependencies: allAuthFresh ? [] : setupProjectNames,
      testMatch: /.*\.manager\.spec\.ts/,
    },
    {
      name: "volunteer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath("volunteer"),
      },
      dependencies: allAuthFresh ? [] : setupProjectNames,
      testMatch: /.*\.volunteer\.spec\.ts/,
    },
    {
      name: "viewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath("viewer"),
      },
      dependencies: allAuthFresh ? [] : setupProjectNames,
      testMatch: /.*\.viewer\.spec\.ts/,
    },
  ],

  // When E2E_DEV_SERVER_URL is set, skip the built-in webServer entirely —
  // we're running against an already-running external server (typically the
  // docker web container) and Playwright should NOT try to spawn its own.
  webServer: externalDevServerUrl
    ? undefined
    : useDevServer
      ? {
          command: "npm run dev -- --host localhost --port 5173 --strictPort",
          url: "https://localhost:5173",
          reuseExistingServer: !process.env.CI,
          ignoreHTTPSErrors: true,
          timeout: 120_000,
        }
      : {
          command: "npm run preview -- --host localhost --strictPort --port 4173",
          url: "https://localhost:4173",
          reuseExistingServer: !process.env.CI,
          ignoreHTTPSErrors: true,
          timeout: 120_000,
        },
})
