# Phase 07: Phone Banking

**Prefix:** `PB`
**Depends on:** phase-00, phase-04, phase-05
**Estimated duration:** 45 min
**Agents required:** 1

## Purpose

Exhaustively exercise the phone-banking stack: call list lifecycle, phone bank sessions, caller assignment, the claim workflow, call recording, and the DNC integration. Every endpoint in `app/api/v1/call_lists.py`, `app/api/v1/phone_banks.py`, and `app/api/v1/dnc.py` is probed with happy-path and role-based negative cases. Field-mode offline call flows are covered in phase-10; this phase validates the online API and desktop-manager UI.

## Prerequisites

- Phase 00 complete (Org A + Org B, tokens available)
- Phase 04 complete (`$CAMPAIGN_A` = `06d710c8-32ce-44ae-bbab-7fcc72aab248` reachable)
- Phase 05 complete — at least one voter list with ≥5 voters exists (`$VOTER_LIST_A_ID`)
- Fresh tokens in env vars: `$TOKEN_A` (owner), `$TOKEN_ADMIN_A`, `$TOKEN_MGR_A`, `$TOKEN_VOL_A`, `$TOKEN_VIEWER_A`, `$TOKEN_B` (Org B owner)
- `CAMPAIGN_A=06d710c8-32ce-44ae-bbab-7fcc72aab248`

Record created resources: `$CALL_LIST_A_ID`, `$SESSION_A_ID`, `$CLAIMED_ENTRY_ID`, `$DNC_ENTRY_ID`.

---

## Section 1: Call List CRUD

### PB-CL-01 | Create call list from voter list (manager+)

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"PB Test Call List — Shakedown\",
    \"voter_list_id\": \"$VOTER_LIST_A_ID\",
    \"max_attempts\": 3,
    \"claim_timeout_minutes\": 30,
    \"cooldown_minutes\": 60
  }"
cat /tmp/body.json | jq '.id, .name, .status, .total_entries'
```

**Expected:** HTTP 201. `.total_entries` > 0 (matches voter list size minus any DNC or missing phone).

**Pass criteria:** 201. Record `.id` → `$CALL_LIST_A_ID`.

---

### PB-CL-02 | List call lists (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists?limit=20" | jq '.items | length, .items[0]'
```

**Expected:** HTTP 200 paginated response with summary rows (name, status, total_entries, completed_entries).

**Pass criteria:** `$CALL_LIST_A_ID` present.

---

### PB-CL-03 | GET call list detail

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID" | jq .
```

**Expected:** HTTP 200 with full call list fields.

**Pass criteria:** Correct call list returned.

---

### PB-CL-04 | Update call list name + settings (manager+)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"PB Test Call List (renamed)","max_attempts":5}' | jq '.name, .max_attempts'
```

**Expected:** HTTP 200 with updated values.

**Pass criteria:** Fields updated.

---

### PB-CL-05 | Status transition draft → active (manager+)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID?new_status=active" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" -d '{}'
cat /tmp/body.json | jq .status
```

**Expected:** HTTP 200, `.status == "active"`.

**Pass criteria:** Status transition accepted.

---

### PB-CL-06 | Status transition active → completed (manager+)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID?new_status=completed" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" -d '{}'
# revert back to active for later tests
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID?new_status=active" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" -d '{}' | jq .status
```

**Expected:** First returns 200 with `completed`; second restores `active`.

**Pass criteria:** Both transitions succeed.

---

### PB-CL-07 | Invalid status transition rejected

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID?new_status=INVALID_STATE" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" -d '{}'
cat /tmp/body.json
```

**Expected:** HTTP 422 or 400.

**Pass criteria:** Non-2xx; status unchanged.

---

### PB-CL-08 | Append voters from another voter list

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/append-from-list" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{\"voter_list_id\":\"$VOTER_LIST_A_ID\"}"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 200 with counts (added/skipped).

**Pass criteria:** 200. Duplicates skipped (expected since we already populated from this list).

---

### PB-CL-09 | Volunteer cannot create call list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"vol attempt\",\"voter_list_id\":\"$VOTER_LIST_A_ID\"}"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-CL-10 | Volunteer cannot update call list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" -d '{"name":"hacked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-CL-11 | Volunteer cannot delete call list

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403. Call list still exists.

---

### PB-CL-12 | Volunteer CAN read call list

Covered by PB-CL-02 and PB-CL-03.

---

## Section 2: Call List Entries

### PB-ENT-01 | List call list entries (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/entries?limit=50" \
  | jq '.items | length, .items[0]'
```

