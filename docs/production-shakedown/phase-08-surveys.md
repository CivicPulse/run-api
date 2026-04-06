# Phase 08: Surveys

**Prefix:** `SRV`
**Depends on:** phase-00, phase-04
**Estimated duration:** 20 min
**Agents required:** 1

## Purpose

Exhaustively test survey scripts, questions, and response collection. Cover script CRUD with status transitions (draft → active → archived), the three supported question types (multiple_choice, scale, free_text), question ordering/reordering, batch response recording, validation edge cases, and role-based access boundaries (volunteer+ read/record, manager+ create/edit).

## Prerequisites

- Phase 00 complete (Org A baseline survey seeded via ENV-SEED-06)
- Phase 04 complete (QA Test Campaign active, baseline voters seeded)
- Active JWTs: `$TOKEN_OWNER_A`, `$TOKEN_MANAGER_A`, `$TOKEN_VOLUNTEER_A`, `$TOKEN_VIEWER_A`
- `CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248`
- At least 1 baseline voter ID from phase 00 seed: `VOTER_ID=<uuid>` (pull via `GET /api/v1/campaigns/$CAMPAIGN_A/voters?limit=1`)

---

## Section 1: Script CRUD

### SRV-SCRIPT-01 | Create draft survey script (manager)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"title":"SRV Test Script 1","description":"Phase 08 CRUD fixture"}' | jq .
```

**Expected:**
- HTTP 201
- Response has `id` (uuid), `title`, `description`, `status: "draft"`, `campaign_id == $CAMPAIGN_A`, `created_by`, `created_at`, `updated_at`.

**Record:** Save `id` as `$SCRIPT_ID`.

**Pass criteria:** 201 + status is `draft`.

---

### SRV-SCRIPT-02 | Create script (owner) succeeds

**Steps:** Same as SRV-SCRIPT-01 but with `$TOKEN_OWNER_A` and title `"SRV Owner Script"`.

**Expected:** HTTP 201.

**Pass criteria:** Owner can create (manager+ policy).

---

### SRV-SCRIPT-03 | Create script (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"title":"No","description":"blocked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403 returned, no row created in `survey_scripts`.

---

### SRV-SCRIPT-04 | Create script (viewer) forbidden

**Steps:** Same as SRV-SCRIPT-03 with `$TOKEN_VIEWER_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### SRV-SCRIPT-05 | Create script with missing title returns 422

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"description":"no title"}'
```

**Expected:** HTTP 422.

**Pass criteria:** 422 with validation error on `title`.

---

### SRV-SCRIPT-06 | List scripts (volunteer read)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys?limit=20" | jq '.items | length, .items[0].id'
```

**Expected:** HTTP 200 with `items` array (≥1, includes the baseline seed + `$SCRIPT_ID`) and `pagination` object.

**Pass criteria:** Volunteer can list scripts.

---

### SRV-SCRIPT-07 | List scripts (viewer forbidden)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys"
```

**Expected:** HTTP 403 (list requires volunteer+).

**Pass criteria:** 403.

---

### SRV-SCRIPT-08 | List scripts filter by status

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys?status_filter=draft" \
  | jq '[.items[] | .status] | unique'
```

**Expected:** Array `["draft"]` only.

**Pass criteria:** Filter returns only draft scripts.

---

### SRV-SCRIPT-09 | List scripts with invalid status_filter returns 400

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys?status_filter=bogus"
```

**Expected:** HTTP 400.

**Pass criteria:** 400.

---

### SRV-SCRIPT-10 | Get script detail with questions

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" | jq '.id, .status, .questions | length'
```

**Expected:** HTTP 200 with nested `questions: []` (empty — no questions added yet).

**Pass criteria:** Returns script + empty questions array.

---

### SRV-SCRIPT-11 | Get non-existent script returns 404

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/00000000-0000-0000-0000-000000000000"
```

**Expected:** HTTP 404.

**Pass criteria:** 404.

---

### SRV-SCRIPT-12 | Update script title/description (manager)

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"title":"SRV Test Script 1 (renamed)","description":"updated"}' | jq '.title, .description'
```

**Expected:** HTTP 200 with new title + description.

**Pass criteria:** Title + description persisted.

---

### SRV-SCRIPT-13 | Update script (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"title":"hacked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 2: Questions CRUD

### SRV-QUES-01 | Add multiple_choice question to draft script

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{
    "question_text":"Which issue matters most to you?",
    "question_type":"multiple_choice",
    "options":{"choices":["Economy","Education","Healthcare","Environment"]},
    "position":1
  }' | jq .
