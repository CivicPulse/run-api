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

    // The org name is rendered by OrgSwitcher in the header:
    // - Single org: <span className="text-sm font-medium">{orgName}</span>
    // - Multiple orgs: <Button variant="ghost" className="gap-1 text-sm font-medium">
    //     {orgName} <ChevronDown />
    //   </Button>
    //
    // The multi-org button uses className="gap-1 text-sm font-medium". The "gap-1"
    // class is specific to the OrgSwitcher trigger button (not used on other header btns).
    const orgNameSpan = header.locator("span.text-sm.font-medium").first()
    const orgNameButton = header.locator("button.gap-1").first()

    // Either the plain text span or the dropdown button should be visible
    await expect(
      orgNameSpan.or(orgNameButton)
    ).toBeVisible({ timeout: 10_000 })

    // Verify the displayed text contains an actual org name (not empty)
    const isSpanVisible = await orgNameSpan.isVisible()
    const orgElement = isSpanVisible ? orgNameSpan : orgNameButton
    const orgText = await orgElement.textContent()
    // Remove the chevron icon text content (empty) to get just the org name
    expect(orgText?.trim().length).toBeGreaterThan(0)
  })
})