**Expected:** HTTP 200 paginated list.

**Pass criteria:** 200; entries present.

---

### PB-ENT-02 | Filter entries by entry_status

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/entries?entry_status=pending" \
  | jq '.items | length'
```

**Expected:** HTTP 200. All returned items have `entry_status = pending`.

**Pass criteria:** Filter respected.

---

### PB-ENT-03 | Empty call list — create & list entries

**Steps:**
```bash
EMPTY_CL=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"PB Empty CL","max_attempts":1}' | jq -r .id)
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$EMPTY_CL/entries" | jq '.items | length'
```

**Expected:** 0 entries, HTTP 200.

**Pass criteria:** 200; empty array.

**Cleanup:** delete `$EMPTY_CL`.

---

## Section 3: Claim workflow (stateful)

### PB-CLAIM-01 | Volunteer claims a batch of entries

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 2}'
cat /tmp/body.json | jq '. | length, .[0].id, .[0].claimed_by'
```

**Expected:** HTTP 200 with up to 2 entries, each `claimed_by` = volunteer's user id.

**Pass criteria:** 2 entries returned (or fewer if list depleted). Record first entry id → `$CLAIMED_ENTRY_ID`.

---

### PB-CLAIM-02 | Repeat claim returns different entries (no double-claim)

**Steps:** Run PB-CLAIM-01 again with the SAME volunteer token.
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size": 2}' | jq '.[].id'
```

**Expected:** Either (a) 2 *different* entries, or (b) the same previously-claimed entries returned because they're still under cooldown for this user.

**Pass criteria:** No entry is claimed by two different volunteers simultaneously.

---

### PB-CLAIM-03 | Claim with batch_size=0 or >max

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size": 0}'
cat /tmp/body.json
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size": 10000}'
cat /tmp/body.json
```

**Expected:** Either 422 rejection or silent clamp to a safe value.

**Pass criteria:** No 500 error. Document behavior.

---

### PB-CLAIM-04 | Viewer cannot claim entries

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" -d '{"batch_size":1}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 4: Phone bank sessions (CRUD)

### PB-SESS-01 | Create phone bank session (manager+)

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"PB Shakedown Session\",
    \"call_list_id\": \"$CALL_LIST_A_ID\"
  }"
cat /tmp/body.json | jq '.id, .name, .call_list_id, .status'
```

**Expected:** HTTP 201.

**Pass criteria:** 201. Record `.id` → `$SESSION_A_ID`.

---

### PB-SESS-02 | List sessions (volunteer+)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions?limit=20" | jq '.items | length'
```

**Expected:** HTTP 200. Session visible.

**Pass criteria:** 200.

---

### PB-SESS-03 | List sessions filtered to "assigned to me"

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions?assigned_to_me=true" | jq '.items | length'
```

**Expected:** HTTP 200. Returns 0 before volunteer is assigned; see PB-CALLER-01.

**Pass criteria:** 200.

---

### PB-SESS-04 | GET session detail

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID" | jq .
```

**Expected:** HTTP 200.

**Pass criteria:** Correct session returned.

---

### PB-SESS-05 | Update session (manager+)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"PB Shakedown Session (renamed)"}' | jq .name
```

**Expected:** HTTP 200 with updated name.

**Pass criteria:** Name updated.

---

### PB-SESS-06 | Volunteer cannot create session

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"vol\",\"call_list_id\":\"$CALL_LIST_A_ID\"}"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-SESS-07 | Volunteer cannot update session

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" -d '{"name":"hacked"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-SESS-08 | Volunteer cannot delete session

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-SESS-09 | Create session with nonexistent call_list_id

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"bogus","call_list_id":"00000000-0000-0000-0000-000000000000"}'
```