```

**Expected:** HTTP 201 with `id`, `script_id == $SCRIPT_ID`, `position: 1`, `question_type: "multiple_choice"`, `options.choices` length 4.

**Record:** Save `id` as `$QUESTION_MC_ID`.

**Pass criteria:** 201 + options persisted.

---

### SRV-QUES-02 | Add scale question

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{
    "question_text":"Rate your support 1-5",
    "question_type":"scale",
    "options":{"min":1,"max":5},
    "position":2
  }' | jq '.id, .question_type, .position'
```

**Expected:** HTTP 201 with `question_type: "scale"`, `position: 2`.

**Record:** Save `id` as `$QUESTION_SCALE_ID`.

**Pass criteria:** 201.

---

### SRV-QUES-03 | Add free_text question

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{
    "question_text":"Any additional comments?",
    "question_type":"free_text",
    "position":3
  }' | jq '.id, .question_type, .position'
```

**Expected:** HTTP 201 with `question_type: "free_text"`, `options: null` or absent.

**Record:** Save `id` as `$QUESTION_FT_ID`.

**Pass criteria:** 201.

---

### SRV-QUES-04 | Add question with invalid type returns 422

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"question_text":"bad","question_type":"radio_button","position":4}'
```

**Expected:** HTTP 422.

**Pass criteria:** 422 (enum validation).

---

### SRV-QUES-05 | Add question with empty question_text returns 422

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"question_text":"","question_type":"free_text"}'
```

**Expected:** HTTP 422 or 400.

**Pass criteria:** Non-2xx error for empty question_text.

---

### SRV-QUES-06 | Add question (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"question_text":"blocked","question_type":"free_text"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### SRV-QUES-07 | GET script detail shows all 3 questions in position order

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  | jq '.questions | map({position, question_type})'
```

**Expected:** 3 questions returned, sorted by `position` ascending: `[{position:1,type:multiple_choice},{position:2,type:scale},{position:3,type:free_text}]`.

**Pass criteria:** Exactly 3 questions in correct order.

---

### SRV-QUES-08 | Update question text

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/$QUESTION_MC_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"question_text":"Which issue matters MOST to you?"}' | jq .question_text
```

**Expected:** HTTP 200 with updated text.

**Pass criteria:** Field updated.

---

### SRV-QUES-09 | Update question options (MC add a choice)

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/$QUESTION_MC_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"options":{"choices":["Economy","Education","Healthcare","Environment","Other"]}}' \
  | jq '.options.choices | length'
```

**Expected:** HTTP 200, choices length 5.

**Pass criteria:** Options updated.

---

### SRV-QUES-10 | Reorder questions (reverse order)

**Steps:**
```bash
curl -fsS -X PUT \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/order" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d "[\"$QUESTION_FT_ID\",\"$QUESTION_SCALE_ID\",\"$QUESTION_MC_ID\"]" \
  | jq 'map({id, position})'
```

**Expected:** HTTP 200, positions 1/2/3 now correspond to FT/SCALE/MC respectively.

**Pass criteria:** Reordering persisted (GET detail confirms new order).

---

### SRV-QUES-11 | Reorder with missing question_id returns 400

