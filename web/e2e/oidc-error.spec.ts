import { test, expect } from "@playwright/test"

/**
 * Phase 73 / C8 / SEC-09 — OIDC Callback Error Surfacing
 *
 * Failing-red scaffolds that encode the OIDC-error UX Plan 03 must deliver.
 * Today, `web/src/routes/callback.tsx:84-87` only extracts `code` and
 * `state` from search params, silently dropping `error` / `error_description`
 * from the IdP. The user sees "Completing sign in..." forever, no feedback.
 *
 * Plan 03 must extend validateSearch and render a destructive Alert with a
 * "Back to login" CTA when `error` or `error_description` are present.
 */
test.describe("Phase 73: OIDC callback error surfacing", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("callback URL with error and error_description renders destructive Alert", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    await page.goto(
      "/callback?error=access_denied&error_description=User+cancelled+the+request",
    )

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/sign-in failed/i)).toBeVisible()
    await expect(page.getByText(/user cancelled the request/i)).toBeVisible()
    await expect(
      page.getByRole("button", { name: /back to login/i }),
    ).toBeVisible()

    await context.close()
  })

  test("clicking Back to login navigates to /login", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    await page.goto(
      "/callback?error=access_denied&error_description=User+cancelled+the+request",
    )

    const backButton = page.getByRole("button", { name: /back to login/i })
    await expect(backButton).toBeVisible({ timeout: 10_000 })
    await backButton.click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    await context.close()
  })

  test("callback with only error code (no description) still shows Alert", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    await page.goto("/callback?error=server_error")

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/server_error/)).toBeVisible()

    await context.close()
  })
})