**Expected:** HTTP 404 or 422.

**Pass criteria:** Non-2xx.

---

## Section 5: Session callers (assignment)

### PB-CALLER-01 | Assign caller to session (manager+)

**Steps:**
```bash
QA_VOL_ID="367278371970744389"
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/callers" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$QA_VOL_ID\"}"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 201 with `SessionCallerResponse`.

**Pass criteria:** Caller assigned.

---

### PB-CALLER-02 | List session callers

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/callers" | jq .
```

**Expected:** HTTP 200. List contains volunteer.

**Pass criteria:** `$QA_VOL_ID` present.

---

### PB-CALLER-03 | Get "callers/me" (current user's assignment)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/callers/me" | jq .
```

**Expected:** HTTP 200 with current user's SessionCaller row.

**Pass criteria:** Returns current caller assignment.

---

### PB-CALLER-04 | Volunteer cannot assign a caller

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/callers" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" -d '{"user_id":"fake"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-CALLER-05 | Volunteer check-in to session

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/check-in" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 200 with updated SessionCaller (checked_in_at set).

**Pass criteria:** 200.

---

### PB-CALLER-06 | Volunteer check-out from session

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/check-out" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 200 (checked_out_at set).

**Pass criteria:** 200. Re-check-in for later tests:
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/check-in" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

---

### PB-CALLER-07 | Remove caller from session (manager+)

**Steps:** (Run this LAST; it removes our test caller.)
```bash
QA_VOL_ID="367278371970744389"
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/callers/$QA_VOL_ID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204. Re-add for subsequent tests:
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/callers" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$QA_VOL_ID\"}"
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/check-in" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

---

## Section 6: Call recording

### PB-CALL-01 | Record call with ANSWERED outcome

**Steps:**
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
LATER=$(date -u -d "+2 minutes" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -v+2M +"%Y-%m-%dT%H:%M:%S")
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"call_list_entry_id\": \"$CLAIMED_ENTRY_ID\",
    \"result_code\": \"answered\",
    \"phone_number_used\": \"+14785551212\",
    \"call_started_at\": \"$NOW\",
    \"call_ended_at\": \"$LATER\",
    \"notes\": \"PB-CALL-01 shakedown\",
    \"survey_complete\": false
  }"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 201 with `CallRecordResponse`.

**Pass criteria:** 201. Entry now marked completed (or attempted count incremented).

---

### PB-CALL-02 | Record call — each outcome code

**Steps:** Claim a fresh batch of 7 entries, then record one call per outcome:
```bash
RESULTS=(answered no_answer busy wrong_number voicemail refused disconnected)
BATCH=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size":7}' | jq -r '.[].id')
i=0
for eid in $BATCH; do
  r="${RESULTS[$i]}"
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
  curl -sS -o /dev/null -w "$r -> %{http_code}\n" \
    -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
    -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d "{\"call_list_entry_id\":\"$eid\",\"result_code\":\"$r\",\"phone_number_used\":\"+14785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\",\"survey_complete\":false}"
  i=$((i+1))
done
```

**Expected:** Each returns 201.

**Pass criteria:** 7/7 outcomes accepted. Any 422 = P1 (missing enum value).

---

### PB-CALL-03 | Invalid result_code rejected

**Steps:**
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"BOGUS\",\"phone_number_used\":\"+14785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\"}"
```

**Expected:** HTTP 422.

**Pass criteria:** 422.

---

### PB-CALL-04 | Record call with survey responses

**Steps:** Claim one entry, record call with survey attached. Requires a survey script exists (seeded from phase-08 — skip if absent).
```bash
EID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size":1}' | jq -r '.[0].id')
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{
    \"call_list_entry_id\": \"$EID\",
    \"result_code\": \"answered\",
    \"phone_number_used\": \"+14785551212\",
    \"call_started_at\": \"$NOW\",
    \"call_ended_at\": \"$NOW\",
    \"survey_responses\": [],
    \"survey_complete\": true
  }"
