# Phase 04: Campaign Lifecycle

**Prefix:** `CAMP`
**Depends on:** phase-00, phase-02
**Estimated duration:** 30 min
**Agents required:** 1

## Purpose

Exhaustively test campaign CRUD, the 3-step creation wizard, role-based access control, status transitions (active ↔ archived ↔ deleted), member management, invite/accept flow, and ownership transfer. Campaigns are the root tenant-scoped resource — every downstream feature (voters, canvassing, phone banking) hangs off them, so correctness here gates everything else.

## Prerequisites

- Phase 00 complete (Org A + Org B exist with users + 1 campaign each)
- Phase 02 complete (org lifecycle verified, membership wiring confirmed)
- Active JWT tokens for all Org A roles exported as env vars:
  - `$TOKEN_A` (qa-owner), `$TOKEN_ADMIN_A`, `$TOKEN_MGR_A`, `$TOKEN_VOL_A`, `$TOKEN_VIEWER_A`
- `$TOKEN_B` (qa-b-owner) token available
- `$CAMPAIGN_A` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`
- `$ORG_A_DB_ID` = `227ef98c-bf29-47d2-b6ea-b904507f50de`
- `$ORG_B_DB_ID` + `$ORG_B_CAMPAIGN_ID` from phase-00 results

### Known API surface

| Endpoint | Role | Notes |
|---|---|---|
| `GET /api/v1/campaigns` | viewer+ | Cursor paginated |
| `POST /api/v1/campaigns` | any authenticated user (becomes owner) | — |
| `GET /api/v1/campaigns/{id}` | viewer+ | — |
| `PATCH /api/v1/campaigns/{id}` | admin+ | — |
| `DELETE /api/v1/campaigns/{id}` | owner | Soft-delete |
| `GET /api/v1/campaigns/{id}/members` | viewer+ | — |
| `PATCH /api/v1/campaigns/{id}/members/{user_id}/role` | admin+ | Owner upgrade blocked |
| `DELETE /api/v1/campaigns/{id}/members/{user_id}` | admin+ | Cannot remove created_by |
| `POST /api/v1/campaigns/{id}/transfer-ownership` | owner | — |
| `POST /api/v1/campaigns/{id}/invites` | admin+ | — |
| `GET /api/v1/campaigns/{id}/invites` | admin+ | — |
| `DELETE /api/v1/campaigns/{id}/invites/{invite_id}` | admin+ | — |
| `POST /api/v1/invites/{token}/accept` | any authenticated user | — |

**Note:** There is no public `/restore` endpoint in production. Restoring an archived/deleted campaign is done by a `PATCH` that sets `status: "active"` (admin+), or via DB by clearing `deleted_at`. Tests below exercise the PATCH path and flag any restore-endpoint discovery as a schema surprise.

---

## Section 1: Campaign CRUD via API

### CAMP-CRUD-01 | List campaigns as viewer (minimum-read role)

**Purpose:** Confirm viewer+ role can list campaigns.

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns?limit=20" | jq '.items | length, .pagination'
```

**Expected:** HTTP 200. Array with ≥1 item (QA Test Campaign), `pagination` object with `next_cursor` (nullable) and `has_more` boolean.

**Pass criteria:** Response includes `$CAMPAIGN_A` id. `items` is array, `pagination` present.

---

### CAMP-CRUD-02 | List campaigns returns cursor pagination shape

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns?limit=1" | jq 'keys, .pagination'
```

**Expected:** Response keys `["items","pagination"]`. `pagination` has `next_cursor` and `has_more` fields.

**Pass criteria:** Both keys present, shape matches `PaginatedResponse[CampaignResponse]`.

---

### CAMP-CRUD-03 | List campaigns respects `limit` query param

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns?limit=1" | jq '.items | length, .pagination.has_more'
```

**Expected:** `items` length ≤ 1. `has_more: true` if Org A owns >1 campaign, else false.

**Pass criteria:** Length respected; boolean matches truth.

---

### CAMP-CRUD-04 | Cursor advances through pages

**Steps:**
```bash
NEXT=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns?limit=1" | jq -r '.pagination.next_cursor')
echo "next_cursor=$NEXT"
# If non-null, fetch next page:
if [ "$NEXT" != "null" ] && [ -n "$NEXT" ]; then
  curl -fsS -H "Authorization: Bearer $TOKEN_A" \
    "https://run.civpulse.org/api/v1/campaigns?limit=1&cursor=$NEXT" | jq '.items[0].id'
fi
```

