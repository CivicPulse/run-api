import { test, expect } from "@playwright/test"

test.describe("Tour onboarding (Phase 34)", () => {
  test.describe("Welcome tour (TOUR-01)", () => {
    test.fixme("auto-triggers on first visit to field hub", async ({ page }) => {
      // Will navigate to /field/{campaignId} and verify driver.js popover appears
    })

    test.fixme("does not auto-trigger on second visit", async ({ page }) => {
      // Will set localStorage completion flag then navigate, verify no popover
    })

    test.fixme("shows 4 steps with progress indicator", async ({ page }) => {
      // Will step through tour and verify step count
    })
  })

  test.describe("Help button replay (TOUR-04)", () => {
    test.fixme("replays welcome tour from hub help button", async ({ page }) => {
      // Will click help button on hub, verify driver.js popover appears
    })

    test.fixme("replays canvassing tour from canvassing help button", async ({ page }) => {
      // Will click help button on canvassing screen, verify correct segment
    })

    test.fixme("replays phone banking tour from phone banking help button", async ({ page }) => {
      // Will click help button on phone banking screen, verify correct segment
    })
  })

  test.describe("Quick-start cards (TOUR-05)", () => {
    test.fixme("shows quick-start card on canvassing for first 3 sessions", async ({ page }) => {
      // Will navigate to canvassing and verify blue card is visible
    })

    test.fixme("dismisses quick-start card on X click", async ({ page }) => {
      // Will click dismiss and verify card is hidden
    })

    test.fixme("hides quick-start card during active tour", async ({ page }) => {
      // Will trigger tour and verify card is not visible
    })
  })

  test.describe("Data-tour attributes (TOUR-01)", () => {
    test.fixme("hub has hub-greeting, assignment-card, help-button, avatar-menu attributes", async ({ page }) => {
      // Will navigate to hub and verify data-tour attributes exist
    })

    test.fixme("canvassing has household-card, outcome-grid, progress-bar, door-list-button, skip-button attributes", async ({ page }) => {
      // Will navigate to canvassing and verify data-tour attributes exist
    })

    test.fixme("phone banking has phone-number-list, outcome-grid, end-session-button attributes", async ({ page }) => {
      // Will navigate to phone banking and verify data-tour attributes exist
    })
  })
})
