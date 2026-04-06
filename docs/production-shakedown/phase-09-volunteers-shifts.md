# Phase 09: Volunteers & Shifts

**Prefix:** `VOL`
**Depends on:** phase-00, phase-04
**Estimated duration:** 30 min
**Agents required:** 1

## Purpose

Exhaustively test volunteer and shift management: volunteer CRUD + self-registration, volunteer tags + tag membership, availability windows, shift CRUD, signup/assignment, check-in/check-out, hours adjustment, and role boundaries. This phase exercises scheduling workflows and negative paths for conflicts, past-shift protection, capacity overflow, and cross-role RBAC.

## Prerequisites

- Phase 00 complete (3 baseline volunteer profiles seeded in Org A via ENV-SEED-07)
- Phase 04 complete (QA Test Campaign active)
- Active JWTs: `$TOKEN_OWNER_A`, `$TOKEN_MANAGER_A`, `$TOKEN_VOLUNTEER_A`, `$TOKEN_VIEWER_A`, `$TOKEN_OWNER_B`
- `CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248`
- `CAMPAIGN_B=${ORG_B_CAMPAIGN_ID}` (from phase-00 results)

---

## Section 1: Volunteer CRUD

### VOL-CRUD-01 | Create volunteer (manager)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name":"Alice",
    "last_name":"Canvasser",
    "email":"alice.c@civpulse.test",
    "phone":"478-555-0101",
    "street":"101 Cherry St",
    "city":"Macon","state":"GA","zip_code":"31201",
    "skills":["canvassing","phone-bank"]
  }' | jq .
```

**Expected:** HTTP 201 with `id`, `campaign_id`, `first_name: "Alice"`, `status: "active"`, `skills: ["canvassing","phone-bank"]`, `created_by` = manager user id.

**Record:** Save `id` as `$VOL_ALICE_ID`.

**Pass criteria:** 201 + fields persisted.

---

### VOL-CRUD-02 | Create volunteer (owner)

**Steps:** Same as VOL-CRUD-01 with `$TOKEN_OWNER_A`, different email `bob.c@civpulse.test`, name `Bob Walker`.

**Expected:** HTTP 201.

**Record:** `$VOL_BOB_ID`.

**Pass criteria:** 201.

---

### VOL-CRUD-03 | Create volunteer (viewer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Blocked","last_name":"User"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-CRUD-04 | Create volunteer with missing required field

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"last_name":"NoFirst"}'
```

**Expected:** HTTP 422 (first_name required).

**Pass criteria:** 422.

---

### VOL-CRUD-05 | List volunteers (volunteer role)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers" | jq '.items | length'
```

**Expected:** HTTP 200, `items` includes baseline 3 + Alice + Bob (≥5).

**Pass criteria:** Volunteer+ can list.

---

### VOL-CRUD-06 | List volunteers filter by status

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers?status=active" \
  | jq '[.items[] | .status] | unique'
```

**Expected:** `["active"]` only.

**Pass criteria:** Filter works.

---

### VOL-CRUD-07 | List volunteers filter by skill

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers?skills=canvassing" \
  | jq '[.items[] | select(.id=="'$VOL_ALICE_ID'")] | length'
```

**Expected:** `1` — Alice (has `canvassing` skill) appears.

**Pass criteria:** Skill filter matches.

---

### VOL-CRUD-08 | List volunteers filter by name search

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers?name=Alice" \
  | jq '[.items[] | .first_name] | unique'
```

**Expected:** Array contains `"Alice"`.

**Pass criteria:** Name search returns Alice.

---

### VOL-CRUD-09 | List volunteers (viewer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-CRUD-10 | Get volunteer detail with tags + availability

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID" | jq .
```

**Expected:** HTTP 200 with full profile, `tags: []`, `availability: []`.

**Pass criteria:** 200 with nested shape.

---

### VOL-CRUD-11 | Get non-existent volunteer returns 404

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/00000000-0000-0000-0000-000000000000"
```

**Expected:** HTTP 404.

**Pass criteria:** 404.

---