**Steps:** PUT order with a subset of 2 ids only.
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PUT \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/order" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d "[\"$QUESTION_FT_ID\",\"$QUESTION_SCALE_ID\"]"
```

**Expected:** HTTP 400 (incomplete ordering).

**Pass criteria:** 400.

---

### SRV-QUES-12 | Delete question from draft script

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/$QUESTION_FT_ID"
```

**Expected:** HTTP 204.

**Pass criteria:** 204; subsequent GET detail returns only 2 questions.

**Note:** Re-add the free_text question afterwards so downstream tests have 3 questions:
```bash
QUESTION_FT_ID=$(curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"question_text":"Any additional comments?","question_type":"free_text","position":3}' | jq -r .id)
```

---

### SRV-QUES-13 | Delete non-existent question returns 404

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/00000000-0000-0000-0000-000000000000"
```

**Expected:** HTTP 404.

**Pass criteria:** 404.

---

## Section 3: Script Status Transitions

### SRV-STATUS-01 | Activate draft script (draft → active)

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' | jq .status
```

**Expected:** HTTP 200 with `status: "active"`.

**Pass criteria:** Status transitioned to `active`.

---

### SRV-STATUS-02 | Edit question on active script (should be blocked or succeed per policy)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions/$QUESTION_MC_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"question_text":"Should not be editable on active?"}'
```

**Expected:** HTTP 400 (service enforces "draft only" edits) OR 200 if policy allows edits on active.

**Pass criteria:** Document actual behavior. Record as informational if service allows edits on active.

---

### SRV-STATUS-03 | List active scripts (volunteer)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys?status_filter=active" \
  | jq '[.items[] | select(.id=="'$SCRIPT_ID'")] | length'
```

**Expected:** `1` — our active script appears in the active filter.

**Pass criteria:** Active script visible to volunteer.

---

### SRV-STATUS-04 | Archive script (active → archived)

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"archived"}' | jq .status
```

**Expected:** HTTP 200 with `status: "archived"`.

**Pass criteria:** Archived.

---

### SRV-STATUS-05 | Re-activate archived script (archived → active)

**Steps:** PATCH `status: "active"`.

**Expected:** HTTP 200 OR 400 depending on whether archived → active is allowed.

**Pass criteria:** Document. If 400, invalid-transition must return a helpful error.

---

### SRV-STATUS-06 | Delete draft script succeeds, delete non-draft may fail

**Steps:** Create a fresh draft script, DELETE it, expect 204. Then attempt to DELETE `$SCRIPT_ID` (currently active/archived):

```bash
# Fresh draft
FRESH_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"title":"SRV delete-me"}' | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$FRESH_ID"
# Expect: 204

# Non-draft delete attempt
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID"
# Expect: 400 (service restricts deletion to draft) OR 204
```

**Expected:** Draft delete → 204. Non-draft delete → 400 per service policy (scripts with responses must not be deleted).

**Pass criteria:** Draft deletion succeeds; non-draft deletion behavior documented.

**Note:** If non-draft was deleted, re-create `$SCRIPT_ID` (active) before moving to Section 4. If 400 returned, move `$SCRIPT_ID` back to active:
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"status":"active"}' >/dev/null
```

---

## Section 4: Response Collection

### SRV-RESP-01 | Record batch responses (volunteer) for a voter

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"voter_id\":\"$VOTER_ID\",
    \"responses\":[
      {\"question_id\":\"$QUESTION_MC_ID\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Healthcare\"},
      {\"question_id\":\"$QUESTION_SCALE_ID\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"4\"},
      {\"question_id\":\"$QUESTION_FT_ID\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Keep up the good work\"}
    ]
  }" | jq 'length'
```

**Expected:** HTTP 201 with array of 3 response objects (id/script_id/question_id/voter_id/answer_value/answered_by/answered_at).

**Pass criteria:** 3 responses persisted.

---

### SRV-RESP-02 | List responses for voter

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/voters/$VOTER_ID/responses" \
  | jq 'length, .[0].answer_value'
```

**Expected:** HTTP 200 with 3-entry array (matching SRV-RESP-01 answers).

**Pass criteria:** 3 responses returned.

---

### SRV-RESP-03 | Record responses (viewer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[]}"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### SRV-RESP-04 | Record response with unknown question_id returns 400

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"voter_id\":\"$VOTER_ID\",
    \"responses\":[{\"question_id\":\"00000000-0000-0000-0000-000000000000\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"x\"}]
  }"
```

**Expected:** HTTP 400.

**Pass criteria:** 400 with helpful error.

---

### SRV-RESP-05 | Record response with unknown voter_id returns 400

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"voter_id\":\"00000000-0000-0000-0000-000000000000\",
    \"responses\":[{\"question_id\":\"$QUESTION_MC_ID\",\"voter_id\":\"00000000-0000-0000-0000-000000000000\",\"answer_value\":\"x\"}]
  }"
```

**Expected:** HTTP 400 or 404.

**Pass criteria:** Non-2xx error.

---

### SRV-RESP-06 | Record empty responses array

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[]}"
```

**Expected:** HTTP 201 with `[]` (empty batch allowed) OR 400.

**Pass criteria:** Document behavior.

---

### SRV-RESP-07 | DB verification — survey_responses rows exist

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT question_id, answer_value, answered_by
FROM survey_responses
WHERE script_id = '$SCRIPT_ID' AND voter_id = '$VOTER_ID'
ORDER BY answered_at;
"
```

**Expected:** ≥3 rows matching SRV-RESP-01 answers, `answered_by` = qa-volunteer's user ID.

**Pass criteria:** Rows present with correct attribution.

---

## Section 5: UI — Survey Management

