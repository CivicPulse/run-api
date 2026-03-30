import { test, expect } from "@playwright/test"

test.describe("Org switcher", () => {
  test("org switcher displays org name in header", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // The OrgSwitcher component renders org name in the header banner.
    // - Single org: plain <span className="text-sm font-medium">
    // - Multiple orgs: <Button> with dropdown chevron
    const header = page.getByRole("banner")
    await expect(header).toBeVisible({ timeout: 10_000 })

    // The org name should be visible in the header, either as a plain span
    // (single org) or as a dropdown button (multiple orgs)
    const orgNameSpan = header.locator("span.text-sm.font-medium").first()
    const orgNameButton = header.getByRole("button").filter({
      hasText: /organization|demo/i,
    }).first()

    // Either the plain text or the dropdown button should be visible
    await expect(
      orgNameSpan.or(orgNameButton)
    ).toBeVisible({ timeout: 10_000 })

    // Verify the displayed text contains an actual org name (not empty)
    const orgElement = await orgNameSpan.isVisible()
      ? orgNameSpan
      : orgNameButton
    const orgText = await orgElement.textContent()
    expect(orgText?.trim().length).toBeGreaterThan(0)
  })
})