### VOL-CRUD-12 | Update volunteer profile

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"phone":"478-555-0999","notes":"Prefers evenings"}' | jq '.phone, .notes'
```

**Expected:** HTTP 200 with updated phone + notes.

**Pass criteria:** Updates persisted.

---

### VOL-CRUD-13 | Update volunteer (volunteer role) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"notes":"hacked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-CRUD-14 | Update volunteer status → inactive

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_BOB_ID/status" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"inactive"}' | jq .status
```

**Expected:** HTTP 200 with `status: "inactive"`.

**Pass criteria:** Status transitioned.

---

### VOL-CRUD-15 | Update volunteer status with invalid value

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_BOB_ID/status" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"retired_maybe"}'
```

**Expected:** HTTP 422.

**Pass criteria:** 422 with validation failure.

**Note:** Restore Bob to active after:
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_BOB_ID/status" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"status":"active"}' >/dev/null
```

---

## Section 2: Self-Registration

### VOL-REG-01 | Volunteer self-registers

**Steps:** As qa-volunteer (who has no Volunteer row yet), POST to register:
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/register" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Volunteer","last_name":"Self","email":"qa-volunteer@civpulse.org","phone":"478-555-0200"}' \
  | jq '.id, .user_id'
```

**Expected:** HTTP 201 with `id` + `user_id` linking to qa-volunteer's user id.

**Record:** Save `id` as `$VOL_SELF_ID`.

**Pass criteria:** 201 + user_id set.

---

### VOL-REG-02 | Double registration returns 409

**Steps:** Repeat VOL-REG-01 exactly.

**Expected:** HTTP 409 with problem detail type `volunteer-already-registered` and existing `volunteer_id`.

**Pass criteria:** 409 with existing id.

---

### VOL-REG-03 | Register (viewer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/register" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Viewer","last_name":"Denied"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 3: Volunteer Tags

### VOL-TAG-01 | Create volunteer tag

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteer-tags" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"captain"}' | jq '.id, .name'
```

**Expected:** HTTP 201 with name `"captain"`.

**Record:** `$TAG_CAPTAIN_ID`.

**Pass criteria:** 201.

---

### VOL-TAG-02 | List tags

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteer-tags" | jq 'length'
```

**Expected:** HTTP 200 with array ≥1.

**Pass criteria:** List returns array.

---

### VOL-TAG-03 | Create tag (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteer-tags" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"blocked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-TAG-04 | Rename tag

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteer-tags/$TAG_CAPTAIN_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Team Captain"}' | jq .name
```

**Expected:** HTTP 200 with new name.

**Pass criteria:** Renamed.

---

### VOL-TAG-05 | Attach tag to volunteer

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/tags/$TAG_CAPTAIN_ID"
```

**Expected:** HTTP 201.

**Pass criteria:** 201; volunteer detail now shows `tags: ["Team Captain"]`.

---

### VOL-TAG-06 | Verify tag on volunteer detail

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID" | jq .tags
```

**Expected:** `["Team Captain"]`.

**Pass criteria:** Tag present.

---

### VOL-TAG-07 | Remove tag from volunteer

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/tags/$TAG_CAPTAIN_ID"
```

**Expected:** HTTP 204.

**Pass criteria:** 204; volunteer detail tags now empty.

---

### VOL-TAG-08 | Delete tag (cascades)

**Steps:** Re-attach tag, then delete tag:
```bash
curl -fsS -X POST -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/tags/$TAG_CAPTAIN_ID" >/dev/null
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteer-tags/$TAG_CAPTAIN_ID"
```

**Expected:** HTTP 204; volunteer's tags field now empty (cascade).

**Pass criteria:** 204 + cascade verified.

---

## Section 4: Availability

### VOL-AVAIL-01 | Add availability slot

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/availability" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"start_at":"2026-05-01T17:00:00Z","end_at":"2026-05-01T21:00:00Z"}' | jq .
```

**Expected:** HTTP 201 with `id`, `volunteer_id == $VOL_ALICE_ID`, `start_at`, `end_at`.

**Record:** `$AVAIL_1_ID`.

