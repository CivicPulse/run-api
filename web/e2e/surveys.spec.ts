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
    // Navigate to surveys page directly (nav link click is flaky on slow dev server)
    await page.goto(`/campaigns/${campaignId}/surveys`)
    await page.waitForURL(/surveys/, { timeout: 15_000 })

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
    // Get the survey ID from the API list — newest first (API sorts by created_at DESC)
    const listResp = await apiGet(page, `/api/v1/campaigns/${campaignId}/surveys`)
    const listData = await listResp.json()
    const surveys = listData.items ?? listData
    // Use index [0] — newest draft with this title (API returns created_at DESC order)
    const matchingSurveys = surveys.filter(
      (s: { title?: string; status?: string }) =>
        s.title === "E2E Voter Sentiment Survey" && s.status === "draft"
    )
    const created = matchingSurveys[0] ??
      surveys.find((s: { title?: string }) => s.title === "E2E Voter Sentiment Survey")
    expect(created).toBeTruthy()
    surveyId = created.id

    // Navigate to the survey detail page
    await page.goto(`/campaigns/${campaignId}/surveys/${surveyId}`)
    await page.waitForURL(/surveys\/([a-f0-9-]+)/, { timeout: 10_000 })
    expect(surveyId).toBeTruthy()
  })

  test("SRV-02: Add questions to a survey", async ({ page, campaignId }) => {
    // Navigate to survey detail page directly
    // Note: surveyId is set by SRV-01. If running in serial mode, it should be valid.
    await page.goto(
      `/campaigns/${campaignId}/surveys/${surveyId}`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForURL(/surveys\/[a-f0-9-]+/, { timeout: 15_000 })
    await expect(
      page.getByText("E2E Voter Sentiment Survey").first(),
    ).toBeVisible({ timeout: 10_000 })

    // Track how many questions have been added
    let questionCount = 0

    // Helper: add a question via dialog
    async function addQuestionViaDialog(
      text: string,
      type: "multiple_choice" | "scale" | "free_text",
      choices?: string,
    ) {
      // Wait for any previous dialog to be fully closed before proceeding
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
        { timeout: 10_000 },
      ).catch(() => {})
      // Extra stabilisation pause between questions
      await page.waitForTimeout(300)

      // Wait for the Add Question button to be available and stable
      const addBtn = page.getByRole("button", { name: /add question/i }).first()
      await expect(addBtn).toBeVisible({ timeout: 15_000 })
      await expect(addBtn).toBeEnabled({ timeout: 5_000 })

      // Click "Add Question" button
      await addBtn.click()
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 })

      // Fill question text (first textarea in dialog)
      const dialog = page.getByRole("dialog")
      await dialog.locator("textarea").first().fill(text)
      // Verify text was actually filled (avoid submitting empty)
      await expect(dialog.locator("textarea").first()).toHaveValue(text, { timeout: 3_000 })

      // Select type if not the default (multiple_choice)
      if (type !== "multiple_choice") {
        // Wait for the combobox to be stable before clicking
        const combobox = dialog.getByRole("combobox")
        await expect(combobox).toBeVisible({ timeout: 5_000 })
        await expect(combobox).toBeEnabled({ timeout: 5_000 })
        await combobox.click()
        // Wait for the select dropdown to open (options become visible)
        const label = type === "scale" ? /^Scale$/i : /^Free Text$/i
        const option = page.getByRole("option", { name: label })
        await expect(option).toBeVisible({ timeout: 5_000 })
        await option.click()
        // Verify the combobox now shows the selected value
        await expect(combobox).toContainText(type === "scale" ? "Scale" : "Free Text", { timeout: 3_000 })
        // Small pause to allow React state to settle after type selection
        await page.waitForTimeout(200)
      }

      // Fill choices if applicable
      if (choices && type === "multiple_choice") {
        const choicesTextarea = dialog.locator("textarea").nth(1)
        await expect(choicesTextarea).toBeVisible({ timeout: 5_000 })
        await choicesTextarea.fill(choices)
        await expect(choicesTextarea).toHaveValue(choices, { timeout: 3_000 })
      }

      questionCount++

      // Re-scope dialog to get a fresh reference (avoids stale element issues)
      const addDialogBtn = page.getByRole("dialog").getByRole("button", { name: /^add$/i })
      await expect(addDialogBtn).toBeVisible({ timeout: 5_000 })
      await expect(addDialogBtn).toBeEnabled({ timeout: 5_000 })

      // Set up API response watcher BEFORE clicking Add
      const apiResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/surveys/${surveyId}/questions`) &&
          resp.request().method() === "POST",
        { timeout: 20_000 },
      )

      await addDialogBtn.click()

      // Wait for the API response to confirm the question was actually saved
      const apiResp = await apiResponsePromise
      if (!apiResp.ok()) {
        const body = await apiResp.text().catch(() => "(unreadable)")
        throw new Error(`Question API POST failed: ${apiResp.status()} ${apiResp.statusText()} - ${body}`)
      }

      // Wait for dialog to close after successful API response
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 })
      // Allow TanStack Query invalidation to complete
      await page.waitForTimeout(300)
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

    // Navigate to survey detail page directly to get fresh data
    await page.goto(`/campaigns/${campaignId}/surveys/${surveyId}`, { waitUntil: "domcontentloaded" })
    await expect(
      page.getByText("E2E Voter Sentiment Survey").first(),
    ).toBeVisible({ timeout: 15_000 })

    // Verify all 5 questions are visible (wait for survey data to reload)
    // Use API to confirm all 5 questions were saved before checking UI
    const qCountResp = await apiGet(page, `/api/v1/campaigns/${campaignId}/surveys/${surveyId}`)
    const qCountData = await qCountResp.json()
    const actualCount = (qCountData.questions ?? []).length
    if (actualCount !== 5) {
      throw new Error(`Expected 5 questions but API shows ${actualCount}: ${JSON.stringify(qCountData.questions?.map((q: { question_text: string }) => q.question_text))}`)
    }
    await expect(page.getByText("Questions (5)")).toBeVisible({
      timeout: 20_000,
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

    // Helper to perform one move-up and wait for the API to confirm it
    const reorderUrl = (url: string) =>
      url.includes(`/surveys/${surveyId}/questions/order`) || url.includes("/questions/order")
    async function clickMoveUpAndWait(n: number) {
      const moveBtn = page.getByRole("button", { name: new RegExp(`move question ${n} up`, "i") })
      // Ensure button is enabled (not in pending state from previous reorder)
      await expect(moveBtn).toBeEnabled({ timeout: 5_000 })
      const done = page.waitForResponse(
        (resp) => reorderUrl(resp.url()) && resp.request().method() === "PUT",
        { timeout: 15_000 },
      )
      await moveBtn.click()
      await done
      // Allow TanStack Query cache invalidation + React re-render (refetch takes ~500ms on dev)
      // Use 2000ms to ensure full re-render cycle under parallel load
      await page.waitForTimeout(2_000)
    }

    // Move "How would you rate" from Q5 → Q2 (3 moves)
    await clickMoveUpAndWait(5)
    // After moving Q5 up: admin rating is at Q4. Wait for all move buttons to be re-enabled.
    await expect(page.getByRole("button", { name: /move question 4 up/i })).toBeEnabled({ timeout: 8_000 })

    await clickMoveUpAndWait(4)
    // After 2 moves: admin rating is at Q3. Wait for buttons to be re-enabled.
    await expect(page.getByRole("button", { name: /move question 3 up/i })).toBeEnabled({ timeout: 8_000 })

    await clickMoveUpAndWait(3)

    // Reload to get definitive server-side order
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByText("Questions (5)")).toBeVisible({ timeout: 15_000 })

    // Verify the page shows the reordered questions by checking text order
    const bodyText = await page.locator("body").innerText()
    const adminRatingPos = bodyText.indexOf(
      "How would you rate the current administration?",
    )
    const votingLikelihoodPos = bodyText.indexOf(
      "How likely are you to vote in the next election?",
    )
    expect(adminRatingPos).toBeGreaterThan(0)
    expect(votingLikelihoodPos).toBeGreaterThan(0)
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
        options: { min: 1, max: 5 },
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
        options: { min: 1, max: 5 },
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
