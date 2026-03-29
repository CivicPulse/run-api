import { test, expect } from "@playwright/test"

test.describe("Org switcher: single-org user", () => {
  test("org switcher shows plain text for single org (no dropdown chevron)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // The OrgSwitcher component renders a plain <span> when user has <= 1 org.
    // It should NOT render a button with a dropdown chevron.
    // The header banner contains the org switcher area.
    const header = page.getByRole("banner")
    await expect(header).toBeVisible({ timeout: 10_000 })

    // The org name should appear as plain text (span), not inside a button
    // For a single-org user, OrgSwitcher returns:
    //   <span className="text-sm font-medium">{currentOrg.name}</span>
    // Verify the org name is visible in the header
    const orgNameText = header.locator("span.text-sm.font-medium").first()
    await expect(orgNameText).toBeVisible({ timeout: 10_000 })

    // There should be no dropdown trigger button in the org switcher area
    // The ChevronDown icon would only appear inside a Button with variant="ghost"
    // that is a DropdownMenuTrigger — this should NOT exist for single-org users
    const dropdownButton = header.locator(
      'button:has(svg.lucide-chevron-down)',
    )
    await expect(dropdownButton).not.toBeVisible()
  })
})
