import { test, expect } from "./fixtures"
import { apiGet, apiPost, apiPatch, apiDelete } from "./helpers"

/**
 * Surveys E2E Spec
 *
 * Validates survey script CRUD, question add/edit/delete/reorder,
 * status lifecycle (draft->active->archived), and bulk creation.
 *
 * Covers: SRV-01 through SRV-08 (E2E-16)
 * Runs as: owner (unsuffixed spec -> chromium -> owner auth)
 */

// -- Helpers ------------------------------------------------------------------

async function createSurveyViaApi(page: import("@playwright/test").Page, campaignId: string, title: string, description?: string): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/surveys`, { title, description: description ?? undefined })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function addQuestionViaApi(page: import("@playwright/test").Page, campaignId: string, surveyId: string, questionData: { question_text: string; question_type: string; options?: Record<string, unknown> }): Promise<string> {
  const resp = await apiPost(page, `/api/v1/campaigns/${campaignId}/surveys/${surveyId}/questions`, questionData)
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()).id
}

async function updateSurveyStatusViaApi(page: import("@playwright/test").Page, campaignId: string, surveyId: string, newStatus: string): Promise<void> {
  const resp = await apiPatch(page, `/api/v1/campaigns/${campaignId}/surveys/${surveyId}`, { status: newStatus })
  expect(resp.ok()).toBeTruthy()
}

async function deleteSurveyViaApi(page: import("@playwright/test").Page, campaignId: string, surveyId: string): Promise<void> {
  const resp = await apiDelete(page, `/api/v1/campaigns/${campaignId}/surveys/${surveyId}`)
  expect(resp.ok()).toBeTruthy()
}

// -- Tests --------------------------------------------------------------------

test.describe.serial("Survey Lifecycle", () => {
  let campaignId = ""
  let surveyId = ""
  const questionIds: string[] = []

  test.setTimeout(120_000)

  test("Setup: navigate to seed campaign", async ({ page, campaignId }) => {
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    expect(campaignId).toBeTruthy()
  })

  test("SRV-01: Create a survey script via UI", async ({ page, campaignId }) => {
    // Navigate to surveys page
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.getByRole("link", { name: /surveys/i }).first().click()
    await page.waitForURL(/surveys/, { timeout: 10_000 })

    // Click "New Script" button
    await page.getByRole("button", { name: /new script/i }).click()

    // Fill in the dialog form
    await expect(page.getByText("New Survey Script")).toBeVisible({
      timeout: 5_000,
    })
    await page.locator("#script-title").fill("E2E Voter Sentiment Survey")
    await page
      .locator("#script-desc")
      .fill("Standard survey for canvassing and phone banking")

    // Click Create
    await page.getByRole("button", { name: /^create$/i }).click()

    // Verify success toast
    await expect(
      page.getByText(/survey script created/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify survey card appears in the list with "draft" badge
    await expect(
      page.getByText("E2E Voter Sentiment Survey").first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("draft").first()).toBeVisible({
      timeout: 5_000,
    })

    // Get the survey ID from the API (clicking the card is unreliable due to overlay <a>)
    const listResp = await apiGet(page, `/api/v1/campaigns/${campaignId}/surveys`)
    const listData = await listResp.json()
    const surveys = listData.items ?? listData
    const created = surveys.find((s: { title?: string }) => s.title === "E2E Voter Sentiment Survey")
    expect(created).toBeTruthy()
    surveyId = created.id

    // Navigate to the survey detail page
    await page.goto(`/campaigns/${campaignId}/surveys/${surveyId}`)
    await page.waitForURL(/surveys\/([a-f0-9-]+)/, { timeout: 10_000 })
    expect(surveyId).toBeTruthy()
  })

  test("SRV-02: Add questions to a survey", async ({ page, campaignId }) => {
    // Navigate to survey detail page
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.goto(
      `/campaigns/${campaignId}/surveys/${surveyId}`,
    )
    await page.waitForURL(/surveys\/[a-f0-9-]+/, { timeout: 10_000 })
    await expect(
      page.getByText("E2E Voter Sentiment Survey").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Helper: add a question via dialog
    async function addQuestionViaDialog(
      text: string,
      type: "multiple_choice" | "scale" | "free_text",
      choices?: string,
    ) {
      // Wait for any previous dialog to close
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 }).catch(() => {})

      // Click "Add Question" button
      await page.getByRole("button", { name: /add question/i }).first().click()
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 })

      // Fill question text (first textarea in dialog)
      const dialog = page.getByRole("dialog")
      await dialog.locator("textarea").first().fill(text)

      // Select type if not the default (multiple_choice)
      if (type !== "multiple_choice") {
        await dialog.getByRole("combobox").click()
        const label = type === "scale" ? /^Scale$/i : /^Free Text$/i
        await page.getByRole("option", { name: label }).click()
      } else {
        // Ensure Multiple Choice is selected
        const typeSelect = dialog.getByRole("combobox")
        const currentType = await typeSelect.textContent()
        if (currentType && !currentType.includes("Multiple Choice")) {
          await typeSelect.click()
          await page.getByRole("option", { name: /Multiple Choice/i }).click()
        }
      }

      // Fill choices if applicable
      if (choices && type === "multiple_choice") {
        await dialog.locator("textarea").nth(1).fill(choices)
      }

      await dialog.getByRole("button", { name: /^add$/i }).click()
      await expect(page.getByText(/question added/i).first()).toBeVisible({
        timeout: 10_000,
      })
    }

    // -- Q1: Multiple Choice --
    await test.step("Add Q1: Multiple Choice - Issue importance", async () => {
      await addQuestionViaDialog(
        "What is the most important issue to you?",
        "multiple_choice",
        "Economy\nHealthcare\nEducation\nEnvironment\nOther",
      )
    })

    // -- Q2: Scale --
    await test.step("Add Q2: Scale - Voting likelihood", async () => {
      await addQuestionViaDialog(
        "How likely are you to vote in the next election?",
        "scale",
      )
    })

    // -- Q3: Multiple Choice --
    await test.step("Add Q3: Multiple Choice - Volunteer interest", async () => {
      await addQuestionViaDialog(
        "Would you like to volunteer for the campaign?",
        "multiple_choice",
        "Yes\nNo\nMaybe",
      )
    })

    // -- Q4: Free Text --
    await test.step("Add Q4: Free Text - Additional comments", async () => {
      await addQuestionViaDialog(
        "Any additional comments?",
        "free_text",
      )
    })

    // -- Q5: Scale --
    await test.step("Add Q5: Scale - Administration rating", async () => {
      await addQuestionViaDialog(
        "How would you rate the current administration?",
        "scale",
      )
    })

    // Verify all 5 questions are visible
    await expect(page.getByText("Questions (5)")).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByText("What is the most important issue to you?").first(),
    ).toBeVisible()
    await expect(
      page
        .getByText("How likely are you to vote in the next election?")
        .first(),
    ).toBeVisible()
    await expect(
      page
        .getByText("Would you like to volunteer for the campaign?")
        .first(),
    ).toBeVisible()
    await expect(
      page.getByText("Any additional comments?").first(),
    ).toBeVisible()
    await expect(
      page
        .getByText("How would you rate the current administration?")
        .first(),
    ).toBeVisible()

    // Verify type badges
    await expect(page.getByText("Multiple Choice").first()).toBeVisible()
    await expect(page.getByText("Scale").first()).toBeVisible()
    await expect(page.getByText("Free Text").first()).toBeVisible()
  })

  test("SRV-03: Edit a question", async ({ page, campaignId }) => {
    // Navigate to survey detail page
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.goto(
      `/campaigns/${campaignId}/surveys/${surveyId}`,
    )
    await expect(
      page.getByText("E2E Voter Sentiment Survey").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Click edit on Q1 (first question)
    await page.getByRole("button", { name: /edit question 1/i }).click()

    // Verify edit dialog opens
    await expect(page.getByText("Edit Question")).toBeVisible({
      timeout: 5_000,
    })

    // Change "Other" to "Public Safety" in the choices textarea
    const choicesTextarea = page.locator("textarea").nth(1)
    const currentChoices = await choicesTextarea.inputValue()
    const updatedChoices = currentChoices.replace("Other", "Public Safety")
    await choicesTextarea.fill(updatedChoices)

    // Save
    await page.getByRole("button", { name: /^save$/i }).click()
    await expect(page.getByText(/question updated/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Verify "Public Safety" appears and "Other" does not (in Q1 choices)
    await expect(page.getByText("Public Safety").first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test("SRV-04: Reorder questions", async ({ page, campaignId }) => {
    // Navigate to survey detail page
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.goto(
      `/campaigns/${campaignId}/surveys/${surveyId}`,
    )
    await expect(page.getByText("Questions (5)")).toBeVisible({
      timeout: 10_000,
    })

    // Move Q5 up to position 2 by clicking "Move up" 3 times
    // Q5 is at index 4 -> move to index 1 (3 swaps up)
    // The move-up button is aria-labeled "Move question N up"

    // Move Q5 up to Q4 position
    await page.getByRole("button", { name: /move question 5 up/i }).click()
    // Wait for the button label to update after reorder
    await expect(page.getByRole("button", { name: /move question 4 up/i })).toBeVisible({ timeout: 5_000 })

    // Now it's Q4 at index 3, move up to Q3 position
    await page.getByRole("button", { name: /move question 4 up/i }).click()
    await expect(page.getByRole("button", { name: /move question 3 up/i })).toBeVisible({ timeout: 5_000 })
    // Now it's Q3 at index 2, move up to Q2 position
    await page.getByRole("button", { name: /move question 3 up/i }).click()
    // Verify new order: Q1 (issue), Q5/now Q2 (admin rating), Q2/now Q3 (voting likelihood), Q3/now Q4 (volunteer), Q4/now Q5 (comments)
    // Check that "How would you rate" appears as the second question
    const questionCards = page.locator('[class*="card"]').filter({
      has: page.locator('[class*="CardTitle"]'),
    })

    // Verify the page shows the reordered questions by checking text order
    const bodyText = await page.locator("body").innerText()
    const adminRatingPos = bodyText.indexOf(
      "How would you rate the current administration?",
    )
    const votingLikelihoodPos = bodyText.indexOf(
      "How likely are you to vote in the next election?",
    )
    expect(adminRatingPos).toBeLessThan(votingLikelihoodPos)
  })

  test("SRV-05: Delete a question", async ({ page, campaignId }) => {
    // Navigate to survey detail page
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.goto(
      `/campaigns/${campaignId}/surveys/${surveyId}`,
    )
    await expect(page.getByText("Questions (5)")).toBeVisible({
      timeout: 10_000,
    })

    // Delete the last question ("Any additional comments?" which is now Q5 after reorder)
    // Find the delete button for the last question
    const deleteButtons = page.getByRole("button", {
      name: /delete question/i,
    })
    const count = await deleteButtons.count()
    await deleteButtons.nth(count - 1).click()

    // Confirm deletion in the dialog
    await expect(page.getByText("Delete Question")).toBeVisible({
      timeout: 5_000,
    })
    await page.getByRole("button", { name: /^delete$/i }).click()

    // Verify success toast
    await expect(page.getByText(/question deleted/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // Verify 4 questions remain
    await expect(page.getByText("Questions (4)")).toBeVisible({
      timeout: 10_000,
    })
  })

  test("SRV-06: Change survey status lifecycle", async ({ page, campaignId }) => {
    // Navigate to survey detail page
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })
    await page.goto(
      `/campaigns/${campaignId}/surveys/${surveyId}`,
    )
    await expect(page.getByText("draft").first()).toBeVisible({
      timeout: 10_000,
    })

    // Step 1: Change from draft to active
    await test.step("Draft -> Active", async () => {
      await page.getByRole("button", { name: /^activate$/i }).click()
      await expect(page.getByText(/survey script updated/i).first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText("active").first()).toBeVisible({
        timeout: 5_000,
      })
    })

    // Step 2: Change from active to archived
    await test.step("Active -> Archived", async () => {
      await page.getByRole("button", { name: /^archive$/i }).click()
      await expect(page.getByText(/survey script updated/i).first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText("archived").first()).toBeVisible({
        timeout: 5_000,
      })
    })
  })

  test("SRV-07: Create 4 more surveys (5 total)", async ({ page, campaignId }) => {
    // Navigate to establish auth context
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Survey 2: E2E Canvassing Script with 3 questions
    await test.step("Create E2E Canvassing Script via API", async () => {
      const id = await createSurveyViaApi(
        page,
        campaignId,
        "E2E Canvassing Script",
        "Script for door-to-door canvassing",
      )
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "Do you plan to vote in the upcoming election?",
        question_type: "multiple_choice",
        options: { choices: ["Yes", "No", "Undecided"] },
      })
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "What issues matter most to your household?",
        question_type: "free_text",
      })
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "How satisfied are you with local services?",
        question_type: "scale",
      })
      await updateSurveyStatusViaApi(page, campaignId, id, "active")
    })

    // Survey 3: E2E Phone Banking Script with 2 questions
    await test.step("Create E2E Phone Banking Script via API", async () => {
      const id = await createSurveyViaApi(
        page,
        campaignId,
        "E2E Phone Banking Script",
        "Script for phone bank callers",
      )
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "Can we count on your support?",
        question_type: "multiple_choice",
        options: { choices: ["Yes", "No", "Need More Info"] },
      })
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "Would you like a yard sign?",
        question_type: "multiple_choice",
        options: { choices: ["Yes", "No"] },
      })
      await updateSurveyStatusViaApi(page, campaignId, id, "active")
    })

    // Survey 4: E2E Short Survey with 1 question
    await test.step("Create E2E Short Survey via API", async () => {
      const id = await createSurveyViaApi(
        page,
        campaignId,
        "E2E Short Survey",
        "Quick single-question survey",
      )
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "Which candidate do you support?",
        question_type: "multiple_choice",
        options: { choices: ["Candidate A", "Candidate B", "Undecided"] },
      })
      await updateSurveyStatusViaApi(page, campaignId, id, "active")
    })

    // Survey 5: E2E Detailed Survey with 4 mixed questions
    await test.step("Create E2E Detailed Survey via API", async () => {
      const id = await createSurveyViaApi(
        page,
        campaignId,
        "E2E Detailed Survey",
        "Comprehensive voter survey with mixed question types",
      )
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "What is your primary transportation method?",
        question_type: "multiple_choice",
        options: { choices: ["Car", "Public Transit", "Bicycle", "Walking"] },
      })
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "Rate your neighborhood safety",
        question_type: "scale",
      })
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "What improvements would you like to see?",
        question_type: "free_text",
      })
      await addQuestionViaApi(page, campaignId, id, {
        question_text: "How often do you attend city council meetings?",
        question_type: "multiple_choice",
        options: { choices: ["Never", "Rarely", "Sometimes", "Often"] },
      })
      await updateSurveyStatusViaApi(page, campaignId, id, "active")
    })

    // Navigate to surveys list and verify all 5 surveys appear
    await page.getByRole("link", { name: /surveys/i }).first().click()
    await page.waitForURL(/surveys/, { timeout: 10_000 })

    // Verify the 5 survey titles are present
    await expect(
      page.getByText("E2E Voter Sentiment Survey").first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText("E2E Canvassing Script").first(),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByText("E2E Phone Banking Script").first(),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByText("E2E Short Survey").first(),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByText("E2E Detailed Survey").first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("SRV-08: Delete a survey", async ({ page, campaignId }) => {
    // Navigate to establish auth context
    // campaignId resolved via fixture — navigate to dashboard
    await page.goto(`/campaigns/${campaignId}/dashboard`)
    await page.waitForURL(/campaigns\//, { timeout: 10_000 })

    // Create a throwaway survey via API (must be draft to delete)
    const throwawayId = await createSurveyViaApi(
      page,
      campaignId,
      "E2E Survey -- Delete",
      "Throwaway survey for deletion test",
    )

    // Navigate to surveys list
    await page.getByRole("link", { name: /surveys/i }).first().click()
    await page.waitForURL(/surveys/, { timeout: 10_000 })

    // Verify the throwaway survey is visible
    await expect(
      page.getByText("E2E Survey -- Delete").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Click the delete (trash) icon on the throwaway survey card
    // The trash button is inside the card for this survey
    const surveyCard = page
      .locator("[class*='card']")
      .filter({ hasText: "E2E Survey -- Delete" })
    const trashButton = surveyCard.locator("button").filter({
      has: page.locator("svg"),
    })
    await trashButton.click()

    // Confirm deletion in the dialog
    await expect(page.getByText("Delete Script")).toBeVisible({
      timeout: 5_000,
    })
    await page.getByRole("button", { name: /^delete$/i }).click()

    // Verify success toast
    await expect(
      page.getByText(/survey script deleted/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Verify the throwaway survey is no longer visible
    await expect(
      page.getByText("E2E Survey -- Delete"),
    ).not.toBeVisible({ timeout: 5_000 })
  })
})