**Expected:** Second page returns a different campaign id (if `has_more` was true) or empty items.

**Pass criteria:** Pagination traversal works OR correctly reports `has_more:false`.

---

### CAMP-CRUD-05 | GET single campaign returns full schema

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A" | jq .
```

**Expected:** JSON object with keys `id, zitadel_org_id, name, type, jurisdiction_name, status, candidate_name, party_affiliation, election_date, created_by, created_at, updated_at`.

**Pass criteria:** All keys present, `id == $CAMPAIGN_A`, `status == "active"`.

---

### CAMP-CRUD-06 | GET non-existent campaign returns 404

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/00000000-0000-0000-0000-000000000000"
```

**Expected:** HTTP 404 (or 403 — both acceptable, since we must not reveal existence of other orgs' resources).

**Pass criteria:** Non-2xx. Body contains `detail` field.

---

### CAMP-CRUD-07 | Create campaign — federal type

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"CAMP Test Federal\",
    \"type\": \"federal\",
    \"organization_id\": \"$ORG_A_DB_ID\",
    \"candidate_name\": \"Test Candidate\",
    \"party_affiliation\": \"Independent\",
    \"jurisdiction_name\": \"US-GA-02\",
    \"election_date\": \"2026-11-03\"
  }" | tee /tmp/camp-federal.json | jq '.id, .type, .status'
CAMP_FEDERAL=$(jq -r .id /tmp/camp-federal.json)
echo "CAMP_FEDERAL=$CAMP_FEDERAL"
```

**Expected:** HTTP 201. Returned campaign has `type: "federal"`, `status: "active"`.

**Pass criteria:** 201 + type echoed back.

**Record:** `$CAMP_FEDERAL` UUID for later cleanup.

---

### CAMP-CRUD-08 | Create campaign — state type

**Steps:** Same as CRUD-07, but `"type": "state"`, name `"CAMP Test State"`.

**Expected:** HTTP 201 with `type: "state"`.

**Pass criteria:** Created successfully.

**Record:** `$CAMP_STATE` UUID.

---

### CAMP-CRUD-09 | Create campaign — local type (minimum fields only)

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"CAMP Test Local\",\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\"}" | jq '.id, .type, .candidate_name, .jurisdiction_name'
```

**Expected:** HTTP 201. `candidate_name: null`, `jurisdiction_name: null`.

**Pass criteria:** Optional fields can be omitted. Type echoes `"local"`.

**Record:** `$CAMP_LOCAL` UUID.

---

### CAMP-CRUD-10 | Create campaign — ballot type

**Steps:** Same pattern, `"type": "ballot"`, name `"CAMP Test Ballot"`.

**Expected:** HTTP 201 with `type: "ballot"`.

**Pass criteria:** Enum accepted.

**Record:** `$CAMP_BALLOT` UUID.

---

### CAMP-CRUD-11 | Create rejects invalid `type` enum

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Bogus\",\"type\":\"presidential\",\"organization_id\":\"$ORG_A_DB_ID\"}"
cat /tmp/body.json
```

**Expected:** HTTP 422. Body includes validation detail naming `type`.

**Pass criteria:** 422 + detail mentions invalid enum.

---

### CAMP-CRUD-12 | Create rejects missing required `name`

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\"}"
```

**Expected:** HTTP 422 with validation error on `name`.

**Pass criteria:** 422 + `name` listed as missing.

---

### CAMP-CRUD-13 | Create rejects name shorter than 3 chars

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ab\",\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\"}"
```

**Expected:** HTTP 422.

**Pass criteria:** 422 (min_length=3 enforced per schema).

---

### CAMP-CRUD-14 | Create rejects name longer than 100 chars

**Steps:**
```bash
LONG=$(printf 'A%.0s' {1..101})
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$LONG\",\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\"}"
```

**Expected:** HTTP 422.

**Pass criteria:** 422 (max_length=100 enforced).

---

### CAMP-CRUD-15 | Create rejects malformed election_date

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Bad Date\",\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\",\"election_date\":\"not-a-date\"}"
```

**Expected:** HTTP 422.

**Pass criteria:** 422 with date parse error.

---

