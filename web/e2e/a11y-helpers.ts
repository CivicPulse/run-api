import type { Page } from "@playwright/test"

/**
 * Shared constants and helpers for a11y specs that use mocked APIs.
 *
 * The OIDC storage key must match the authority + client_id that the
 * app's UserManager will be configured with.  Since these specs mock
 * /api/v1/config/public, we use stable mock values here.
 */

export const MOCK_AUTHORITY = "http://mock-zitadel:8080"
export const MOCK_CLIENT_ID = "mock-client-id"
export const MOCK_PROJECT_ID = "mock-project-id"
export const OIDC_STORAGE_KEY = `oidc.user:${MOCK_AUTHORITY}:${MOCK_CLIENT_ID}`

/**
 * Return a JSON-serialised mock OIDC user object compatible with oidc-client-ts.
 */
export function mockOidcUser(overrides?: { sub?: string; name?: string; email?: string; role?: string }): string {
  const role = overrides?.role ?? "owner"
  return JSON.stringify({
    id_token: "mock-id-token",
    session_state: null,
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: overrides?.sub ?? "mock-user-a11y",
      name: overrides?.name ?? "Test Admin",
      email: overrides?.email ?? "admin@test.com",
      [`urn:zitadel:iam:org:project:${MOCK_PROJECT_ID}:roles`]: {
        [role]: { "mock-org": "mock-org" },
      },
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })
}

/**
 * Inject mock OIDC user into localStorage before the page loads.
 */
export async function setupMockAuth(page: Page, overrides?: { sub?: string; name?: string; email?: string }) {
  await page.addInitScript(
    ({ key, user }: { key: string; user: string }) => {
      localStorage.setItem(key, user)
    },
    { key: OIDC_STORAGE_KEY, user: mockOidcUser(overrides) },
  )
}

/**
 * Mock the /api/v1/config/public endpoint to return values that
 * match MOCK_AUTHORITY and MOCK_CLIENT_ID.  Call this BEFORE setting
 * up other API mocks so the config response is correct.
 */
export async function mockConfigEndpoint(page: Page) {
  await page.route("**/api/v1/config/public", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        zitadel_issuer: MOCK_AUTHORITY,
        zitadel_client_id: MOCK_CLIENT_ID,
        zitadel_project_id: MOCK_PROJECT_ID,
      }),
    }),
  )
}