cat /tmp/body.json
```

**Expected:** HTTP 201.

**Pass criteria:** 201.

---

### PB-CALL-05 | Record call with call_ended_at < call_started_at

**Steps:**
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
PAST=$(date -u -d "-5 minutes" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -v-5M +"%Y-%m-%dT%H:%M:%S")
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"+14785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$PAST\"}"
```

**Expected:** Either HTTP 422 (validation) OR 201 accepting negative duration (document).

**Pass criteria:** No 500. Document.

---

### PB-CALL-06 | Viewer cannot record call

**Steps:**
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"+14785551212\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\"}"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 7: Session progress & entry management

### PB-PROG-01 | GET session progress stats

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/progress" | jq .
```

**Expected:** HTTP 200 with fields for total calls, contact rate, duration.

**Pass criteria:** `total_calls >= 8` (from PB-CALL-01 + PB-CALL-02). Document contact rate.

---

### PB-PROG-02 | Entry self-release (volunteer)

**Steps:**
```bash
EID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size":1}' | jq -r '.[0].id')
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/entries/$EID/self-release" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 200, entry returned to pool (claimed_by cleared).

**Pass criteria:** 200.

---

### PB-PROG-03 | Manager release of entry

**Steps:**
```bash
EID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size":1}' | jq -r '.[0].id')
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/entries/$EID/release" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 200.

**Pass criteria:** 200.

---

### PB-PROG-04 | Manager reassign entry to different caller

**Steps:**
```bash
EID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size":1}' | jq -r '.[0].id')
QA_ADMIN_ID="367278367172460613"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/entries/$EID/reassign" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$QA_ADMIN_ID\"}"
cat /tmp/body.json | jq .
```

**Expected:** HTTP 200 (if reassignment endpoint supports target user) OR 404/422.

**Pass criteria:** Non-500. Document.

---

### PB-PROG-05 | Volunteer cannot use manager reassign endpoint

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/entries/$EID/reassign" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" -d '{}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

## Section 8: DNC integration

### PB-DNC-01 | Add phone number to DNC (manager+)

**Steps:**
```bash
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"phone_number":"+14785559999","reason":"PB shakedown test"}'
cat /tmp/body.json | jq .
```

**Expected:** HTTP 201.

**Pass criteria:** 201. Record `.id` → `$DNC_ENTRY_ID`.

---

### PB-DNC-02 | List DNC entries

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_MGR_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" | jq 'length'
```

**Expected:** HTTP 200 with array containing `$DNC_ENTRY_ID`.

**Pass criteria:** ≥1 entry.

---

### PB-DNC-03 | Check number against DNC (volunteer+)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/check" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"phone_numbers":["+14785559999","+14785551111"]}' | jq .
```

**Expected:** HTTP 200 with results — `+14785559999` flagged, `+14785551111` not.

**Pass criteria:** DNC match detected correctly.

---

### PB-DNC-04 | Volunteer cannot add DNC entry

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"phone_number":"+14785558888"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-DNC-05 | Volunteer cannot delete DNC entry

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/$DNC_ENTRY_ID" \
  -H "Authorization: Bearer $TOKEN_VOL_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### PB-DNC-06 | Viewer cannot list DNC entries

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc"
```

**Expected:** HTTP 403 (`require_role("manager")`).

**Pass criteria:** 403.

---

### PB-DNC-07 | Call list excludes/flags DNC-matched voters

