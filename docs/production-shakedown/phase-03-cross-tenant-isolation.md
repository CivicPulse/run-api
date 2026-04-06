# Phase 03: Cross-Tenant Isolation (Negative Tests)

**Prefix:** `ISO`
**Depends on:** phase-00, phase-02
**Estimated duration:** 60 min
**Agents required:** 1 (serial by design — state verification is critical)

## Purpose

**This is the most security-critical phase.** Prove that a user in Org A **CANNOT** access any data belonging to Org B (and vice versa), through any attack vector. Every test in this phase is a **negative test** — the expected outcome is denial (403/404), and a success/leak is a P0 bug.

## Threat model

For each test, imagine: "I am qa-owner (Org A). I know Org B's UUIDs (`${ORG_B_CAMPAIGN_ID}`, etc.). Can I read or modify Org B's data?"

Attack classes covered:
- **A. Direct UUID access** — plug Org B's UUID into URL paths
- **B. Body parameter injection** — specify Org B's UUID in request bodies
- **C. Query parameter manipulation** — sneak Org B's ID through query params
- **D. Transitive access** — reach Org B's data via join tables
- **E. Search smuggling** — cause search to return cross-tenant results
- **F. Bulk operation smuggling** — mix Org B IDs into batch requests
- **G. Relationship endpoints** — create links between Org A and Org B resources
- **H. Archive/delete bypass** — access soft-deleted or archived cross-tenant data
- **I. Timing/enumeration** — probe for existence of Org B resources via response differences
- **J. RLS bypass** — directly hit the DB or force an unauthenticated code path

## Prerequisites

- Phase 00 complete: Org A + Org B both exist with distinct campaigns, voters, turfs, walk_lists, call_lists, surveys, volunteers
- Tokens for qa-owner (Org A) and qa-b-owner (Org B)
- `${ORG_A_CAMPAIGN_ID}` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`
- `${ORG_B_CAMPAIGN_ID}` = captured in phase-00 ENV-PROV-04
- Example voter/turf/etc. UUIDs from both orgs recorded in phase-00 results

---

## Class A: Direct UUID path-parameter substitution

For each Org A resource, substitute Org B's equivalent UUID in the URL path and attempt access with Org A's token.

### ISO-XTENANT-A01 | qa-owner (A) cannot GET Org B's campaign

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID"
cat /tmp/body.json
```

**Expected:** HTTP 403 or 404 (not 200).

**Pass criteria:** Non-2xx status. No Org B data returned.

**Failure meaning:** P0 cross-tenant leak.

---

### ISO-XTENANT-A02 | qa-owner (A) cannot LIST voters in Org B's campaign

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/voters"
```

**Expected:** HTTP 403 or 404.

**Pass criteria:** Non-2xx. No voters returned.

---

### ISO-XTENANT-A03 | qa-owner (A) cannot GET a specific voter in Org B

**Steps:**
```bash
# Use an Org B voter UUID from phase-00 seed
ORG_B_VOTER_ID="<paste>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/voters/$ORG_B_VOTER_ID"
```

**Expected:** HTTP 403 or 404.

**Pass criteria:** Non-2xx. No voter data returned.

---

### ISO-XTENANT-A04 | qa-owner (A) cannot CREATE a voter in Org B's campaign

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/voters" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Cross","last_name":"Tenant","birth_date":"1990-01-01"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403. No voter created. Verify via:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "SELECT count(*) FROM voters WHERE first_name='Cross' AND last_name='Tenant';"
# expect: 0
```

---

### ISO-XTENANT-A05 | qa-owner (A) cannot UPDATE Org B's voter

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/voters/$ORG_B_VOTER_ID" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"HACKED"}'
```

**Expected:** HTTP 403 or 404.

**Pass criteria:** Non-2xx. Verify via DB that voter's name unchanged.

---

### ISO-XTENANT-A06 | qa-owner (A) cannot DELETE Org B's voter

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/voters/$ORG_B_VOTER_ID" \
  -H "Authorization: Bearer $TOKEN_A"
```

**Expected:** HTTP 403 or 404.

**Pass criteria:** Non-2xx. Verify voter still exists.

---

### ISO-XTENANT-A07 | Probe ALL campaign-scoped GET endpoints for Org B

Execute this loop with `$TOKEN_A` but Org B's campaign_id.