### SRV-UI-01 | Survey scripts list page renders

**Steps:** In browser logged in as qa-manager, navigate to `https://run.civpulse.org/campaigns/$CAMPAIGN_A/surveys`. Take screenshot.

**Expected:**
- Page loads without console errors
- Shows list of scripts including `$SCRIPT_ID` with title, status badge (draft/active/archived), question count
- "Create Script" / "New Survey" button visible

**Pass criteria:** List renders, `$SCRIPT_ID` visible.

**Evidence:** `docs/production-shakedown/results/evidence/phase-08/SRV-UI-01-list.png`

---

### SRV-UI-02 | Survey builder (SurveyWidget) renders question types

**Steps:** Click `$SCRIPT_ID` from the list, open the builder. Screenshot.

**Expected:**
- All 3 questions visible with type badges (Multiple Choice / Scale / Free Text)
- Questions shown in position order
- Drag-to-reorder affordances or up/down buttons visible
- Options for MC question visible as chips/list

**Pass criteria:** Builder renders 3 questions with correct type labels.

**Evidence:** `docs/production-shakedown/results/evidence/phase-08/SRV-UI-02-builder.png`

---

### SRV-UI-03 | Add question via UI (MC)

**Steps:** In builder, click "Add Question", choose Multiple Choice, fill text, add 2 options, save. Verify it appears.

**Expected:** New question persisted + visible in list, network tab shows `POST .../questions` 201.

**Pass criteria:** Question added via UI.

---

### SRV-UI-04 | Volunteer role cannot see edit controls

**Steps:** Log out, log back in as qa-volunteer, navigate to `/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID`. Screenshot.

**Expected:**
- Page loads (read access)
- No "Edit" / "Add Question" / "Delete" buttons visible
- Status, questions, options all readable

**Pass criteria:** Volunteer sees read-only view; no write controls.

**Evidence:** `docs/production-shakedown/results/evidence/phase-08/SRV-UI-04-volunteer-ro.png`

---

### SRV-UI-05 | Viewer role blocked from surveys page

**Steps:** Log in as qa-viewer, navigate to `/campaigns/$CAMPAIGN_A/surveys`. Screenshot.

**Expected:** Either a "Permission denied" page OR the surveys nav item is absent from sidebar. API call returns 403.

**Pass criteria:** Viewer cannot access survey list.

**Evidence:** `docs/production-shakedown/results/evidence/phase-08/SRV-UI-05-viewer.png`

---

## Section 6: Edge Cases

### SRV-EDGE-01 | Activate script with zero questions

**Steps:**
```bash
EMPTY_ID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"title":"SRV zero-questions"}' | jq -r .id)

curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$EMPTY_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

**Expected:** Either HTTP 200 (service allows empty activation) OR HTTP 400 (service validates ≥1 question required).

**Pass criteria:** Document actual behavior. Cleanup: delete `$EMPTY_ID`.

---

### SRV-EDGE-02 | Multiple_choice question with zero options

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"question_text":"Pick one","question_type":"multiple_choice","options":{"choices":[]}}'
```

**Expected:** HTTP 400 or 422 (MC requires ≥1 option) OR 201 if validation lenient.

**Pass criteria:** Document behavior. If 201, note as P2 validation gap.

---

### SRV-EDGE-03 | MC question with no options field

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/questions" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"question_text":"No options?","question_type":"multiple_choice"}'
```

**Expected:** HTTP 400/422 OR 201 (service stores null options).

**Pass criteria:** Document.

---

### SRV-EDGE-04 | Archive script mid-session (responses in flight)

**Steps:** While `$SCRIPT_ID` is active, archive it. Then attempt a response record:
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"status":"archived"}' >/dev/null

curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" -H "Content-Type: application/json" \
  -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"$QUESTION_MC_ID\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Economy\"}]}"
```

**Expected:** 201 (responses still allowed post-archive) OR 400 (archived blocks new responses).

**Pass criteria:** Document. Re-activate script: PATCH status to active.

---

### SRV-EDGE-05 | Duplicate response for same voter + question

**Steps:** Record the same question twice for the same voter:
```bash
for i in 1 2; do
  curl -sS -o /dev/null -w "attempt$i=%{http_code}\n" -X POST \
    "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/surveys/$SCRIPT_ID/responses" \
    -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" -H "Content-Type: application/json" \
    -d "{\"voter_id\":\"$VOTER_ID\",\"responses\":[{\"question_id\":\"$QUESTION_MC_ID\",\"voter_id\":\"$VOTER_ID\",\"answer_value\":\"Education\"}]}"
done
```