**Steps:** Find a voter in `$CALL_LIST_A_ID` whose phone matches a DNC entry. If none: add a DNC entry for a known voter's phone, then append-from-list or re-create the call list.
```bash
# Find one voter's phone
VOTER_PHONE=$(psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -t -A -c \
  "SELECT primary_phone FROM voters WHERE campaign_id='$CAMPAIGN_A' AND primary_phone IS NOT NULL LIMIT 1;")
# Add to DNC
DNC_VID=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"phone_number\":\"$VOTER_PHONE\",\"reason\":\"PB-DNC-07\"}" | jq -r .id)
# Check DNC flag appears
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/check" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"phone_numbers\":[\"$VOTER_PHONE\"]}" | jq .
# Cleanup
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/$DNC_VID" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** DNC check returns flagged=true for that number.

**Pass criteria:** DNC match visible.

---

### PB-DNC-08 | Attempted call to DNC-flagged number (observational)

**Steps:** Record a call where `phone_number_used` matches a DNC entry.
```bash
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID/calls" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d "{\"call_list_entry_id\":\"$CLAIMED_ENTRY_ID\",\"result_code\":\"answered\",\"phone_number_used\":\"+14785559999\",\"call_started_at\":\"$NOW\",\"call_ended_at\":\"$NOW\"}"
cat /tmp/body.json
```

**Expected:** Either HTTP 201 (recorded, DNC-warning flag on response) OR HTTP 403/422 (DNC enforcement blocks call).

**Pass criteria:** Document behavior. If 201 with no DNC warning → P2 hardening gap.

---

## Section 9: Delete lifecycle

### PB-DEL-01 | Delete session (manager+)

**Steps:**
```bash
DISP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"name\":\"PB Disposable\",\"call_list_id\":\"$CALL_LIST_A_ID\"}" | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$DISP" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MGR_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$DISP"
```

**Expected:** 204 then 404.

**Pass criteria:** Session deleted.

---

### PB-DEL-02 | Delete call list (manager+)

**Steps:**
```bash
DISP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"PB Disposable CL","max_attempts":1}' | jq -r .id)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$DISP" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MGR_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$DISP"
```

**Expected:** 204 then 404.

**Pass criteria:** Call list deleted.

---

## Section 10: UI — Phone bank pages

### PB-UI-01 | /campaigns/{id}/phone-banking renders (desktop)

**Steps:** Browser — log in as qa-manager, navigate to `https://run.civpulse.org/campaigns/$CAMPAIGN_A/phone-banking`.

**Expected:** Hub page with Call Lists section + Sessions section.

**Pass criteria:** Page loads, no console errors.

**Screenshot:** `results/evidence/phase-07/PB-UI-01-hub.png`.

---

### PB-UI-02 | Call list management page

**Steps:** Click a call list to open its detail page.

**Expected:** Shows name, status, total/completed entries, max_attempts, entries table with voter info, status filter.

**Pass criteria:** `$CALL_LIST_A_ID` detail renders correctly.

---

### PB-UI-03 | Create call list wizard

**Steps:** Click "New Call List", fill voter list + name + settings, submit.

**Expected:** Wizard dialog; submit creates list, redirects to detail.

**Pass criteria:** New call list appears in list.

---

### PB-UI-04 | Session list view

**Steps:** Navigate to Sessions tab on phone-banking hub.

**Expected:** Table/grid of sessions with name, call list, status, caller count.

**Pass criteria:** `$SESSION_A_ID` visible.

---

### PB-UI-05 | "My Sessions" view (volunteer)

**Steps:** Log in as qa-volunteer, navigate to `/field/phone-banking` or `/my/sessions` (check actual route).

**Expected:** Shows only sessions where volunteer is a caller.

**Pass criteria:** `$SESSION_A_ID` visible to volunteer.

**Screenshot:** `results/evidence/phase-07/PB-UI-05-my-sessions.png`.

---

### PB-UI-06 | Session detail — callers list

**Steps:** On session detail page (as manager), verify callers section.

**Expected:** Shows assigned callers with check-in status, add/remove buttons.

**Pass criteria:** `$QA_VOL_ID` listed.

---

### PB-UI-07 | Session detail — stats / drilldown

**Steps:** Verify the session dashboard drilldown (total calls, contact rate, avg duration).

**Expected:** Stats match PB-PROG-01 API response.

**Pass criteria:** Numbers match.

---

### PB-UI-08 | Claim & call workflow (volunteer UI)

**Steps:** As qa-volunteer in field UI, enter session → click "Start Calling" → verify a call card appears with voter info + outcome buttons.

**Expected:** Claim request fires, card renders with voter + phone + script.

**Pass criteria:** Card visible, call can be recorded from UI.

**Screenshot:** `results/evidence/phase-07/PB-UI-08-call-card.png`.

---

### PB-UI-09 | Record call outcome from UI

**Steps:** Click an outcome button ("Answered", "No Answer", etc.), fill notes if prompted, submit.

**Expected:** Call POST fires, card advances to next entry.