**Steps:**
```bash
ENDPOINTS=(
  /voters
  /voter-tags
  /voter-lists
  /voter-contacts
  /turfs
  /walk-lists
  /call-lists
  /phone-banks
  /surveys
  /volunteers
  /shifts
  /members
  /invites
  /dnc
  /imports
  /dashboard/overview
)
for e in "${ENDPOINTS[@]}"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN_A" \
    "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID$e")
  echo "$e -> $code"
done
```

**Expected:** Every endpoint returns 403 or 404. NONE return 200.

**Pass criteria:** 0/16 endpoints return 200.

**Failure meaning:** Any 200 = critical cross-tenant data leak on that endpoint (P0).

---

### ISO-XTENANT-A08 | All HTTP methods on Org B's campaign route rejected

**Steps:**
```bash
for method in GET POST PATCH DELETE PUT; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X $method \
    -H "Authorization: Bearer $TOKEN_A" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID")
  echo "$method -> $code"
done
```

**Expected:** No 200/201/204. All rejected.

**Pass criteria:** 0/5 methods succeed.

---

### ISO-XTENANT-A09 | Reverse direction — qa-b-owner (B) cannot access Org A

**Steps:** Mirror ISO-XTENANT-A07 with `$TOKEN_B` + `$ORG_A_CAMPAIGN_ID`.

**Expected:** All endpoints return 403/404.

**Pass criteria:** Same — 0/16 endpoints return 200 for qa-b-owner hitting Org A's campaign.

---

## Class B: Body parameter injection

Try to smuggle Org B's UUID through request bodies, even when the path is legitimate for Org A.

### ISO-BODYINJ-B01 | Create campaign with Org B's organization_id

**Steps:** qa-owner (Org A) tries to create a campaign in Org B's organization:
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST https://run.civpulse.org/api/v1/campaigns \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Cross-Tenant Campaign\",
    \"organization_id\": \"$ORG_B_DB_ID\",
    \"type\": \"local\"
  }"
```

**Expected:** HTTP 403 (Campaign service validates organization_id against user.org_ids — `app/services/campaign.py:46-57`).

**Pass criteria:** 403. Verify no new campaign with "Cross-Tenant" name exists.

---

### ISO-BODYINJ-B02 | Create voter list with Org B's voter_id in members

**Steps:**
```bash
# Take an Org B voter UUID
ORG_B_VOTER_ID="<paste>"
# Try to add it to an Org A voter list
LIST_ID="<paste Org A voter list id>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-lists/$LIST_ID/members" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"voter_ids\": [\"$ORG_B_VOTER_ID\"]}"
```

**Expected:** HTTP 404 or 422 (voter doesn't exist in Org A's campaign scope per RLS). OR 200 with 0 members added.

**Pass criteria:** Voter from Org B NOT added to Org A's list. Verify via:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT * FROM voter_list_members WHERE voter_list_id='<LIST_ID>' AND voter_id='$ORG_B_VOTER_ID';
"
# expect: 0 rows
```

---

### ISO-BODYINJ-B03 | Create walk list referencing Org B's turf

**Steps:**
```bash
ORG_B_TURF_ID="<paste Org B turf UUID>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Smuggled Walk List\",
    \"turf_id\": \"$ORG_B_TURF_ID\"
  }"
```

**Expected:** HTTP 404 or 422 (Org B's turf invisible under Org A's campaign RLS).

**Pass criteria:** Walk list NOT created referencing Org B's turf.

---

### ISO-BODYINJ-B04 | Create call list referencing Org B's voter_list_id

**Steps:**
```bash
ORG_B_LIST_ID="<paste Org B voter list UUID>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Smuggled Call List\",
    \"voter_list_id\": \"$ORG_B_LIST_ID\"
  }"
```

**Expected:** HTTP 404 or 422.

**Pass criteria:** Call list NOT created.

---

### ISO-BODYINJ-B05 | Add Org B user as campaign member in Org A

**Steps:**
```bash
# qa-b-viewer's user ID
QA_B_VIEWER_ID="<paste>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/members" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": \"$QA_B_VIEWER_ID\", \"role\": \"manager\"}"
```

**Expected:** Either HTTP 404 (user not in org A) OR success creates the record (org boundary not enforced for users table).

**Pass criteria:** Document behavior. If 200/201, verify qa-b-viewer now has access to Org A data → THAT would be a critical leak.

**Escalate:** If 200 + qa-b-viewer can now GET Org A voters → P0.

---

