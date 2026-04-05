import { test, expect } from "./fixtures"

/**
 * Phase 73 / H26 / SEC-12 — Server-Side Check-In Enforcement on Call Page
 *
 * Failing-red scaffold that encodes the check-in enforcement behavior
 * Plan 05 must deliver. Today, `web/src/routes/campaigns/$campaignId/
 * phone-banking/sessions/$sessionId/call.tsx` has NO checkedIn guard at
 * all — direct URL navigation to the active calling page completely
 * bypasses the check-in step that lives on the session detail page.
 *
 * Plan 05 must add a server-side check-in status call (GET endpoint) and
 * redirect away from `/call` when the user is not currently checked in.
 */
test.describe("Phase 73: call page server-side check-in enforcement", () => {
  test.setTimeout(60_000)

  test("navigating directly to /call without check-in redirects away from /call", async ({
    page,
    campaignId,
  }) => {
    // Fabricated session id — whether session exists or not, a user who
    // has NOT checked in must NOT land on the active calling page.
    const fakeSessionId = "00000000-0000-0000-0000-000000000000"

    await page.goto(
      `/campaigns/${campaignId}/phone-banking/sessions/${fakeSessionId}/call`,
    )

    // Give the route time to run its guard / redirect.
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(2_000)

    // The URL must NOT still end with `/call` — the guard should have
    // redirected to the session detail page, home, or an error view.
    await expect(page).not.toHaveURL(/\/call(\?.*)?$/)
  })
})