**Pass criteria:** 201.

---

### VOL-AVAIL-02 | Add availability with end before start (422)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/availability" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"start_at":"2026-05-01T21:00:00Z","end_at":"2026-05-01T17:00:00Z"}'
```

**Expected:** HTTP 422 (start before end validation) OR 201 (no validation).

**Pass criteria:** Document behavior. 201 → flag as P2 validation gap.

---

### VOL-AVAIL-03 | List availability

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/availability" \
  | jq 'length'
```

**Expected:** HTTP 200 with array ≥1.

**Pass criteria:** Array contains slot.

---

### VOL-AVAIL-04 | Delete availability slot

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/availability/$AVAIL_1_ID"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VOL-AVAIL-05 | Delete non-existent availability returns 404

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/availability/00000000-0000-0000-0000-000000000000"
```

**Expected:** HTTP 404.

**Pass criteria:** 404.

---

## Section 5: Shift CRUD

### VOL-SHIFT-01 | Create canvassing shift (manager)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"VOL Canvass Sat AM",
    "description":"East side walk",
    "type":"canvassing",
    "start_at":"2026-05-02T14:00:00Z",
    "end_at":"2026-05-02T18:00:00Z",
    "max_volunteers":2,
    "location_name":"HQ",
    "city":"Macon","state":"GA","zip_code":"31201"
  }' | jq .
```

**Expected:** HTTP 201 with `id`, `type: "canvassing"`, `status: "scheduled"`, `max_volunteers: 2`, `signed_up_count: 0`.

**Record:** `$SHIFT_A_ID`.

**Pass criteria:** 201.

---

### VOL-SHIFT-02 | Create phone_banking shift

**Steps:** Same as VOL-SHIFT-01 but `type: "phone_banking"`, name `VOL Phone Bank Eve`, times 2026-05-03T23:00/2026-05-04T02:00 UTC, `max_volunteers: 3`.

**Expected:** HTTP 201 with `type: "phone_banking"`.

**Record:** `$SHIFT_B_ID`.

**Pass criteria:** 201.

---

### VOL-SHIFT-03 | Create shift (viewer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"x","type":"canvassing","start_at":"2026-05-02T14:00:00Z","end_at":"2026-05-02T18:00:00Z","max_volunteers":1}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-SHIFT-04 | Create shift with invalid type

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"x","type":"pizza_party","start_at":"2026-05-02T14:00:00Z","end_at":"2026-05-02T18:00:00Z","max_volunteers":1}'
```

**Expected:** HTTP 422.

**Pass criteria:** 422.

---

### VOL-SHIFT-05 | List shifts (volunteer)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts" | jq '.items | length'
```

**Expected:** HTTP 200 with items ≥2.

**Pass criteria:** Volunteer can list.

---

### VOL-SHIFT-06 | List shifts filter by type

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts?type=phone_banking" \
  | jq '[.items[] | .type] | unique'
```

**Expected:** `["phone_banking"]`.

**Pass criteria:** Filter works.

---

### VOL-SHIFT-07 | Get shift detail

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID" \
  | jq '.id, .signed_up_count, .waitlist_count'
```

**Expected:** HTTP 200 with `signed_up_count: 0`, `waitlist_count: 0`.

**Pass criteria:** Counts accurate.

---

### VOL-SHIFT-08 | Update shift (change location)

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"location_name":"West HQ","description":"Updated"}' | jq '.location_name, .description'
```

**Expected:** HTTP 200 with new location.

**Pass criteria:** Updated.

---

### VOL-SHIFT-09 | Update shift (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"hacked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 6: Signup & Assignment

### VOL-SIGNUP-01 | Volunteer self-signup

**Steps:** qa-volunteer (registered as $VOL_SELF_ID in VOL-REG-01):
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/signup" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" | jq .
```

**Expected:** HTTP 201 with `shift_id`, `volunteer_id == $VOL_SELF_ID`, `status: "signed_up"` (or similar), `waitlist_position: null`.

**Pass criteria:** 201.

---