**Expected:** Both 201 (multiple responses permitted, historical tracking) OR second returns 409 (upsert).

**Pass criteria:** Document behavior.

---

### SRV-EDGE-06 | Cross-campaign isolation — use CAMPAIGN_A script id under CAMPAIGN_B path

**Steps:** Using `$TOKEN_OWNER_A`, attempt to GET `$SCRIPT_ID` via Org B's campaign id path:
```bash
ORG_B_CAMPAIGN_ID=<from phase-00>
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_OWNER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/surveys/$SCRIPT_ID"
```

**Expected:** HTTP 403 (token has no access to Org B) OR 404. NEVER 200.

**Pass criteria:** Not 200. Escalate as P0 if 200.

---

## Results Template

Save filled copy to `results/phase-08-results.md`.

### Script CRUD

| Test ID | Result | Notes |
|---|---|---|
| SRV-SCRIPT-01 | | `$SCRIPT_ID` = ___ |
| SRV-SCRIPT-02 | | |
| SRV-SCRIPT-03 | | |
| SRV-SCRIPT-04 | | |
| SRV-SCRIPT-05 | | |
| SRV-SCRIPT-06 | | |
| SRV-SCRIPT-07 | | |
| SRV-SCRIPT-08 | | |
| SRV-SCRIPT-09 | | |
| SRV-SCRIPT-10 | | |
| SRV-SCRIPT-11 | | |
| SRV-SCRIPT-12 | | |
| SRV-SCRIPT-13 | | |

### Questions

| Test ID | Result | Notes |
|---|---|---|
| SRV-QUES-01 | | `$QUESTION_MC_ID` = ___ |
| SRV-QUES-02 | | `$QUESTION_SCALE_ID` = ___ |
| SRV-QUES-03 | | `$QUESTION_FT_ID` = ___ |
| SRV-QUES-04 | | |
| SRV-QUES-05 | | |
| SRV-QUES-06 | | |
| SRV-QUES-07 | | |
| SRV-QUES-08 | | |
| SRV-QUES-09 | | |
| SRV-QUES-10 | | |
| SRV-QUES-11 | | |
| SRV-QUES-12 | | |
| SRV-QUES-13 | | |

### Status transitions

| Test ID | Result | Notes |
|---|---|---|
| SRV-STATUS-01 | | |
| SRV-STATUS-02 | | |
| SRV-STATUS-03 | | |
| SRV-STATUS-04 | | |
| SRV-STATUS-05 | | |
| SRV-STATUS-06 | | |

### Responses

| Test ID | Result | Notes |
|---|---|---|
| SRV-RESP-01 | | |
| SRV-RESP-02 | | |
| SRV-RESP-03 | | |
| SRV-RESP-04 | | |
| SRV-RESP-05 | | |
| SRV-RESP-06 | | |
| SRV-RESP-07 | | |

### UI

| Test ID | Result | Notes |
|---|---|---|
| SRV-UI-01 | | |
| SRV-UI-02 | | |
| SRV-UI-03 | | |
| SRV-UI-04 | | |
| SRV-UI-05 | | |

### Edge cases

| Test ID | Result | Notes |
|---|---|---|
| SRV-EDGE-01 | | |
| SRV-EDGE-02 | | |
| SRV-EDGE-03 | | |
| SRV-EDGE-04 | | |
| SRV-EDGE-05 | | |
| SRV-EDGE-06 | | |

### Summary

- Total tests: 38
- PASS: ___ / 38
- FAIL: ___ / 38
- **P0 candidates:** SRV-EDGE-06 cross-campaign leak → P0.

## Cleanup

Delete Phase 08 scripts to avoid polluting downstream phases. Responses cascade-delete or should be removed first.

```bash
# Delete any SRV-owned scripts created in this phase (retain baseline phase-00 seed)
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE survey_responses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_questions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_scripts NO FORCE ROW LEVEL SECURITY;

DELETE FROM survey_responses
  WHERE script_id IN (
    SELECT id FROM survey_scripts
    WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
      AND title LIKE 'SRV %'
  );
DELETE FROM survey_questions
  WHERE script_id IN (
    SELECT id FROM survey_scripts
    WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
      AND title LIKE 'SRV %'
  );
DELETE FROM survey_scripts
  WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
    AND title LIKE 'SRV %';

ALTER TABLE survey_scripts FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_responses FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

Phase 16 performs final teardown of any remaining survey state.