### CAMP-CRUD-16 | Create rejects organization_id not owned by user

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Cross Tenant Campaign\",\"type\":\"local\",\"organization_id\":\"$ORG_B_DB_ID\"}"
cat /tmp/body.json
```

**Expected:** HTTP 403. Body: `{"detail": "Selected organization is not available"}`.

**Pass criteria:** 403. No campaign created in Org B.

**Failure meaning:** Cross-tenant org hijack — **P0 security bug**.

---

### CAMP-CRUD-17 | Update campaign (PATCH) as admin

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_LOCAL" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"candidate_name": "Updated Name", "jurisdiction_name": "Macon-Bibb"}' | jq '.candidate_name, .jurisdiction_name'
```

**Expected:** HTTP 200 with echoed fields.

**Pass criteria:** Fields updated.

---

### CAMP-CRUD-18 | PATCH accepts null to clear optional fields

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_LOCAL" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"candidate_name": null}' | jq .candidate_name
```

**Expected:** `candidate_name: null`.

**Pass criteria:** Value cleared.

---

### CAMP-CRUD-19 | Archive campaign via PATCH status=archived

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_BALLOT" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"status": "archived"}' | jq .status
```

**Expected:** `"archived"`.

**Pass criteria:** Status transitions active → archived.

---

### CAMP-CRUD-20 | Restore archived campaign via PATCH status=active

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_BALLOT" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}' | jq .status
```

**Expected:** `"active"`.

**Pass criteria:** archived → active transition works.

---

### CAMP-CRUD-21 | PATCH rejects invalid status value

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_BALLOT" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"status": "zombie"}'
```

**Expected:** HTTP 422.

**Pass criteria:** 422 with enum validation.

---

### CAMP-CRUD-22 | Soft-delete campaign as owner

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMP_STATE" \
  -H "Authorization: Bearer $TOKEN_A"
```

**Expected:** HTTP 204 (No Content).

**Pass criteria:** 204 returned. Verify via DB:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c \
  "SELECT status, deleted_at FROM campaigns WHERE id = '$CAMP_STATE';"
```
Expect `deleted_at` NOT NULL.

---

### CAMP-CRUD-23 | GET deleted campaign returns 404/403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMP_STATE"
```

**Expected:** HTTP 404 (or 403) — soft-deleted campaigns MUST not appear.

**Pass criteria:** Non-2xx.

---

### CAMP-CRUD-24 | Deleted campaign absent from list results

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns?limit=100" | jq -r '.items[].id' | grep -c "$CAMP_STATE" || echo "0 (expected)"
```

**Expected:** grep count = 0.

**Pass criteria:** Deleted campaign NOT in list.

---

### CAMP-CRUD-25 | Restore soft-deleted campaign via PATCH (DB path)

**Purpose:** Confirm whether an authenticated PATCH can un-delete, or whether deletion is terminal.

**Steps:**
```bash
# First try API PATCH to active
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_STATE" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
cat /tmp/body.json
```

**Expected:** HTTP 404 (deleted campaigns not accessible via API) — this is correct behaviour.

**Pass criteria:** 404. Document as "restore requires DB intervention".

**Note:** If 200, that's a surprise — record the behaviour.

---

## Section 2: Role-based access control

### CAMP-RBAC-01 | Viewer CANNOT create campaign... wait, no — any user can

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Viewer Made This\",\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\"}"
cat /tmp/body.json
```

**Expected:** HTTP 201 — per `create_campaign` source, any authenticated user in the org can create a campaign and becomes owner.

**Pass criteria:** 201. Document if production enforces stricter rules.

**Cleanup:** If created, delete it:
```bash
VIEWER_MADE=$(jq -r .id /tmp/body.json)
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$VIEWER_MADE" -H "Authorization: Bearer $TOKEN_VIEWER_A"
```

---

### CAMP-RBAC-02 | Volunteer CANNOT update campaign

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A" \
  -H "Authorization: Bearer $TOKEN_VOL_A" \
  -H "Content-Type: application/json" \
  -d '{"candidate_name":"Hacker"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-RBAC-03 | Manager CANNOT update campaign

**Steps:** Same as RBAC-02 with `$TOKEN_MGR_A`.

**Expected:** HTTP 403 (admin+ required).

**Pass criteria:** 403.

---

### CAMP-RBAC-04 | Viewer CANNOT update campaign

**Steps:** Same with `$TOKEN_VIEWER_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-RBAC-05 | Admin CAN update campaign

