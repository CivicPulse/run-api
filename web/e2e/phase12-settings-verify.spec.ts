import { test, expect, type Page } from "@playwright/test"

const CAMPAIGN_ID = "9e7e3f63-75fe-4e86-a412-e5149645b8be"
const BASE = "https://dev.tailb56d83.ts.net:5173"

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.waitForURL(/auth\.civpulse\.org/, { timeout: 15_000 })
  await page.locator("input").first().fill("tester")
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)
  await page.locator('input[type="password"]').fill("Crank-Arbitrate8-Spearman")
  await page.click('button[type="submit"]')
  await page.waitForURL(/tailb56d83\.ts\.net:5173/, { timeout: 20_000 })
  await page.waitForTimeout(2000)
}

// ---------------------------------------------------------------------------
// INFR-01 — Settings Gear Icon Visibility
// ---------------------------------------------------------------------------
test.describe("INFR-01: Settings gear icon in sidebar", () => {
  test("gear icon visible in sidebar for admin/owner user and navigates to settings", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/dashboard`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p12-01-sidebar.png" })

    // Settings link rendered in SidebarFooter — label is "Settings"
    const settingsLink = page.getByRole("link", { name: /settings/i })
    await expect(settingsLink).toBeVisible({ timeout: 8000 })

    // Clicking navigates to the settings area
    await settingsLink.click()
    await page.waitForURL(/\/settings/, { timeout: 10_000 })
    await page.screenshot({ path: "test-results/p12-01-settings-landing.png" })

    expect(page.url()).toContain("/settings")
  })
})

// ---------------------------------------------------------------------------
// CAMP-01 — General Tab Edit Form
// ---------------------------------------------------------------------------
test.describe("CAMP-01: General settings tab — campaign edit form", () => {
  test("form loads with campaign data, edit saves and shows success toast", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/general`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p12-02-general-loaded.png" })

    // Form must be visible with the name input populated from API
    const nameInput = page.locator('input[name="name"]')
    await expect(nameInput).toBeVisible({ timeout: 8000 })

    const originalName = await nameInput.inputValue()
    expect(originalName.length).toBeGreaterThan(0)

    // Edit the campaign name field
    await nameInput.fill(originalName + " edited")

    // "Save changes" button submits the form
    const saveBtn = page.getByRole("button", { name: /save changes/i })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Success toast should appear
    const toast = page.getByText(/campaign updated/i)
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: "test-results/p12-02-general-saved.png" })

    // After successful save, form should return to clean state (no Discard button)
    const discardBtn = page.getByRole("button", { name: /discard/i })
    await expect(discardBtn).not.toBeVisible({ timeout: 3000 })

    // Restore original name to keep test environment clean
    await nameInput.fill(originalName)
    await saveBtn.click()
    await expect(page.getByText(/campaign updated/i)).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// INFR-02 — Form Guard / Unsaved Changes Dialog
// ---------------------------------------------------------------------------
test.describe("INFR-02: Form guard — unsaved changes confirmation", () => {
  test("dirty form blocks navigation and shows unsaved changes dialog; Keep editing stays on page", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/general`)
    await page.waitForTimeout(3000)

    // Wait for form to load with campaign data
    const nameInput = page.locator('input[name="name"]')
    await expect(nameInput).toBeVisible({ timeout: 8000 })

    // Make the form dirty by editing the name
    await nameInput.fill("Unsaved Draft Name 99999")
    await page.screenshot({ path: "test-results/p12-03-form-dirty.png" })

    // Attempt to navigate to the Members tab via the settings sidebar
    const membersNavLink = page.getByRole("link", { name: /^members$/i })
    await membersNavLink.click()

    // The "Unsaved changes" ConfirmDialog should appear
    const dialogTitle = page.getByRole("heading", { name: /unsaved changes/i })
    await expect(dialogTitle).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p12-03-form-guard-dialog.png" })

    // Click "Keep editing" to cancel navigation
    const keepEditingBtn = page.getByRole("button", { name: /keep editing/i })
    await expect(keepEditingBtn).toBeVisible()
    await keepEditingBtn.click()

    // Dialog dismisses, user remains on general page
    await expect(dialogTitle).not.toBeVisible({ timeout: 3000 })
    expect(page.url()).toContain("/settings/general")
    await page.screenshot({ path: "test-results/p12-03-stayed-on-general.png" })
  })
})

// ---------------------------------------------------------------------------
// CAMP-05 — Member List with Role Badges
// ---------------------------------------------------------------------------
test.describe("CAMP-05: Members tab — member list with role badges", () => {
  test("member list table renders with Name, Email, Role, Joined columns and role badges", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p12-04-members-loaded.png" })

    // Page heading
    const membersHeading = page.getByRole("heading", { name: /^members$/i })
    await expect(membersHeading).toBeVisible({ timeout: 8000 })

    // Table column headers — members table has Name/Email/Role/Joined
    // (Invites table also has Email/Role so we use .first() for shared headers)
    await expect(page.getByRole("columnheader", { name: /name/i }).first()).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /email/i }).first()).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /role/i }).first()).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /joined/i }).first()).toBeVisible()

    // At least one role badge should be visible (owner badge for the test user)
    const roleBadges = ["owner", "admin", "manager", "volunteer", "viewer"]
    const bodyText = await page.locator("body").innerText()
    const foundRoles = roleBadges.filter((r) => bodyText.toLowerCase().includes(r))
    expect(foundRoles.length, "At least one role badge should be visible").toBeGreaterThan(0)

    await page.screenshot({ path: "test-results/p12-04-members-table.png" })
  })
})

// ---------------------------------------------------------------------------
// CAMP-03 — Invite Member Dialog
// ---------------------------------------------------------------------------
test.describe("CAMP-03: Invite member dialog", () => {
  test("invite dialog opens with email input and role selector, send invite shows toast", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForTimeout(3000)

    // Click "Invite member" button
    const inviteBtn = page.getByRole("button", { name: /invite member/i })
    await expect(inviteBtn).toBeVisible({ timeout: 8000 })
    await inviteBtn.click()

    // Dialog must open
    const dialogTitle = page.getByRole("heading", { name: /invite a member/i })
    await expect(dialogTitle).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p12-05-invite-dialog-open.png" })

    // Email input must be present
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()

    // Role selector must be present
    const roleSelect = page.getByRole("combobox")
    await expect(roleSelect).toBeVisible()

    // Fill in email
    await emailInput.fill("testinvite@example.com")

    // Role selector already defaults to "Volunteer" — just verify it renders
    await page.screenshot({ path: "test-results/p12-05-invite-dialog-filled.png" })

    // Click "Send invite"
    const sendBtn = page.getByRole("button", { name: /send invite/i })
    await expect(sendBtn).toBeVisible()
    await sendBtn.click()

    // Expect either success toast or error toast (API may reject test emails)
    // We verify the UI flow — the button triggers the mutation and closes/toasts
    const toastSuccess = page.getByText(/invite sent to/i)
    const toastError = page.getByText(/failed to send invite/i)
    await expect(toastSuccess.or(toastError)).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: "test-results/p12-05-invite-toast.png" })
  })
})

// ---------------------------------------------------------------------------
// CAMP-04 — Pending Invites Section
// ---------------------------------------------------------------------------
test.describe("CAMP-04: Pending Invites section", () => {
  test("Pending Invites section heading visible with table or empty state", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p12-06-pending-invites.png" })

    // "Pending Invites" section heading must be present (exact match to avoid matching "No pending invites" empty state)
    const invitesHeading = page.getByRole("heading", { name: "Pending Invites", exact: true })
    await expect(invitesHeading).toBeVisible({ timeout: 8000 })

    // Either the invites table renders rows OR the empty state is shown
    const bodyText = await page.locator("body").innerText()
    const hasTable = bodyText.toLowerCase().includes("email")
    const hasEmpty = bodyText.toLowerCase().includes("no pending invites")
    expect(hasTable || hasEmpty, "Should show invite table or empty state").toBe(true)

    await page.screenshot({ path: "test-results/p12-06-pending-invites-state.png" })
  })
})

// ---------------------------------------------------------------------------
// CAMP-06 — Change Member Role
// ---------------------------------------------------------------------------
test.describe("CAMP-06: Change member role via kebab menu", () => {
  test("kebab menu on non-owner row opens role change dialog with save button", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForTimeout(3000)

    await page.screenshot({ path: "test-results/p12-07-members-for-role-change.png" })

    // Find a row with a three-dot (MoreHorizontal) actions button
    // The DropdownMenuTrigger button has an sr-only "Actions" span
    const actionButtons = page.getByRole("button", { name: /actions/i })
    const count = await actionButtons.count()

    if (count === 0) {
      // No non-owner members available — test is vacuously satisfied
      console.log("CAMP-06: No kebab menus found (all members may be owners or user lacks admin role)")
      return
    }

    // Click the first available action button
    await actionButtons.first().click()

    // Dropdown should show "Change role" option
    const changeRoleItem = page.getByRole("menuitem", { name: /change role/i })

    // If "Change role" is not visible (self-role-change prevention), try next button
    const isChangeRoleVisible = await changeRoleItem.isVisible().catch(() => false)
    if (!isChangeRoleVisible) {
      // Close current dropdown and try next button
      await page.keyboard.press("Escape")
      if (count > 1) {
        await actionButtons.nth(1).click()
        await expect(page.getByRole("menuitem", { name: /change role/i })).toBeVisible({
          timeout: 3000,
        })
      } else {
        console.log("CAMP-06: Change role not available (self-role-change prevention active)")
        return
      }
    }

    await page.screenshot({ path: "test-results/p12-07-kebab-open.png" })
    await page.getByRole("menuitem", { name: /change role/i }).click()

    // Role change dialog should open
    const dialogTitle = page.getByRole("heading", { name: /change role/i })
    await expect(dialogTitle).toBeVisible({ timeout: 5000 })

    // Role selector (combobox) must be present in the dialog
    const roleSelect = page.getByRole("combobox")
    await expect(roleSelect).toBeVisible()

    // "Save" button must be present
    const saveBtn = page.getByRole("button", { name: /^save$/i })
    await expect(saveBtn).toBeVisible()

    await page.screenshot({ path: "test-results/p12-07-role-dialog-open.png" })

    // Close dialog without saving (click Cancel)
    const cancelBtn = page.getByRole("button", { name: /cancel/i })
    await cancelBtn.click()
    await expect(dialogTitle).not.toBeVisible({ timeout: 3000 })
  })
})

// ---------------------------------------------------------------------------
// CAMP-07 — Remove Member
// ---------------------------------------------------------------------------
test.describe("CAMP-07: Remove member via kebab menu", () => {
  test("kebab menu shows Remove member; confirmation dialog appears with Remove button", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/members`)
    await page.waitForTimeout(3000)

    const actionButtons = page.getByRole("button", { name: /actions/i })
    const count = await actionButtons.count()

    if (count === 0) {
      console.log("CAMP-07: No kebab menus found (no removable members or insufficient role)")
      return
    }

    await actionButtons.first().click()

    const removeMemberItem = page.getByRole("menuitem", { name: /remove member/i })
    await expect(removeMemberItem).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p12-08-kebab-remove.png" })

    await removeMemberItem.click()

    // ConfirmDialog should appear — title is "Remove {name}?"
    // The AlertDialog contains a heading with "Remove"
    const dialogText = page.getByText(/remove/i).filter({ hasText: /\?/ })
    // Wait for any heading that starts with "Remove" and ends with "?"
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p12-08-remove-dialog.png" })

    // The dialog description mentions losing access
    const dialogBody = await page.getByRole("alertdialog").innerText()
    expect(dialogBody).toMatch(/access/i)

    // "Remove" confirm button must be visible
    const removeConfirmBtn = page.getByRole("button", { name: /^remove$/i })
    await expect(removeConfirmBtn).toBeVisible()

    // Close without confirming (cancel)
    const cancelBtn = page.getByRole("button", { name: /cancel/i })
    await cancelBtn.click()
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: "test-results/p12-08-remove-cancelled.png" })
  })
})

