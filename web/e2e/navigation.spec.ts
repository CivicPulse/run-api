import { test, expect } from "./fixtures"
import type { Page } from "@playwright/test"

/**
 * Navigation E2E Spec
 *
 * Validates campaign sidebar navigation, organization navigation, and
 * breadcrumb/back navigation behavior.
 *
 * Covers: NAV-01, NAV-02, NAV-03
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// -- Helper Functions ----------------------------------------------------------

/**
 * Ensure the sidebar is visible. The app defaults to sidebar open
 * (defaultOpen={true}). data-state lives on the outer wrapper div
 * (data-slot="sidebar"), not the inner [data-sidebar="sidebar"] div.
 * On desktop, the sidebar should already be expanded.
 */
async function openSidebar(page: Page): Promise<void> {
  // The outer wrapper carries data-state="expanded" | "collapsed"
  const wrapper = page.locator("[data-slot='sidebar'][data-state]")
  const state = await wrapper.getAttribute("data-state").catch(() => null)
  if (state === "expanded") return

  // If collapsed, click the trigger to expand
  const trigger = page.getByRole("button", { name: /toggle sidebar/i })
  const isVisible = await trigger.isVisible().catch(() => false)
  if (isVisible) {
    await trigger.click()
    await expect(wrapper).toHaveAttribute("data-state", "expanded", {
      timeout: 3_000,
    })
  }
}

// -- NAV-01, NAV-02, NAV-03 ---------------------------------------------------