**Purpose:** Confirmed already in CRUD-17, but restate explicitly here for the RBAC matrix.

**Expected:** HTTP 200.

**Pass criteria:** See CAMP-CRUD-17.

---

### CAMP-RBAC-06 | Admin CANNOT delete campaign (owner-only)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
cat /tmp/body.json
```

**Expected:** HTTP 403.

**Pass criteria:** 403. Campaign still present.

---

### CAMP-RBAC-07 | Manager CANNOT delete campaign

**Steps:** Same as RBAC-06 with `$TOKEN_MGR_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-RBAC-08 | Viewer CANNOT delete campaign

**Steps:** Same with `$TOKEN_VIEWER_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-RBAC-09 | Owner CAN delete campaign

**Purpose:** Confirmed in CRUD-22. Restate for matrix.

**Pass criteria:** See CAMP-CRUD-22.

---

### CAMP-RBAC-10 | Viewer CAN list campaigns, CAN GET single

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns"
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A"
```

**Expected:** Both HTTP 200.

**Pass criteria:** Both 200.

---

## Section 3: Campaign members

### CAMP-MEM-01 | List members as viewer

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members" | jq 'length, .[].role'
```

**Expected:** HTTP 200. Array of 5 members with roles `owner, admin, manager, volunteer, viewer`.

**Pass criteria:** 5 members returned. Each has `user_id`, `display_name`, `email`, `role`.

---

### CAMP-MEM-02 | List members — 403 for unauthenticated

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members"
```

**Expected:** HTTP 401.

**Pass criteria:** 401.

---

### CAMP-MEM-03 | Admin promotes viewer → manager

**Steps:**
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629/role" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"manager"}' | jq '.role, .user_id'
```

**Expected:** HTTP 200 with `role: "manager"`.

**Pass criteria:** Role updated.

**Cleanup:** Restore to viewer:
```bash
curl -fsS -X PATCH \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629/role" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"viewer"}'
```

---

### CAMP-MEM-04 | Admin CANNOT promote to admin (hierarchy enforced)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629/role" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}'
cat /tmp/body.json
```

**Expected:** HTTP 403. Detail: "Admins can only assign manager role and below".

**Pass criteria:** 403. Target user's role unchanged.

---

### CAMP-MEM-05 | Admin CANNOT promote to owner

**Steps:** Same as MEM-04 but `"role":"owner"`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-MEM-06 | Owner CANNOT grant owner role via role PATCH

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629/role" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"owner"}'
cat /tmp/body.json
```

**Expected:** HTTP 400. Detail mentions using `transfer-ownership` instead.

**Pass criteria:** 400 with guidance message.

---

### CAMP-MEM-07 | Manager CANNOT update member roles

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629/role" \
  -H "Authorization: Bearer $TOKEN_MGR_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"viewer"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-MEM-08 | PATCH role for non-member returns 404

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/999999999999999999/role" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"viewer"}'
cat /tmp/body.json
```

**Expected:** HTTP 404.

**Pass criteria:** 404.

---

### CAMP-MEM-09 | DELETE member as admin (non-owner target)

**Steps:** Create a throwaway admin, have it add a volunteer member to a throwaway campaign, then delete. Use `$CAMP_FEDERAL` as the sandbox.

Approach: use the existing `$CAMP_FEDERAL` campaign (created by qa-owner). Add qa-admin as a member if not already, then have qa-admin remove qa-viewer:

```bash
# First verify member list
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL/members" | jq '.[].user_id'
# qa-owner is created_by; qa-admin may or may not be there (campaign created fresh so probably only owner)
# Add qa-viewer directly via DB-free path — via an invite or a direct role update?
# Since there's no POST /members endpoint, invite flow is required. Deferred to MEM-10.
```

**Expected:** Member list shows at minimum `qa-owner` (created_by).

**Pass criteria:** created_by present. If only 1 member, defer deletion test to MEM-11 using `$CAMPAIGN_A`.

---

### CAMP-MEM-10 | Admin CANNOT delete campaign owner (created_by protection)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278364538437701" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
cat /tmp/body.json
```

**Expected:** HTTP 400 with detail "Cannot remove the campaign owner".

**Pass criteria:** 400. qa-owner still a member.

---

### CAMP-MEM-11 | Admin CAN delete a non-owner member

**Steps:** Remove qa-viewer from `$CAMPAIGN_A`:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204. Verify qa-viewer gone from member list:
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members" | jq '[.[].user_id] | index("367278374319554629")'
```
Expect `null`.