### VOL-SIGNUP-02 | Manager assigns Alice to shift (bypasses capacity)

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/assign/$VOL_ALICE_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" | jq .
```

**Expected:** HTTP 201 with `volunteer_id == $VOL_ALICE_ID`.

**Pass criteria:** 201.

---

### VOL-SIGNUP-03 | Shift is now at capacity (2/2)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID" \
  | jq '.signed_up_count, .max_volunteers'
```

**Expected:** `signed_up_count: 2`, `max_volunteers: 2`.

**Pass criteria:** Capacity reached.

---

### VOL-SIGNUP-04 | Self-signup when full — waitlisted or 422

**Steps:** Manager-assign Bob to the same shift:
```bash
curl -sS -w "HTTP=%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/assign/$VOL_BOB_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A"
```

**Expected:** HTTP 201 — manager_assign bypasses capacity (per docstring).

**Pass criteria:** 201 + Bob now on shift (3 on a 2-cap shift) OR waitlisted.

---

### VOL-SIGNUP-05 | List shift volunteers

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/volunteers" \
  | jq 'length, map(.volunteer_id)'
```

**Expected:** HTTP 200 with ≥3 entries.

**Pass criteria:** List includes all signed up volunteers.

---

### VOL-SIGNUP-06 | Duplicate signup prevented

**Steps:** qa-volunteer attempts signup again:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/signup" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A"
```

**Expected:** HTTP 422 (already signed up).

**Pass criteria:** 422.

---

### VOL-SIGNUP-07 | Volunteer cancels own signup

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/signup"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VOL-SIGNUP-08 | Manager removes volunteer from shift

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/volunteers/$VOL_BOB_ID"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

### VOL-SIGNUP-09 | Signup without registered Volunteer record returns 404