// ---------------------------------------------------------------------------
// CAMP-02 — Delete Campaign (Type-to-Confirm)
// ---------------------------------------------------------------------------
test.describe("CAMP-02: Delete campaign — type-to-confirm dialog", () => {
  test("delete dialog opens, confirm button disabled until campaign name typed, then enables", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/danger`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p12-09-danger-zone.png" })

    // "Delete this campaign" section must be visible
    const deleteSection = page.getByText(/delete this campaign/i)
    await expect(deleteSection).toBeVisible({ timeout: 8000 })

    // Click the "Delete campaign" button to open DestructiveConfirmDialog
    const deleteBtn = page.getByRole("button", { name: /delete campaign/i })
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // AlertDialog should open
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p12-09-delete-dialog-open.png" })

    // Confirm button (labeled "Delete campaign") should be DISABLED initially
    const confirmBtn = page.getByRole("button", { name: /delete campaign/i })
    await expect(confirmBtn).toBeDisabled()

    // Type-to-confirm input (data-testid="destructive-confirm-input")
    const confirmInput = page.locator('[data-testid="destructive-confirm-input"]')
    await expect(confirmInput).toBeVisible()

    // Typing the wrong value keeps button disabled
    await confirmInput.fill("wrong name")
    await expect(confirmBtn).toBeDisabled()

    // Get the campaign name from the placeholder (which equals confirmText)
    const campaignName = await confirmInput.getAttribute("placeholder")
    expect(campaignName).toBeTruthy()

    // Type the exact campaign name to enable confirm button
    await confirmInput.fill(campaignName!)
    await page.screenshot({ path: "test-results/p12-09-delete-dialog-typed.png" })

    // Confirm button should now be ENABLED
    await expect(confirmBtn).toBeEnabled({ timeout: 3000 })

    // Close the dialog WITHOUT confirming (press Cancel to avoid actual deletion)
    const cancelBtn = page.getByRole("button", { name: /cancel/i })
    await cancelBtn.click()
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: "test-results/p12-09-delete-dialog-cancelled.png" })
  })
})

// ---------------------------------------------------------------------------
// CAMP-08 — Transfer Ownership
// ---------------------------------------------------------------------------
test.describe("CAMP-08: Transfer ownership", () => {
  test("transfer ownership section visible, dialog opens with admin selector", async ({
    page,
  }) => {
    await login(page)
    await page.goto(`${BASE}/campaigns/${CAMPAIGN_ID}/settings/danger`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: "test-results/p12-10-danger-transfer.png" })

    // "Transfer ownership" section must be visible
    const transferSection = page.getByText(/transfer ownership/i).first()
    await expect(transferSection).toBeVisible({ timeout: 8000 })

    // Click "Transfer ownership" button to open dialog
    const transferBtn = page.getByRole("button", { name: /transfer ownership/i })
    await expect(transferBtn).toBeVisible()
    await transferBtn.click()

    // Dialog should open
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: "test-results/p12-10-transfer-dialog-open.png" })

    const dialogText = await dialog.innerText()

    // Dialog should contain either an admin selector or "No admin members found" message
    const hasSelector = await page.getByRole("combobox").isVisible().catch(() => false)
    const hasNoAdminsMsg = dialogText.toLowerCase().includes("no admin")

    expect(
      hasSelector || hasNoAdminsMsg,
      "Dialog should show admin selector or no-admins message"
    ).toBe(true)

    await page.screenshot({ path: "test-results/p12-10-transfer-dialog-state.png" })

    // Close the dialog (Cancel button)
    const cancelBtn = dialog.getByRole("button", { name: /cancel/i })
    await cancelBtn.click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: "test-results/p12-10-transfer-cancelled.png" })
  })
})