**Cleanup:** Re-add qa-viewer. Since there's no POST /members endpoint in the public API, run a manual SQL restore:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
INSERT INTO campaign_members (id, campaign_id, user_id, role, created_at, updated_at)
VALUES (gen_random_uuid(), '$CAMPAIGN_A', '367278374319554629', 'viewer', now(), now())
ON CONFLICT DO NOTHING;"
```

---

### CAMP-MEM-12 | Manager CANNOT delete members

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/367278374319554629" \
  -H "Authorization: Bearer $TOKEN_MGR_A"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-MEM-13 | DELETE member — non-existent user returns 404

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/members/999999999999999999" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
```

**Expected:** HTTP 404.

**Pass criteria:** 404.

---

## Section 4: Invite flow

### CAMP-INV-01 | Admin creates an invite

**Steps:**
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-invited@civpulse.test","role":"volunteer"}' | tee /tmp/invite.json | jq .
INVITE_ID=$(jq -r .id /tmp/invite.json)
INVITE_TOKEN=$(jq -r .token /tmp/invite.json)
echo "INVITE_ID=$INVITE_ID TOKEN=$INVITE_TOKEN"
```

**Expected:** HTTP 201. Body includes `id`, `campaign_id`, `email`, `role: "volunteer"`, `token` (UUID), `expires_at`, `created_at`.

**Pass criteria:** 201. Token returned.

---

### CAMP-INV-02 | Viewer CANNOT create invite

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d '{"email":"nope@civpulse.test","role":"viewer"}'
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-INV-03 | Manager CANNOT create invite

**Steps:** Same as INV-02 with `$TOKEN_MGR_A`.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-INV-04 | List invites (admin+) returns pending invites without token

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites" | jq '.[].token, .[].email'
```

**Expected:** Response is array. Each item has `token: null` (listing hides the token).

**Pass criteria:** Invite from INV-01 listed. `token` is null in list responses.

---

### CAMP-INV-05 | List invites — volunteer gets 403

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VOL_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites"
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### CAMP-INV-06 | Accept invite with authenticated user

**Purpose:** The accept endpoint requires auth; the invited email just provides the seat.

**Steps:**
```bash
# Use qa-viewer's token (different user) to accept the invite
curl -fsS -X POST "https://run.civpulse.org/api/v1/invites/$INVITE_TOKEN/accept" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" | jq .
```

**Expected:** HTTP 200 with `message`, `campaign_id`, `role`.

**Pass criteria:** 200. qa-viewer now has a volunteer-role membership in `$CAMPAIGN_A` (verify via campaign members list).

**Note:** qa-viewer was already a viewer; the accept should either upgrade or be a no-op with 400. Document actual behaviour.

---

### CAMP-INV-07 | Re-accepting a used invite fails

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/invites/$INVITE_TOKEN/accept" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A"
cat /tmp/body.json
```

**Expected:** HTTP 400 with detail about invite already accepted.

**Pass criteria:** 400.

---

### CAMP-INV-08 | Unauthenticated accept returns 401

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/invites/$INVITE_TOKEN/accept"
```

**Expected:** HTTP 401.

**Pass criteria:** 401.

---

### CAMP-INV-09 | Admin revokes pending invite

**Steps:** Create a new invite, then delete it.
```bash
NEW_INV=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"email":"qa-revoke@civpulse.test","role":"viewer"}' | jq -r .id)

curl -sS -o /dev/null -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites/$NEW_INV" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
```

**Expected:** HTTP 204.

**Pass criteria:** 204. Invite no longer appears in list (or has `revoked_at` set).

---

### CAMP-INV-10 | Accept invite with bogus token returns 400

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/invites/00000000-0000-0000-0000-000000000000/accept" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A"
cat /tmp/body.json
```

**Expected:** HTTP 400 with detail about invalid/expired invite.

**Pass criteria:** 400.

---

## Section 5: Ownership transfer

### CAMP-OWN-01 | Admin CANNOT transfer ownership

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL/transfer-ownership" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"new_owner_id":"367278367172460613"}'
```

**Expected:** HTTP 403 (owner role required).

**Pass criteria:** 403.

---