**Pass criteria:** Call recorded; next card appears.

---

### PB-UI-10 | DNC management page

**Steps:** Navigate to DNC section (likely under phone-banking or campaign admin).

**Expected:** Table of DNC entries with add/delete actions.

**Pass criteria:** `$DNC_ENTRY_ID` visible.

---

### PB-UI-11 | Delete confirmations

**Steps:** Delete a disposable call list + session via UI.

**Expected:** ConfirmDialog shown; confirm → DELETE fires → row removed.

**Pass criteria:** Both flows confirm before destructive action.

---

## Section 11: Edge cases

### PB-EDGE-01 | Claim from empty call list

**Steps:** Create a call list with no entries (voter_list_id omitted):
```bash
EMPTY=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"PB Empty 2","max_attempts":1}' | jq -r .id)
curl -fsS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$EMPTY/claim" \
  -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
  -d '{"batch_size":5}'
cat /tmp/body.json
# cleanup
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$EMPTY" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 200 with empty array.

**Pass criteria:** 200, `[]`.

---

### PB-EDGE-02 | Session with 0 entries assigned

**Steps:** Create a session against an empty call list:
```bash
EMPTY_CL=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d '{"name":"PB Empty CL3","max_attempts":1}' | jq -r .id)
SESS=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions" \
  -H "Authorization: Bearer $TOKEN_MGR_A" -H "Content-Type: application/json" \
  -d "{\"name\":\"PB Empty Session\",\"call_list_id\":\"$EMPTY_CL\"}" | jq -r .id)
curl -fsS -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESS/progress" | jq .
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESS" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$EMPTY_CL" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** Progress returns zero counts, no errors.

**Pass criteria:** 200 with zeros.

---

### PB-EDGE-03 | Cooldown behavior — re-claim after cooldown

**Steps:** (Observational — hard to test without time manipulation.) Confirm endpoint docs/behavior by claiming same volunteer-specific entry twice quickly.

**Expected:** Second claim returns the same entry (within cooldown) OR 409.

**Pass criteria:** No duplication. Document.

---

### PB-EDGE-04 | max_attempts enforcement

**Steps:** Take an entry, record call with `no_answer` outcome max_attempts times, then attempt one more call on that entry.

**Expected:** After max_attempts, entry marked `attempted`/closed; further call POST returns 422 or 409.

**Pass criteria:** Enforcement fires after N attempts.

---

### PB-EDGE-05 | Concurrent claims (race probe)

**Steps:** Fire 5 concurrent claim requests with batch_size=5 each from same volunteer.
```bash
for i in 1 2 3 4 5; do
  curl -sS -o "/tmp/claim-$i.json" -w "$i -> %{http_code}\n" \
    -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID/claim" \
    -H "Authorization: Bearer $TOKEN_VOL_A" -H "Content-Type: application/json" \
    -d '{"batch_size":5}' &
done
wait
# Count distinct entry IDs across all claims
jq -s '[.[] | .[]] | map(.id) | unique | length' /tmp/claim-*.json
```

**Expected:** All 5 requests return 200. Unique id count equals total items returned (no duplicates).

**Pass criteria:** No entry returned in two concurrent claim responses.

**Failure meaning:** Double-claim race → P1.

---

## Results Template

Save filled to `results/phase-07-results.md`.

### Call list CRUD

| Test ID | Result | Notes |
|---|---|---|
| PB-CL-01 | | call_list_id: |
| PB-CL-02 | | |
| PB-CL-03 | | |
| PB-CL-04 | | |
| PB-CL-05 | | |
| PB-CL-06 | | |
| PB-CL-07 | | |
| PB-CL-08 | | |
| PB-CL-09 | | |
| PB-CL-10 | | |
| PB-CL-11 | | |
| PB-CL-12 | | covered |

### Entries

| Test ID | Result | Notes |
|---|---|---|
| PB-ENT-01 | | |
| PB-ENT-02 | | |
| PB-ENT-03 | | |

### Claim workflow

| Test ID | Result | Notes |
|---|---|---|
| PB-CLAIM-01 | | entry_id: |
| PB-CLAIM-02 | | |
| PB-CLAIM-03 | | |
| PB-CLAIM-04 | | |