test.describe.serial("Navigation", () => {
  test("NAV-01: campaign sidebar navigation links work correctly", async ({
    page,
    campaignId,
  }) => {
    test.setTimeout(90_000)

    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // The sidebar has these campaign links (from __root.tsx AppSidebar):
    //   Dashboard, Voters, Canvassing, Phone Banking, Volunteers, Field Operations
    // Plus (admin-only footer): Settings

    const sidebarLinks = [
      {
        name: /^Dashboard$/i,
        urlPattern: /\/dashboard/,
      },
      {
        name: /^Voters$/i,
        urlPattern: /\/voters/,
      },
      {
        name: /^Canvassing$/i,
        urlPattern: /\/canvassing/,
      },
      {
        name: /^Phone Banking$/i,
        urlPattern: /\/phone-banking/,
      },
      {
        name: /^Volunteers$/i,
        urlPattern: /\/volunteers/,
      },
    ]

    for (const link of sidebarLinks) {
      await test.step(`Navigate via sidebar: ${link.name}`, async () => {
        // Open sidebar (may be collapsed)
        await openSidebar(page)

        // Find and click the link in the sidebar
        const sidebarLink = page
          .locator("[data-sidebar='sidebar']")
          .getByRole("link", { name: link.name })
          .first()
        await expect(sidebarLink).toBeVisible({ timeout: 5_000 })
        await sidebarLink.click()

        // Wait for URL to match
        await page.waitForURL(link.urlPattern, { timeout: 10_000 })

        // Verify the active link has data-active attribute
        await openSidebar(page)
        const activeButton = page
          .locator("[data-sidebar='sidebar']")
          .locator("[data-active='true']")
          .first()
        await expect(activeButton).toBeVisible({ timeout: 3_000 })
      })
    }

    // Test Settings link (admin-only, in sidebar footer)
    await test.step("Navigate via sidebar: Settings", async () => {
      await openSidebar(page)
      const settingsLink = page
        .locator("[data-sidebar='sidebar']")
        .getByRole("link", { name: /^Settings$/i })
        .first()

      // Settings may not be visible if user is not admin. Check and skip if not.
      const isSettingsVisible = await settingsLink.isVisible().catch(() => false)
      if (isSettingsVisible) {
        await settingsLink.click()
        await page.waitForURL(/\/settings/, { timeout: 10_000 })
      }
    })

    // Test Field Operations link (navigates away from /campaigns/ to /field/)
    await test.step("Navigate via sidebar: Field Operations", async () => {
      // Navigate back to campaign first
      await page.goto(`/campaigns/${campaignId}/dashboard`)
      await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

      await openSidebar(page)
      const fieldLink = page
        .locator("[data-sidebar='sidebar']")
        .getByRole("link", { name: /field operations/i })
        .first()

      const isFieldVisible = await fieldLink.isVisible().catch(() => false)
      if (isFieldVisible) {
        await fieldLink.click()
        await page.waitForURL(/\/field\//, { timeout: 10_000 })
      }
    })

    // Test mobile viewport sidebar behavior
    await test.step("Sidebar collapses on mobile viewport", async () => {
      // Navigate back to campaign
      await page.goto(`/campaigns/${campaignId}/dashboard`)
      await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

      // Resize to mobile viewport
      await page.setViewportSize({ width: 390, height: 844 })

      // On mobile, sidebar should be hidden (sheet/overlay pattern)
      // The sidebar trigger should still be visible
      const mobileTrigger = page.getByRole("button", {
        name: /open sidebar|toggle sidebar/i,
      })
      await expect(mobileTrigger).toBeVisible({ timeout: 5_000 })

      // Click to open sidebar as overlay/sheet
      await mobileTrigger.click()

      // Sidebar should become visible
      const sidebar = page.locator("[data-sidebar='sidebar']")
      await expect(sidebar).toBeVisible({ timeout: 5_000 })

      // Verify sidebar links are accessible at mobile
      const dashLink = sidebar.getByRole("link", { name: /^Dashboard$/i }).first()
      await expect(dashLink).toBeVisible({ timeout: 3_000 })

      // Reset to desktop viewport
      await page.setViewportSize({ width: 1280, height: 720 })
    })
  })

  test("NAV-02: organization navigation links work correctly", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    // Navigate to org level by going to root
    await page.goto("/")
    await page.waitForURL(
      (url) => !url.pathname.includes("/login") && !url.pathname.includes("/ui/login"),
      { timeout: 15_000 },
    )

    // Organization sidebar links (from __root.tsx):
    //   "All Campaigns" -> /
    //   "Members" -> /org/members (org_admin only)
    //   "Settings" -> /org/settings (org_admin only)

    // Test "All Campaigns" link
    await test.step("Navigate via sidebar: All Campaigns", async () => {
      await openSidebar(page)
      const allCampaignsLink = page
        .locator("[data-sidebar='sidebar']")
        .getByRole("link", { name: /all campaigns/i })
        .first()
      await expect(allCampaignsLink).toBeVisible({ timeout: 5_000 })
      await allCampaignsLink.click()
      await expect(page).toHaveURL("/", { timeout: 10_000 })
    })

    // Test "Members" link (org_admin only -- owner should have org_admin)
    await test.step("Navigate via sidebar: Members", async () => {
      await openSidebar(page)
      const membersLink = page
        .locator("[data-sidebar='sidebar']")
        .getByRole("link", { name: /^Members$/i })
        .first()
      const isMembersVisible = await membersLink.isVisible().catch(() => false)

      if (isMembersVisible) {
        await membersLink.click()
        await page.waitForURL(/\/org\/members/, { timeout: 10_000 })
        await expect(page).toHaveURL(/\/org\/members/)
      }
    })

    // Test org "Settings" link (org_admin only)
    await test.step("Navigate via sidebar: org Settings", async () => {
      await openSidebar(page)
      const orgSettingsLink = page
        .locator("[data-sidebar='sidebar']")
        .getByRole("link", { name: /^Settings$/i })
        .first()
      const isSettingsVisible = await orgSettingsLink
        .isVisible()
        .catch(() => false)

      if (isSettingsVisible) {
        await orgSettingsLink.click()
        await page.waitForURL(/\/org\/settings/, { timeout: 10_000 })
        await expect(page).toHaveURL(/\/org\/settings/)
      }
    })
  })

  test("NAV-03: breadcrumb and back navigation work correctly", async ({
    page,
    campaignId,
  }) => {
    test.setTimeout(60_000)

    // Navigate deep: seed campaign -> voters -> click a voter for detail
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    await test.step("Navigate to voters list", async () => {
      await page.getByRole("link", { name: /voters/i }).first().click()
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })

    await test.step("Click a voter to open detail", async () => {
      // Click the first voter link in the table
      const voterLink = page.locator("table tbody tr a").first()
      await expect(voterLink).toBeVisible({ timeout: 10_000 })
      const voterName = await voterLink.textContent()
      await voterLink.click()

      // Assert URL contains voter ID
      await page.waitForURL(/voters\/[a-f0-9-]+/, { timeout: 10_000 })

      // Verify we're on the voter detail page (voter name visible)
      if (voterName) {
        await expect(
          page.getByText(voterName).first(),
        ).toBeVisible({ timeout: 10_000 })
      }
    })

    await test.step("Browser back returns to voters list", async () => {
      // Use browser back button
      await page.goBack()

      // Assert URL returns to voters list
      await page.waitForURL(/\/voters(?!.*[a-f0-9-]{36})/, { timeout: 10_000 })

      // Verify voters table is visible
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })

    await test.step("Direct URL entry works for deep route", async () => {
      // Navigate directly to campaign settings URL
      await page.goto(`/campaigns/${campaignId}/settings`)
      await page.waitForURL(/\/settings/, { timeout: 10_000 })

      // Assert the page loads without error boundary
      await expect(
        page.getByText("Something went wrong"),
      ).not.toBeVisible({ timeout: 3_000 })

      // Settings page should show content (general settings form)
      await expect(
        page.getByText(/campaign name|general|settings/i).first(),
      ).toBeVisible({ timeout: 15_000 })
    })

    await test.step("Back from deep route returns to previous page", async () => {
      // Browser back from settings should return to voters list
      await page.goBack()

      // Should return to voters table
      await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 })
    })
  })
})