### CAMP-OWN-02 | Owner transfers ownership to admin, then back

**Steps:**
```bash
# Transfer CAMP_FEDERAL from qa-owner (367278364538437701) to qa-admin (367278367172460613).
# qa-admin must be a member already — created fresh, only qa-owner is; skip with SKIP if not a member.
# Best-effort: add qa-admin via invite flow first OR SKIP if cannot seed.

# Check if qa-admin is a member of CAMP_FEDERAL:
IS_MEMBER=$(curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL/members" | jq -r '[.[].user_id] | index("367278367172460613")')
echo "qa-admin member? $IS_MEMBER"

# If not a member, add via invite+accept. Otherwise transfer directly.
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL/transfer-ownership" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"new_owner_id":"367278367172460613"}' | jq .
```

**Expected:** HTTP 200. qa-admin now owner, qa-owner demoted to admin. If qa-admin is not a member: HTTP 400 with detail "Target user is not a campaign member".

**Pass criteria:** Either 200 (transfer works) or 400 with expected error. Document.

**Cleanup:** Transfer back (qa-admin now has owner role, use `$TOKEN_ADMIN_A`):
```bash
curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL/transfer-ownership" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"new_owner_id":"367278364538437701"}'
```

---

### CAMP-OWN-03 | Transfer to non-member returns 400

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/campaigns/$CAMP_FEDERAL/transfer-ownership" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"new_owner_id":"999999999999999999"}'
cat /tmp/body.json
```

**Expected:** HTTP 400 with detail "Target user is not a campaign member".

**Pass criteria:** 400.

---

## Section 6: Creation wizard UI

The production wizard lives at `/campaigns/new` with 3 steps: **Campaign Details → Review → Invite Team**. All browser tests should save screenshots to `results/evidence/phase-04/`.

### CAMP-UI-01 | /campaigns/new renders for admin+ users

**Steps:** Log in as qa-admin via Playwright, navigate to `/campaigns/new`.

**Expected:** Page loads with step indicator showing 3 steps. Step 0 ("Campaign Details") active.

**Pass criteria:** Page renders, no console errors, step indicator present.

**Screenshot:** `CAMP-UI-01-wizard-step-0.png`.

---

### CAMP-UI-02 | Wizard step 1: required fields validate

**Steps:**
1. On `/campaigns/new`, click "Next" without filling fields.
2. Verify validation errors.

**Expected:** Errors shown for `name` and `type` (required).

**Pass criteria:** Next disabled or errors shown; cannot advance.

**Screenshot:** `CAMP-UI-02-validation-errors.png`.

---

### CAMP-UI-03 | Wizard step 1: type enum presented as dropdown/radio with 4 options

**Steps:** Inspect the `type` control on step 1.

**Expected:** Options: Federal, State, Local, Ballot.

**Pass criteria:** All 4 enum values selectable.

---

### CAMP-UI-04 | Wizard step 1 → step 2 (Review) after valid fill

**Steps:**
1. Fill Name = "CAMP UI Test", Type = "local".
2. Optionally fill candidate_name, jurisdiction_name, election_date.
3. Click Next.

**Expected:** Step indicator advances to "Review". Filled values displayed for confirmation.

**Pass criteria:** Step 2 rendered with entered values.

**Screenshot:** `CAMP-UI-04-wizard-step-2.png`.

---

### CAMP-UI-05 | Wizard step 2: Back button returns to step 1 without data loss

**Steps:** Click Back from step 2.

**Expected:** Step 0 rendered with previously entered values intact.

**Pass criteria:** Fields not cleared.

---

### CAMP-UI-06 | Wizard step 2 → step 3 (Invite Team) on confirm

**Steps:** From Review step, click the confirm/create button.

**Expected:** API POST fires; on 201, wizard advances to "Invite Team" step (step 3) with the newly-created campaign id in context.

**Pass criteria:** Step 3 shown, campaign created (verify via API list).

**Screenshot:** `CAMP-UI-06-wizard-step-3.png`.

---

### CAMP-UI-07 | Wizard step 3: invite team form submits

**Steps:** Enter an email `qa-ui-invite@civpulse.test` and role `viewer`, submit.

**Expected:** Invite created (POST /invites fires, returns 201). Success toast or inline confirmation.

**Pass criteria:** Invite appears in campaign's invite list:
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/${UI_CREATED_CAMPAIGN_ID}/invites" | jq '.[].email'
```