**Steps:** Use a fresh role (e.g. qa-owner who hasn't registered as volunteer):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/signup" \
  -H "Authorization: Bearer $TOKEN_OWNER_A"
```

**Expected:** HTTP 404 with `volunteer-not-registered` problem type.

**Pass criteria:** 404.

---

### VOL-SIGNUP-10 | Signup (viewer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/signup" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 7: Check-In / Check-Out & Hours

### VOL-CHECK-01 | Manager check-in Alice

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/check-in/$VOL_ALICE_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" | jq '.check_in_at, .status'
```

**Expected:** HTTP 200 with `check_in_at` set to current ts, status updated.

**Pass criteria:** Check-in persisted.

---

### VOL-CHECK-02 | Manager check-out Alice

**Steps:**
```bash
curl -fsS -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/check-out/$VOL_ALICE_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" | jq '.check_out_at, .hours'
```

**Expected:** HTTP 200 with `check_out_at` + computed `hours`.

**Pass criteria:** Check-out persisted + hours computed.

---

### VOL-CHECK-03 | Check-out before check-in returns 422

**Steps:** Try checking out Bob (never checked in):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/check-out/$VOL_BOB_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A"
```

**Expected:** HTTP 422 or 404.

**Pass criteria:** Non-2xx error.

---

### VOL-CHECK-04 | Check-in (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/check-in/$VOL_ALICE_ID" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-CHECK-05 | Manager adjusts hours with audit trail

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/volunteers/$VOL_ALICE_ID/hours" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"adjusted_hours":3.5,"adjustment_reason":"Arrived 30m late"}' \
  | jq '.adjusted_hours, .adjusted_by, .adjusted_at'
```

**Expected:** HTTP 200 with `adjusted_hours: 3.5`, `adjusted_by` = manager id, `adjusted_at` present.

**Pass criteria:** Adjustment persisted.

---

### VOL-CHECK-06 | Adjust hours (volunteer) forbidden

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/volunteers/$VOL_ALICE_ID/hours" \
  -H "Authorization: Bearer $TOKEN_VOLUNTEER_A" \
  -H "Content-Type: application/json" \
  -d '{"adjusted_hours":8.0,"adjustment_reason":"lies"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### VOL-CHECK-07 | Volunteer hours summary

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_ALICE_ID/hours" | jq .
```

**Expected:** HTTP 200 with `volunteer_id`, `total_hours`, `shifts_worked: 1`, `shifts: [...]` array showing our shift.

**Pass criteria:** Summary includes the shift.

---

## Section 8: Shift Status & Deletion Protection

### VOL-LIFE-01 | Update shift status → in_progress

**Steps:**
```bash
curl -sS -w "HTTP=%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/status" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

**Expected:** HTTP 200 OR 422 depending on service policy.

**Pass criteria:** Document behavior.

---

### VOL-LIFE-02 | Cannot update non-scheduled shift fields

**Steps:** Attempt to update shift name while in_progress:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed during shift"}'
```

**Expected:** HTTP 422 (service enforces "scheduled only" edits per docstring) OR 200.

**Pass criteria:** Document.

---

### VOL-LIFE-03 | Delete shift with checked-in volunteers blocked

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID"
```

**Expected:** HTTP 422 (has checked-in volunteers per delete_shift docstring).

**Pass criteria:** 422 with `shift-delete-failed` problem detail.

---

### VOL-LIFE-04 | Complete shift then delete — may be blocked

**Steps:** Set status to completed, then delete:
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID/status" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"status":"completed"}' >/dev/null
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_A_ID"
```

**Expected:** HTTP 422 (completed shifts protected) OR 204.

**Pass criteria:** Document. Completed shifts SHOULD be protected.

---

### VOL-LIFE-05 | Delete scheduled shift with no signups succeeds

**Steps:** Delete `$SHIFT_B_ID` (no signups):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$SHIFT_B_ID"
```

**Expected:** HTTP 204.

**Pass criteria:** 204.

---

## Section 9: UI

### VOL-UI-01 | Volunteer roster DataTable renders

**Steps:** Log in as qa-manager, navigate to `https://run.civpulse.org/campaigns/$CAMPAIGN_A/volunteers`. Screenshot.

**Expected:**
- Table shows all volunteers with columns: Name, Email, Phone, Status, Skills, Tags
- Filter controls (status, skill, name search) visible
- "New Volunteer" button visible
- Pagination or row count displayed

**Pass criteria:** Roster renders with Alice + Bob + baseline 3.

**Evidence:** `docs/production-shakedown/results/evidence/phase-09/VOL-UI-01-roster.png`

---

### VOL-UI-02 | VolunteerEditSheet opens + updates

**Steps:** Click Alice's row, edit phone number in sheet, save. Verify persistence.

**Expected:** Sheet opens with pre-filled form, save closes sheet, roster row reflects update.

**Pass criteria:** Update persisted via UI.

**Evidence:** `docs/production-shakedown/results/evidence/phase-09/VOL-UI-02-edit.png`

---

### VOL-UI-03 | ShiftDialog creates shift

**Steps:** Navigate to shifts page, click "New Shift", fill form (name, type, start/end, max_volunteers), save.

**Expected:** Dialog closes, shift appears in list with correct status badge.

**Pass criteria:** Shift created via UI.

**Evidence:** `docs/production-shakedown/results/evidence/phase-09/VOL-UI-03-shift-create.png`

---

### VOL-UI-04 | Volunteer self-registration form (logged-in)

**Steps:** Log out, log in as a fresh test user who has NOT registered yet (e.g. qa-b-volunteer against campaign A — will 403, so use a new Org A user or recreate $VOL_SELF_ID after unregister).

**Alternative:** As qa-volunteer, visit `/campaigns/$CAMPAIGN_A/volunteers/register` — should show "Already registered" since VOL-REG-01 already registered.

**Expected:** Either form renders and submits successfully, or already-registered state is shown with link to profile.

**Pass criteria:** Self-registration UI path works.

**Evidence:** `docs/production-shakedown/results/evidence/phase-09/VOL-UI-04-register.png`

---

### VOL-UI-05 | Volunteer shift calendar/list view

**Steps:** As qa-volunteer, view shifts available for signup. Screenshot.

**Expected:**
- List/calendar shows upcoming shifts with signup buttons
- Already-signed-up shifts are labelled
- Full shifts show "Full" or waitlist option

**Pass criteria:** Shift signup UI renders with state.

**Evidence:** `docs/production-shakedown/results/evidence/phase-09/VOL-UI-05-shift-list.png`

---

### VOL-UI-06 | Viewer sees no write controls

**Steps:** Log in as qa-viewer, attempt to access volunteers page. Screenshot.

**Expected:** 403 page, nav item hidden, or read-only page with no action buttons.

**Pass criteria:** Viewer sees no write surfaces.

**Evidence:** `docs/production-shakedown/results/evidence/phase-09/VOL-UI-06-viewer.png`

---

## Section 10: Cross-Tenant Isolation

### VOL-ISO-01 | Org B volunteer invisible to Org A

**Steps:** Create a volunteer in Org B:
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_B/volunteers" \
  -H "Authorization: Bearer $TOKEN_OWNER_B" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"TenantB","last_name":"Volunteer","email":"tb.vol@civpulse.test"}' | jq -r .id > /tmp/vol-b-id

VOL_B=$(cat /tmp/vol-b-id)

# Try to GET it from Org A
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_OWNER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/volunteers/$VOL_B"
```

**Expected:** HTTP 404 (volunteer not in campaign A).

**Pass criteria:** Not 200. If 200, P0 leak.

---

### VOL-ISO-02 | Org A user cannot access Org B shifts list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_OWNER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_B/shifts"
```

**Expected:** HTTP 403 (no campaign access).

**Pass criteria:** Not 200.

---

### VOL-ISO-03 | Assigning cross-campaign volunteer rejected

**Steps:** Try to assign Org B's volunteer `$VOL_B` to Org A's shift (use completed shift or new one):
```bash
NEW_SHIFT=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts" \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" -H "Content-Type: application/json" \
  -d '{"name":"VOL iso-test","type":"canvassing","start_at":"2026-06-01T14:00:00Z","end_at":"2026-06-01T18:00:00Z","max_volunteers":1}' | jq -r .id)

curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$NEW_SHIFT/assign/$VOL_B"
```

**Expected:** HTTP 404 or 422 (volunteer doesn't exist in this campaign).

**Pass criteria:** Not 201. If 201, P0 leak.

**Cleanup:** Delete `$NEW_SHIFT`:
```bash
curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN_MANAGER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/shifts/$NEW_SHIFT"
```

---

## Results Template

Save filled copy to `results/phase-09-results.md`.

### Volunteer CRUD

| Test ID | Result | Notes |
|---|---|---|
| VOL-CRUD-01 | | `$VOL_ALICE_ID` = ___ |
| VOL-CRUD-02 | | `$VOL_BOB_ID` = ___ |
| VOL-CRUD-03 | | |
| VOL-CRUD-04 | | |
| VOL-CRUD-05 | | |
| VOL-CRUD-06 | | |
| VOL-CRUD-07 | | |
| VOL-CRUD-08 | | |
| VOL-CRUD-09 | | |
| VOL-CRUD-10 | | |
| VOL-CRUD-11 | | |
| VOL-CRUD-12 | | |
| VOL-CRUD-13 | | |
| VOL-CRUD-14 | | |
| VOL-CRUD-15 | | |

### Self-registration

| Test ID | Result | Notes |
|---|---|---|
| VOL-REG-01 | | `$VOL_SELF_ID` = ___ |
| VOL-REG-02 | | |
| VOL-REG-03 | | |

### Tags

| Test ID | Result | Notes |
|---|---|---|
| VOL-TAG-01 | | `$TAG_CAPTAIN_ID` = ___ |
| VOL-TAG-02 | | |
| VOL-TAG-03 | | |
| VOL-TAG-04 | | |
| VOL-TAG-05 | | |
| VOL-TAG-06 | | |
| VOL-TAG-07 | | |
| VOL-TAG-08 | | |

### Availability

| Test ID | Result | Notes |
|---|---|---|
| VOL-AVAIL-01 | | `$AVAIL_1_ID` = ___ |
| VOL-AVAIL-02 | | |
| VOL-AVAIL-03 | | |
| VOL-AVAIL-04 | | |
| VOL-AVAIL-05 | | |

### Shift CRUD

| Test ID | Result | Notes |
|---|---|---|
| VOL-SHIFT-01 | | `$SHIFT_A_ID` = ___ |
| VOL-SHIFT-02 | | `$SHIFT_B_ID` = ___ |
| VOL-SHIFT-03 | | |
| VOL-SHIFT-04 | | |
| VOL-SHIFT-05 | | |
| VOL-SHIFT-06 | | |
| VOL-SHIFT-07 | | |
| VOL-SHIFT-08 | | |
| VOL-SHIFT-09 | | |

### Signup & Assignment

| Test ID | Result | Notes |
|---|---|---|
| VOL-SIGNUP-01 | | |
| VOL-SIGNUP-02 | | |
| VOL-SIGNUP-03 | | |
| VOL-SIGNUP-04 | | |
| VOL-SIGNUP-05 | | |
| VOL-SIGNUP-06 | | |
| VOL-SIGNUP-07 | | |
| VOL-SIGNUP-08 | | |
| VOL-SIGNUP-09 | | |
| VOL-SIGNUP-10 | | |

### Check-in / Hours

| Test ID | Result | Notes |
|---|---|---|
| VOL-CHECK-01 | | |
| VOL-CHECK-02 | | |
| VOL-CHECK-03 | | |
| VOL-CHECK-04 | | |
| VOL-CHECK-05 | | |
| VOL-CHECK-06 | | |
| VOL-CHECK-07 | | |

### Shift lifecycle

| Test ID | Result | Notes |
|---|---|---|
| VOL-LIFE-01 | | |
| VOL-LIFE-02 | | |
| VOL-LIFE-03 | | |
| VOL-LIFE-04 | | |
| VOL-LIFE-05 | | |

### UI

| Test ID | Result | Notes |
|---|---|---|
| VOL-UI-01 | | |
| VOL-UI-02 | | |
| VOL-UI-03 | | |
| VOL-UI-04 | | |
| VOL-UI-05 | | |
| VOL-UI-06 | | |

### Cross-tenant isolation

| Test ID | Result | Notes |
|---|---|---|
| VOL-ISO-01 | | |
| VOL-ISO-02 | | |
| VOL-ISO-03 | | |

### Summary

- Total tests: 59
- PASS: ___ / 59
- FAIL: ___ / 59
- **P0 candidates:** Any VOL-ISO-* returning 2xx cross-tenant → P0.

## Cleanup

Remove phase 09 volunteers, shifts, tags, and availability. Delete in FK-safe order.

```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE shift_volunteers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE shifts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_availability NO FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_tag_memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_tags NO FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteers NO FORCE ROW LEVEL SECURITY;

-- Remove shift signups for VOL-prefixed shifts
DELETE FROM shift_volunteers
  WHERE shift_id IN (
    SELECT id FROM shifts
    WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
      AND name LIKE 'VOL %'
  );

DELETE FROM shifts
  WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
    AND name LIKE 'VOL %';

-- Remove availability + tag memberships for test volunteers
DELETE FROM volunteer_availability
  WHERE volunteer_id IN (
    SELECT id FROM volunteers
    WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
      AND email IN ('alice.c@civpulse.test','bob.c@civpulse.test')
  );

DELETE FROM volunteer_tag_memberships
  WHERE volunteer_id IN (
    SELECT id FROM volunteers
    WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
      AND email IN ('alice.c@civpulse.test','bob.c@civpulse.test')
  );

DELETE FROM volunteer_tags
  WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
    AND name IN ('captain','Team Captain');

DELETE FROM volunteers
  WHERE campaign_id = '06d710c8-32ce-44ae-bbab-7fcc72aab248'
    AND email IN ('alice.c@civpulse.test','bob.c@civpulse.test');

ALTER TABLE volunteers FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_tag_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE shift_volunteers FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

**Note:** Do NOT delete the self-registered qa-volunteer row (`$VOL_SELF_ID`) — downstream phases (phase 10 Field Mode) depend on it.

Phase 16 performs final teardown.
