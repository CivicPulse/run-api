import { test, expect } from "@playwright/test"

test.describe("Voter import", () => {
  test("import CSV file creates voters", async ({ page }) => {
    // Navigate to org/campaign landing
    await page.goto("/")
    await page.waitForURL(/\/(campaigns|org)/, { timeout: 15_000 })

    // Click into the seed campaign
    const campaignLink = page
      .getByRole("link", { name: /macon|bibb|campaign/i })
      .first()
    await campaignLink.click()

    // Navigate to voters section
    const votersNav = page
      .getByRole("link", { name: /voters/i })
      .first()
    await votersNav.click()

    // Navigate to import page
    const importNav = page
      .getByRole("link", { name: /import/i })
      .first()
    await importNav.click()

    // Wait for import page to load
    await page.waitForURL(/imports/, { timeout: 10_000 })

    // Click "New Import" or similar button to start import wizard
    const newImportBtn = page
      .getByRole("link", { name: /new|import|upload/i })
      .or(page.getByRole("button", { name: /new|import|upload/i }))
      .first()
    await newImportBtn.click()

    // Prepare a small CSV file for upload
    const csvContent = [
      "first_name,last_name,party",
      "TestImport1,E2EUser1,DEM",
      "TestImport2,E2EUser2,REP",
      "TestImport3,E2EUser3,IND",
    ].join("\n")

    // Upload the CSV via the file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: "test-voters.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    })

    // Wait for the file to be processed — column mapping step should appear
    await expect(
      page.getByText(/map|column|field|mapping/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Map columns — the auto-detect should handle first_name, last_name, party
    // Look for a continue/next/import button to proceed
    const proceedBtn = page
      .getByRole("button", { name: /next|continue|import|confirm/i })
      .first()
    await proceedBtn.click()

    // If there is a confirmation step, click through it
    const confirmBtn = page
      .getByRole("button", { name: /import|confirm|start|submit/i })
      .first()
    await confirmBtn.click({ timeout: 10_000 }).catch(() => {
      // No confirmation step — already submitted
    })

    // Wait for import to complete — success message or redirect
    await expect(
      page
        .getByText(/success|complete|imported|processing/i)
        .or(page.getByRole("alert"))
        .first()
    ).toBeVisible({ timeout: 30_000 })

    // Navigate to voter list and verify imported voters appear
    const votersNavAgain = page
      .getByRole("link", { name: /voters/i })
      .first()
    await votersNavAgain.click()

    // Search for one of the imported test voters
    await page.waitForResponse(
      (resp) => resp.url().includes("voters") && resp.status() === 200,
      { timeout: 10_000 }
    )

    const searchInput = page
      .getByPlaceholder(/search/i)
      .or(page.getByRole("searchbox"))
      .first()
    await searchInput.fill("TestImport1")

    await page.waitForResponse(
      (resp) => resp.url().includes("voters") && resp.status() === 200,
      { timeout: 10_000 }
    )

    // Verify the imported voter appears in results
    await expect(page.getByText("TestImport1").first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