---

### CAMP-UI-08 | Wizard step 3: "Finish" lands on campaign dashboard

**Steps:** Click Finish/Done from step 3.

**Expected:** Navigation to `/campaigns/${id}` with the newly created campaign loaded.

**Pass criteria:** URL matches, dashboard renders campaign name.

**Screenshot:** `CAMP-UI-08-campaign-dashboard.png`.

---

### CAMP-UI-09 | Volunteer does not see "New Campaign" CTA

**Steps:** Log in as qa-volunteer, inspect campaigns list page.

**Expected:** No "+ New Campaign" button (or button disabled) per UI role guard. Document actual behaviour.

**Pass criteria:** UI blocks or hides creation CTA from volunteer.

**Screenshot:** `CAMP-UI-09-volunteer-no-cta.png`.

---

### CAMP-UI-10 | Campaign settings page loads per role

**Steps:** For each role, log in and navigate to `/campaigns/$CAMPAIGN_A/settings` (or equivalent settings route).

**Expected:**
- owner, admin: full access including edit controls
- manager, volunteer, viewer: either read-only view or redirect to `/`

**Pass criteria:** No 500 errors. Role-appropriate access enforced.

**Screenshots:** `CAMP-UI-10-{role}-settings.png` for each role tested.

---

## Section 7: Concurrency sanity

### CAMP-CONC-01 | Two admins update the same campaign simultaneously

**Purpose:** Light race test — prove last-write-wins behaviour without deep ordering guarantees.

**Steps:**
```bash
# Fire two PATCH requests in parallel
(curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_LOCAL" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"candidate_name":"Alice"}' > /tmp/a.json 2>&1 &)
(curl -fsS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$CAMP_LOCAL" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"candidate_name":"Bob"}' > /tmp/b.json 2>&1 &)
wait
jq .candidate_name /tmp/a.json /tmp/b.json
curl -fsS -H "Authorization: Bearer $TOKEN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMP_LOCAL" | jq .candidate_name
```

**Expected:** Both requests succeed (HTTP 200). Final value is either "Alice" or "Bob" (last commit wins).

**Pass criteria:** No 500 errors. Final state is one of the two values. No partial/corrupted state.

---

### CAMP-CONC-02 | Concurrent create + delete does not corrupt state

**Steps:** Create a throwaway campaign, then race a PATCH against a DELETE.
```bash
TMP=$(curl -fsS -X POST "https://run.civpulse.org/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"name\":\"CAMP Race\",\"type\":\"local\",\"organization_id\":\"$ORG_A_DB_ID\"}" | jq -r .id)

(curl -sS -X PATCH "https://run.civpulse.org/api/v1/campaigns/$TMP" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"candidate_name":"Race"}' -o /tmp/race-patch.json -w "%{http_code}\n" > /tmp/race-patch-code &)
(curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$TMP" \
  -H "Authorization: Bearer $TOKEN_A" -o /dev/null -w "%{http_code}\n" > /tmp/race-del-code &)
wait
echo "PATCH=$(cat /tmp/race-patch-code)  DELETE=$(cat /tmp/race-del-code)"
```

**Expected:** At least one request returns a 2xx. The losing request returns 404 or 409. No 500.

**Pass criteria:** No 500 errors; final row is either deleted or updated cleanly.

---

## Results Template

Save filled copy to `results/phase-04-results.md`.

### Campaign CRUD

| Test ID | Result | Notes |
|---|---|---|
| CAMP-CRUD-01 | | |
| CAMP-CRUD-02 | | |
| CAMP-CRUD-03 | | |
| CAMP-CRUD-04 | | |
| CAMP-CRUD-05 | | |
| CAMP-CRUD-06 | | |
| CAMP-CRUD-07 | | `$CAMP_FEDERAL` = ___ |
| CAMP-CRUD-08 | | `$CAMP_STATE` = ___ |
| CAMP-CRUD-09 | | `$CAMP_LOCAL` = ___ |
| CAMP-CRUD-10 | | `$CAMP_BALLOT` = ___ |
| CAMP-CRUD-11 | | |
| CAMP-CRUD-12 | | |
| CAMP-CRUD-13 | | |
| CAMP-CRUD-14 | | |
| CAMP-CRUD-15 | | |
| CAMP-CRUD-16 | | P0 candidate |
| CAMP-CRUD-17 | | |
| CAMP-CRUD-18 | | |
| CAMP-CRUD-19 | | |
| CAMP-CRUD-20 | | |
| CAMP-CRUD-21 | | |
| CAMP-CRUD-22 | | |
| CAMP-CRUD-23 | | |
| CAMP-CRUD-24 | | |
| CAMP-CRUD-25 | | |