## Class C: Query parameter manipulation

### ISO-QPARAM-C01 | List campaigns filtered by Org B's organization_id

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns?organization_id=$ORG_B_DB_ID"
```

**Expected:** Either 200 with empty results, OR 403. In NO case should Org B's campaigns appear.

**Pass criteria:** Response does NOT contain `$ORG_B_CAMPAIGN_ID`.

---

### ISO-QPARAM-C02 | Voter search with injected campaign_id query

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters?campaign_id=$ORG_B_CAMPAIGN_ID&search=Test"
```

**Expected:** Results filtered to Org A only (path campaign_id wins; query param ignored OR rejected).

**Pass criteria:** Response contains only `TestA*` voters (Org A), NOT `TestB*` voters (Org B).

---

### ISO-QPARAM-C03 | Pagination cursor forged from Org B

**Steps:** If pagination uses cursor tokens, craft one with Org B IDs. Usually not exploitable because cursors are opaque + server-validated, but worth probing.

**Expected:** Either 400 (invalid cursor) OR results scoped to Org A.

**Pass criteria:** No Org B data returned.

---

## Class D: Transitive access via join tables

RLS on join tables is transitive (e.g., `walk_list_entries.walk_list_id → walk_lists.campaign_id`). Verify transitive isolation holds.

### ISO-TRANS-D01 | Cannot access walk_list_entries via Org B's walk_list_id

**Steps:** Direct SQL test (simulates what an SQL injection would attempt):
```bash
ORG_B_WALK_LIST_ID="<paste>"
# Set Org A's campaign context, try to SELECT from walk_list_entries for Org B's walk_list_id
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
SET LOCAL role civpulse_run_prod;  -- simulate app connection
ALTER TABLE walk_list_entries NO FORCE ROW LEVEL SECURITY;  -- owner bypass should be blocked though
-- Force non-bypass context to test policy directly
-- Actually just check policy enforcement via a fresh role
-- Skip the bypass test; use API instead
ROLLBACK;
SQL

# API test:
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$ORG_B_WALK_LIST_ID/entries"
```

**Expected:** 403 or 404.

**Pass criteria:** No Org B walk_list entries returned.

---

### ISO-TRANS-D02 | call_list_entries isolation

**Steps:**
```bash
ORG_B_CALL_LIST_ID="<paste>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/call-lists/$ORG_B_CALL_LIST_ID/entries"
```

**Expected:** 403 or 404.

**Pass criteria:** No entries returned.

---

### ISO-TRANS-D03 | voter_tag_members isolation via voter_tag

**Steps:**
```bash
ORG_B_TAG_ID="<paste Org B voter tag UUID>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-tags/$ORG_B_TAG_ID/members"
```

**Expected:** 404.

**Pass criteria:** 404.

---

### ISO-TRANS-D04 | shift_volunteers cross-campaign probe

**Steps:**
```bash
ORG_B_SHIFT_ID="<paste or N/A if no shifts created>"
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/shifts/$ORG_B_SHIFT_ID"
```

**Expected:** 404.

**Pass criteria:** 404.

---

### ISO-TRANS-D05 | session_callers cross-campaign probe

**Steps:**
```bash
ORG_B_SESSION_ID="<paste>"
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/phone-banks/$ORG_B_SESSION_ID"
```

**Expected:** 404.

**Pass criteria:** 404.

---

## Class E: Search smuggling

### ISO-SEARCH-E01 | Voter search returns no Org B voters to Org A

**Steps:**
```bash
# Search by last_name that exists in both orgs (TestA/TestB both have surname "Voter")
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters?search=Voter" \
  | jq '.items[] | .first_name'
```

**Expected:** Only `TestA1`..`TestA10` returned. NO `TestB*` names.

**Pass criteria:** 0 `TestB*` results.

---

### ISO-SEARCH-E02 | Voter search in Org B returns no Org A voters

**Steps:** Same with `$TOKEN_B` and `$ORG_B_CAMPAIGN_ID`.

**Expected:** Only `TestB*` voters.

**Pass criteria:** 0 `TestA*` results.

---

### ISO-SEARCH-E03 | Complex voter filter returns no cross-tenant data

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/search" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"parties":["Democrat","Republican","Independent"]}}' \
  | jq '.items[].first_name' | sort -u