### Sessions

| Test ID | Result | Notes |
|---|---|---|
| PB-SESS-01 | | session_id: |
| PB-SESS-02 | | |
| PB-SESS-03 | | |
| PB-SESS-04 | | |
| PB-SESS-05 | | |
| PB-SESS-06 | | |
| PB-SESS-07 | | |
| PB-SESS-08 | | |
| PB-SESS-09 | | |

### Callers

| Test ID | Result | Notes |
|---|---|---|
| PB-CALLER-01 | | |
| PB-CALLER-02 | | |
| PB-CALLER-03 | | |
| PB-CALLER-04 | | |
| PB-CALLER-05 | | |
| PB-CALLER-06 | | |
| PB-CALLER-07 | | |

### Call recording

| Test ID | Result | Notes |
|---|---|---|
| PB-CALL-01 | | |
| PB-CALL-02 | | 7 outcomes |
| PB-CALL-03 | | |
| PB-CALL-04 | | |
| PB-CALL-05 | | |
| PB-CALL-06 | | |

### Progress & entry mgmt

| Test ID | Result | Notes |
|---|---|---|
| PB-PROG-01 | | total_calls: |
| PB-PROG-02 | | |
| PB-PROG-03 | | |
| PB-PROG-04 | | |
| PB-PROG-05 | | |

### DNC

| Test ID | Result | Notes |
|---|---|---|
| PB-DNC-01 | | dnc_id: |
| PB-DNC-02 | | |
| PB-DNC-03 | | |
| PB-DNC-04 | | |
| PB-DNC-05 | | |
| PB-DNC-06 | | |
| PB-DNC-07 | | |
| PB-DNC-08 | | behavior: |

### Delete

| Test ID | Result | Notes |
|---|---|---|
| PB-DEL-01 | | |
| PB-DEL-02 | | |

### UI

| Test ID | Result | Notes |
|---|---|---|
| PB-UI-01 | | screenshot: |
| PB-UI-02 | | |
| PB-UI-03 | | |
| PB-UI-04 | | |
| PB-UI-05 | | screenshot: |
| PB-UI-06 | | |
| PB-UI-07 | | |
| PB-UI-08 | | screenshot: |
| PB-UI-09 | | |
| PB-UI-10 | | |
| PB-UI-11 | | |

### Edge cases

| Test ID | Result | Notes |
|---|---|---|
| PB-EDGE-01 | | |
| PB-EDGE-02 | | |
| PB-EDGE-03 | | |
| PB-EDGE-04 | | |
| PB-EDGE-05 | | |

### Summary

- Total tests: 64
- PASS: ___ / 64
- **P0 candidates:** any unauthorized write from volunteer/viewer; double-claim race in PB-EDGE-05.
- **P1 candidates:** result_code enum rejections in PB-CALL-02; max_attempts not enforced in PB-EDGE-04.
- **P2 candidates:** DNC warning absent in PB-DNC-08.

## Cleanup

- Delete all phone bank sessions created in this phase:
  ```bash
  curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/phone-bank-sessions/$SESSION_A_ID" \
    -H "Authorization: Bearer $TOKEN_MGR_A"
  ```
- Delete all call lists created in this phase:
  ```bash
  curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/call-lists/$CALL_LIST_A_ID" \
    -H "Authorization: Bearer $TOKEN_MGR_A"
  ```
- Delete DNC entry created:
  ```bash
  curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/dnc/$DNC_ENTRY_ID" \
    -H "Authorization: Bearer $TOKEN_MGR_A"
  ```
- Verify via DB:
  ```bash
  psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c \
    "SELECT count(*) FROM call_lists WHERE name LIKE 'PB %' AND deleted_at IS NULL;"
  # expect: 0
  psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c \
    "SELECT count(*) FROM phone_bank_sessions WHERE name LIKE 'PB %' AND deleted_at IS NULL;"
  # expect: 0
  psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c \
    "SELECT count(*) FROM dnc_entries WHERE reason LIKE 'PB %';"
  # expect: 0
  ```
- Call records + interactions are retained (audit trail — do not purge).