### RBAC

| Test ID | Result | Notes |
|---|---|---|
| CAMP-RBAC-01 | | |
| CAMP-RBAC-02 | | |
| CAMP-RBAC-03 | | |
| CAMP-RBAC-04 | | |
| CAMP-RBAC-05 | | |
| CAMP-RBAC-06 | | |
| CAMP-RBAC-07 | | |
| CAMP-RBAC-08 | | |
| CAMP-RBAC-09 | | |
| CAMP-RBAC-10 | | |

### Members

| Test ID | Result | Notes |
|---|---|---|
| CAMP-MEM-01 | | |
| CAMP-MEM-02 | | |
| CAMP-MEM-03 | | |
| CAMP-MEM-04 | | |
| CAMP-MEM-05 | | |
| CAMP-MEM-06 | | |
| CAMP-MEM-07 | | |
| CAMP-MEM-08 | | |
| CAMP-MEM-09 | | |
| CAMP-MEM-10 | | |
| CAMP-MEM-11 | | |
| CAMP-MEM-12 | | |
| CAMP-MEM-13 | | |

### Invites

| Test ID | Result | Notes |
|---|---|---|
| CAMP-INV-01 | | invite_id = ___ |
| CAMP-INV-02 | | |
| CAMP-INV-03 | | |
| CAMP-INV-04 | | |
| CAMP-INV-05 | | |
| CAMP-INV-06 | | |
| CAMP-INV-07 | | |
| CAMP-INV-08 | | |
| CAMP-INV-09 | | |
| CAMP-INV-10 | | |

### Ownership transfer

| Test ID | Result | Notes |
|---|---|---|
| CAMP-OWN-01 | | |
| CAMP-OWN-02 | | |
| CAMP-OWN-03 | | |

### UI wizard

| Test ID | Result | Notes |
|---|---|---|
| CAMP-UI-01 | | screenshot: |
| CAMP-UI-02 | | screenshot: |
| CAMP-UI-03 | | |
| CAMP-UI-04 | | screenshot: |
| CAMP-UI-05 | | |
| CAMP-UI-06 | | screenshot: |
| CAMP-UI-07 | | |
| CAMP-UI-08 | | screenshot: |
| CAMP-UI-09 | | screenshot: |
| CAMP-UI-10 | | screenshot: |

### Concurrency

| Test ID | Result | Notes |
|---|---|---|
| CAMP-CONC-01 | | |
| CAMP-CONC-02 | | |

### Summary

- Total tests: 53
- PASS: ___ / 53
- **P0 candidates:** Any FAIL on CAMP-CRUD-16 (cross-tenant org hijack) = immediate escalation.

## Cleanup

Delete throwaway campaigns created during this phase:

```bash
for id in "$CAMP_FEDERAL" "$CAMP_LOCAL" "$CAMP_BALLOT"; do
  curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$id" \
    -H "Authorization: Bearer $TOKEN_A" -o /dev/null -w "DELETE $id -> %{http_code}\n"
done
# $CAMP_STATE already deleted in CAMP-CRUD-22
# UI-created campaign from CAMP-UI-06:
curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/${UI_CREATED_CAMPAIGN_ID}" \
  -H "Authorization: Bearer $TOKEN_A" -o /dev/null -w "%{http_code}\n"
```

Revoke remaining invites:
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites" | jq -r '.[] | select(.accepted_at == null and .revoked_at == null) | .id' \
  | while read inv_id; do
      curl -sS -X DELETE "https://run.civpulse.org/api/v1/campaigns/$CAMPAIGN_A/invites/$inv_id" \
        -H "Authorization: Bearer $TOKEN_ADMIN_A" -o /dev/null -w "revoke $inv_id -> %{http_code}\n"
    done
```

Restore qa-viewer membership (if removed in CAMP-MEM-11) — SQL snippet included in that test.

Restore original ownership of `$CAMP_FEDERAL` if CAMP-OWN-02 transferred it (inline cleanup in that test).