```

**Expected:** Only `TestA*` voters.

**Pass criteria:** 0 cross-tenant leakage.

---

## Class F: Bulk operation smuggling

### ISO-BULK-F01 | Bulk voter import referencing Org B campaign

**Steps:** Attempt to POST a voter import job for Org B:
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/imports" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"filename":"smuggled.csv"}'
```

**Expected:** 403.

**Pass criteria:** 403. Verify no import job created in Org B.

---

### ISO-BULK-F02 | Bulk voter tag add — mix Org A + Org B voter IDs

**Steps:**
```bash
# Take 2 Org A voter IDs and 2 Org B voter IDs
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voter-tags/$TAG_A_ID/members" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"voter_ids\": [\"$VOTER_A_1\", \"$VOTER_A_2\", \"$VOTER_B_1\", \"$VOTER_B_2\"]}"
cat /tmp/body.json
```

**Expected:** HTTP 200 with 2 members added (only Org A voters), OR HTTP 422 (rejects mixed batch), OR 404 (rejects whole request).

**Pass criteria:** NO Org B voters tagged under Org A's tag. Verify via DB count.

**Failure meaning:** If Org B voters got tagged under Org A's tag → tenant boundary crossed → P0.

---

### ISO-BULK-F03 | Bulk canvasser assignment — cross-tenant user IDs

**Steps:**
```bash
# Assign a Org B user as canvasser to Org A's walk list
QA_B_VOLUNTEER_ID="<paste>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/walk-lists/$WALK_LIST_A_ID/canvassers" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"user_ids\": [\"$QA_B_VOLUNTEER_ID\"]}"
```

**Expected:** 404 or 422. If 200, document behavior.

**Pass criteria:** qa-b-volunteer is NOT assigned as canvasser in Org A's walk list.

---

## Class G: Relationship endpoints

### ISO-REL-G01 | Cannot link Org A voter to Org B voter list

Same as ISO-BODYINJ-B02 but intentionally detailed.

### ISO-REL-G02 | Cannot assign Org B volunteer to Org A shift

Covered by ISO-BULK-F03.

### ISO-REL-G03 | Cannot create voter_interaction with cross-tenant voter

**Steps:**
```bash
ORG_B_VOTER_ID="<paste>"
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$ORG_B_VOTER_ID/interactions" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"type":"note","content":"test"}'
```

**Expected:** 404.

**Pass criteria:** 404. No interaction recorded.

---

## Class H: Archive / deletion bypass

### ISO-ARCH-H01 | Archived Org B campaign invisible to Org A

**Steps:** First, archive Org B's campaign (as qa-b-owner), then try to access from Org A:
```bash
# Archive (via qa-b-owner)
curl -fsS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID" \
  -H "Authorization: Bearer $TOKEN_B" | jq .

# Now try to access from Org A
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID"
```

