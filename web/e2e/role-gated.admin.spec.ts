import { test, expect } from "@playwright/test"

test.describe("Role-gated UI: org_admin user", () => {
  test("org settings page shows read-only name input and hides Save Changes", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Navigate to org settings
    await page.goto("/org/settings")
    await page.waitForURL(/\/org\/settings/, { timeout: 10_000 })

    // Organization Name input should be present
    const orgNameInput = page.getByLabel(/organization name/i)
    await expect(orgNameInput).toBeVisible({ timeout: 10_000 })

    // For non-owner (org_admin), the input should have read-only styling
    // The component applies readOnly attribute and bg-muted class for non-owners
    await expect(orgNameInput).toHaveAttribute("readonly", "")

    // Verify the bg-muted class is applied (read-only visual indicator)
    await expect(orgNameInput).toHaveClass(/bg-muted/)

    // "Save Changes" button should NOT be visible for non-owner
    const saveButton = page.getByRole("button", { name: /save changes/i })
    await expect(saveButton).not.toBeVisible()
  })

  test("sidebar shows Members and Settings links in Organization group", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // The Organization sidebar group should contain Members and Settings
    // These are gated behind RequireOrgRole minimum="org_admin"
    const membersLink = page.getByRole("link", { name: /^members$/i })
    await expect(membersLink).toBeVisible({ timeout: 10_000 })

    const settingsLink = page.getByRole("link", { name: /^settings$/i })
    await expect(settingsLink).toBeVisible({ timeout: 10_000 })
  })

  test("Create Campaign button is visible for org_admin", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // The Create Campaign button is gated behind RequireOrgRole minimum="org_admin"
    const createButton = page.getByRole("link", { name: /create campaign/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
  })
})