**Expected:** Still 403/404 (archived doesn't become public).

**Pass criteria:** 403 or 404.

**Cleanup:** Restore Org B's campaign:
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$ORG_B_CAMPAIGN_ID/restore" \
  -H "Authorization: Bearer $TOKEN_B"
```

---

### ISO-ARCH-H02 | Deleted (soft-deleted) voter invisible cross-tenant

**Steps:** Soft-delete an Org B voter, then try to read from Org A.

**Expected:** 403/404.

**Pass criteria:** No access.

---

## Class I: Enumeration / timing

### ISO-ENUM-I01 | 404 responses don't leak existence of Org B resources

**Steps:** Measure response for a non-existent UUID vs. an Org B UUID:
```bash
# Garbage UUID
time curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/00000000-0000-0000-0000-000000000000"

# Real Org B voter UUID
time curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$ORG_A_CAMPAIGN_ID/voters/$ORG_B_VOTER_ID"
```

**Expected:** Same HTTP status (404 for both). Response timing similar (no significant divergence that would leak existence).

**Pass criteria:** Both return 404. Timing difference < 50ms.

---

### ISO-ENUM-I02 | Error messages don't reveal Org B structure

**Steps:** Analyze error messages from various cross-tenant attempts. Ensure no leakage of:
- Org B's name
- Other users in Org B
- Campaign names in Org B
- DB internals (table names, column names)

**Expected:** Generic messages only.

**Pass criteria:** No Org B identifiers in error response bodies.

---

## Class J: RLS bypass attempts (direct DB / app-level)

### ISO-RLS-J01 | Nil-UUID campaign context returns zero rows

**Steps:**
```bash
# Simulate what happens when app.current_campaign_id isn't set (nil UUID)
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
-- Use a non-bypass role connection
SET ROLE app_user;  -- if available; else skip
SELECT set_config('app.current_campaign_id', '00000000-0000-0000-0000-000000000000', true);
SELECT COUNT(*) FROM voters;
SELECT COUNT(*) FROM campaigns;
SELECT COUNT(*) FROM organizations;
SQL
```

**Expected:** All 3 counts = 0 (RLS filters to empty set with nil UUID).

**Pass criteria:** No cross-tenant data visible with nil context.

---

### ISO-RLS-J02 | Explicit wrong campaign context returns zero rows

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SET ROLE app_user;
SELECT set_config('app.current_campaign_id', 'dead1234-dead-dead-dead-deaddeaddead', true);
SELECT COUNT(*) FROM voters;
SQL
```

**Expected:** 0 voters (no campaign with that UUID).

**Pass criteria:** 0 rows.

---

### ISO-RLS-J03 | Setting Org B's campaign context doesn't help Org A's token

This is the final belt: even if someone manages to set app.current_campaign_id to Org B's UUID, the API middleware validates membership before allowing the request through require_role.

**Steps:** (Conceptual — can't be directly exploited via API without code bug)

**Expected:** require_role() rejects at the API layer before RLS context is even used.

**Pass criteria:** Covered by ISO-XTENANT-A01 through A09.

---

## Results Template

Save filled to `results/phase-03-results.md`.

### Class A — Direct UUID access

| Test ID | Result | Notes |
|---|---|---|
| ISO-XTENANT-A01 | | |
| ISO-XTENANT-A02 | | |
| ISO-XTENANT-A03 | | |
| ISO-XTENANT-A04 | | |
| ISO-XTENANT-A05 | | |
| ISO-XTENANT-A06 | | |
| ISO-XTENANT-A07 | | 16 endpoints, all should 403/404 |
| ISO-XTENANT-A08 | | 5 HTTP methods |
| ISO-XTENANT-A09 | | Reverse direction |

### Class B — Body injection

| Test ID | Result | Notes |
|---|---|---|
| ISO-BODYINJ-B01 | | |
| ISO-BODYINJ-B02 | | |
| ISO-BODYINJ-B03 | | |
| ISO-BODYINJ-B04 | | |
| ISO-BODYINJ-B05 | | |

### Class C — Query params

| Test ID | Result | Notes |
|---|---|---|
| ISO-QPARAM-C01 | | |
| ISO-QPARAM-C02 | | |
| ISO-QPARAM-C03 | | |

### Class D — Transitive

| Test ID | Result | Notes |
|---|---|---|
| ISO-TRANS-D01 | | |
| ISO-TRANS-D02 | | |
| ISO-TRANS-D03 | | |
| ISO-TRANS-D04 | | |
| ISO-TRANS-D05 | | |

### Class E — Search

| Test ID | Result | Notes |
|---|---|---|
| ISO-SEARCH-E01 | | |
| ISO-SEARCH-E02 | | |
| ISO-SEARCH-E03 | | |

### Class F — Bulk

| Test ID | Result | Notes |
|---|---|---|
| ISO-BULK-F01 | | |
| ISO-BULK-F02 | | |
| ISO-BULK-F03 | | |

### Class G — Relationships

| Test ID | Result | Notes |
|---|---|---|
| ISO-REL-G01 | | |
| ISO-REL-G02 | | |
| ISO-REL-G03 | | |

### Class H — Archive bypass

| Test ID | Result | Notes |
|---|---|---|
| ISO-ARCH-H01 | | |
| ISO-ARCH-H02 | | |

### Class I — Enumeration

| Test ID | Result | Notes |
|---|---|---|
| ISO-ENUM-I01 | | |
| ISO-ENUM-I02 | | |

### Class J — RLS bypass

| Test ID | Result | Notes |
|---|---|---|
| ISO-RLS-J01 | | |
| ISO-RLS-J02 | | |
| ISO-RLS-J03 | | conceptual |

### Summary

- Total tests: 36+
- PASS: ___ / 36
- **Any FAIL in Class A–H = P0 launch blocker.**
- Any FAIL in Class I is a hardening issue (P2).

## Cleanup

- Any cross-tenant mutations MUST be rolled back. Phase 16 verifies no leaked rows.
- Archive restore in ISO-ARCH-H01 (done inline).
