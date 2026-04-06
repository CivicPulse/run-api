# Phase 11: RBAC Matrix (5 roles × every endpoint)

**Prefix:** `RBAC`
**Depends on:** phase-00, phase-04
**Estimated duration:** 40 min
**Agents required:** 1

## Purpose

Prove that the per-campaign role hierarchy is enforced correctly on every API endpoint. For each major endpoint, a caller with a role below the minimum **MUST** receive `403 Forbidden`, and a caller with the minimum role or higher **MUST** be allowed to proceed. An unexpected `2xx` for an underprivileged role is a **P0** authorization bypass; an unexpected `403` for a privileged role is a **P1** over-restriction.

## Threat model

- **Escalation**: a viewer or volunteer sneaks into a write path and mutates campaign data.
- **Lateral creep**: a manager performs admin-only actions (member management, imports).
- **Owner-lock bypass**: an admin deletes or restores a campaign that should be owner-only.
- **Role confusion**: the server reads the wrong campaign's membership (should already be covered in phase-03 isolation; here we use a single campaign and vary the *token*).

## Role hierarchy (canonical, `app/core/security.py:24`)

| Role | Rank | Implied by |
|---|---|---|
| `viewer` | 0 | volunteer, manager, admin, owner |
| `volunteer` | 1 | manager, admin, owner |
| `manager` | 2 | admin, owner |
| `admin` | 3 | owner |
| `owner` | 4 | — |

`require_role(min_role)` resolves per-campaign via `resolve_campaign_role()` (security.py:183-274). Org-level endpoints use `require_org_role(min_org_role)` with `org_admin < org_owner`.

## Prerequisites

- Phase 00 complete (Org A + QA Test Campaign seeded with voters, turfs, walk lists, call lists, surveys, volunteers, shifts).
- Phase 04 complete (campaign `${ORG_A_CAMPAIGN_ID}` has all 5 roles assigned exactly once — one user per role).
- Tokens for all 5 Org A roles:
  - `${TOKEN_OWNER_A}`
  - `${TOKEN_ADMIN_A}`
  - `${TOKEN_MANAGER_A}`
  - `${TOKEN_VOLUNTEER_A}`
  - `${TOKEN_VIEWER_A}`
- `${ORG_A_CAMPAIGN_ID}` = `06d710c8-32ce-44ae-bbab-7fcc72aab248`
- `${ORG_A_VOTER_ID}`, `${ORG_A_TURF_ID}`, `${ORG_A_WALK_LIST_ID}`, `${ORG_A_CALL_LIST_ID}`, `${ORG_A_SURVEY_ID}`, `${ORG_A_VOLUNTEER_ID}`, `${ORG_A_SHIFT_ID}`, `${ORG_A_VOTER_LIST_ID}`, `${ORG_A_VOTER_TAG_ID}`, `${ORG_A_INTERACTION_ID}` all resolved from phase-00 seed output.
- `${ORG_A_DB_ID}` = `227ef98c-bf29-47d2-b6ea-b904507f50de`

## Execution convention

Every test uses a **token loop**:

```bash
declare -A TOKENS=(
  [viewer]="$TOKEN_VIEWER_A"
  [volunteer]="$TOKEN_VOLUNTEER_A"
  [manager]="$TOKEN_MANAGER_A"
  [admin]="$TOKEN_ADMIN_A"
  [owner]="$TOKEN_OWNER_A"
)
for role in viewer volunteer manager admin owner; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" <curl-args-using-${TOKENS[$role]}>)
  echo "$role=$code"
done
```

**Shorthand in tables**: `✓ (NNN)` = success with status `NNN`; `✗ (403)` = expected denial; `—` = not applicable.

**Do not** create mutating state unless the test explicitly allocates new resources. For DELETE cells that must succeed (owner row), recreate the resource between attempts where noted.

---

## Section 1: Campaigns endpoints

`/api/v1/campaigns` — see `app/api/v1/campaigns.py`.

### RBAC-CAMP-01 | GET /campaigns — list (viewer+)

**Endpoint:** `GET /api/v1/campaigns`
**Minimum role:** `viewer` (any org member with ≥viewer on any campaign)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 200 | | |
| `${TOKEN_VOLUNTEER_A}` | 200 | | |
| `${TOKEN_MANAGER_A}` | 200 | | |
| `${TOKEN_ADMIN_A}` | 200 | | |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns?limit=1"
done
```

**Pass criteria:** all 5 roles return 200.

---

### RBAC-CAMP-02 | GET /campaigns/{id} — detail (viewer+)

**Endpoint:** `GET /api/v1/campaigns/{id}`
**Minimum role:** `viewer`

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 200 | | |
| `${TOKEN_VOLUNTEER_A}` | 200 | | |
| `${TOKEN_MANAGER_A}` | 200 | | |
| `${TOKEN_ADMIN_A}` | 200 | | |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}"
done
```

**Pass criteria:** all 5 return 200.

---

### RBAC-CAMP-03 | POST /campaigns — create (any authenticated org member)

**Endpoint:** `POST /api/v1/campaigns`
**Minimum role:** authenticated user with membership in `body.organization_id`'s ZITADEL org; no `require_role` gate (app/api/v1/campaigns.py:30). This is a **non-per-campaign** action.

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 201 | | viewer has org membership |
| `${TOKEN_VOLUNTEER_A}` | 201 | | |
| `${TOKEN_MANAGER_A}` | 201 | | |
| `${TOKEN_ADMIN_A}` | 201 | | |
| `${TOKEN_OWNER_A}` | 201 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; body="{\"name\":\"RBAC-$role-$$\",\"type\":\"local\",\"organization_id\":\"${ORG_A_DB_ID}\"}"
  curl -sS -o /tmp/rbac-camp03-$role.json -w "$role=%{http_code}\n" \
    -X POST -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "$body" "https://run.civpulse.org/api/v1/campaigns"
done
```

**Cleanup:** soft-delete each created campaign with owner token:
```bash
for f in /tmp/rbac-camp03-*.json; do
  id=$(jq -r .id "$f"); [ "$id" = null ] && continue
  curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN_OWNER_A" \
    "https://run.civpulse.org/api/v1/campaigns/$id"
done
```

**Pass criteria:** all 5 return 201. If any return 403, check Org A membership for that ZITADEL user.

**Note:** The creating user auto-becomes owner of the newly-created campaign; this does NOT grant them admin/owner on `${ORG_A_CAMPAIGN_ID}`.

---

### RBAC-CAMP-04 | PATCH /campaigns/{id} — update (admin+)

**Endpoint:** `PATCH /api/v1/campaigns/{id}`
**Minimum role:** `admin` (app/api/v1/campaigns.py:131)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 403 | | |
| `${TOKEN_MANAGER_A}` | 403 | | |
| `${TOKEN_ADMIN_A}` | 200 | | |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X PATCH -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"candidate_name":"RBAC probe"}' \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}"
done
```

**Pass criteria:** viewer/volunteer/manager = 403; admin/owner = 200.

---

### RBAC-CAMP-05 | DELETE /campaigns/{id} — soft-delete (owner-only)

**Endpoint:** `DELETE /api/v1/campaigns/{id}`
**Minimum role:** `owner` (app/api/v1/campaigns.py:182)

**IMPORTANT:** this test creates a throwaway campaign first so we don't tombstone the QA campaign.

```bash
# 1. Create throwaway campaign with owner token
CAMP_TMP=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN_OWNER_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"RBAC-delete-probe\",\"type\":\"local\",\"organization_id\":\"${ORG_A_DB_ID}\"}" \
  "https://run.civpulse.org/api/v1/campaigns" | jq -r .id)
echo "throwaway: $CAMP_TMP"
```

But note: the creator becomes *owner* of `$CAMP_TMP`, not `${ORG_A_CAMPAIGN_ID}`. For this test we need the 4 non-owner Org A users to also be members of `$CAMP_TMP`. Easiest alternative: use `${ORG_A_CAMPAIGN_ID}` and rely on the 403 path (no mutation). Then do the owner success path **last** against a fresh throwaway campaign the owner solely controls.

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | against `${ORG_A_CAMPAIGN_ID}` |
| `${TOKEN_VOLUNTEER_A}` | 403 | | against `${ORG_A_CAMPAIGN_ID}` |
| `${TOKEN_MANAGER_A}` | 403 | | against `${ORG_A_CAMPAIGN_ID}` |
| `${TOKEN_ADMIN_A}` | 403 | | against `${ORG_A_CAMPAIGN_ID}` — admin cannot delete |
| `${TOKEN_OWNER_A}` | 204 | | against `$CAMP_TMP` only |

```bash
for role in viewer volunteer manager admin; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X DELETE -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}"
done
# Owner success path against throwaway:
curl -sS -o /dev/null -w "owner=%{http_code}\n" \
  -X DELETE -H "Authorization: Bearer $TOKEN_OWNER_A" \
  "https://run.civpulse.org/api/v1/campaigns/$CAMP_TMP"
```

**Pass criteria:** viewer/volunteer/manager/admin = 403; owner on throwaway = 204.

**Critical:** admin returning 204 is a **P0** lock bypass.

---

## Section 2: Voters endpoints

`/api/v1/campaigns/{campaign_id}/voters*` — see `app/api/v1/voters.py`.

### RBAC-VTR-01 | GET /voters — list (volunteer+)

**Endpoint:** `GET /api/v1/campaigns/{id}/voters`
**Minimum role:** `volunteer` (voters.py:42)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | viewer is below volunteer |
| `${TOKEN_VOLUNTEER_A}` | 200 | | |
| `${TOKEN_MANAGER_A}` | 200 | | |
| `${TOKEN_ADMIN_A}` | 200 | | |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters?limit=1"
done
```

**Pass criteria:** viewer = 403; others = 200.

**Note:** despite the docstring sometimes saying "viewer+", the code gate is `require_role("volunteer")`. This is the source of truth.

---

### RBAC-VTR-02 | GET /voters/{id} — detail (volunteer+)

**Endpoint:** `GET /api/v1/campaigns/{id}/voters/{voter_id}`
**Minimum role:** `volunteer` (voters.py:142)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 200 | | |
| `${TOKEN_MANAGER_A}` | 200 | | |
| `${TOKEN_ADMIN_A}` | 200 | | |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/${ORG_A_VOTER_ID}"
done
```

**Pass criteria:** viewer = 403; others = 200.

---

### RBAC-VTR-03 | POST /voters — create (manager+)

**Endpoint:** `POST /api/v1/campaigns/{id}/voters`
**Minimum role:** `manager` (voters.py:167)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 403 | | |
| `${TOKEN_MANAGER_A}` | 201 | | |
| `${TOKEN_ADMIN_A}` | 201 | | |
| `${TOKEN_OWNER_A}` | 201 | | |

```bash
created=()
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; body="{\"first_name\":\"RBAC\",\"last_name\":\"$role\",\"birth_date\":\"1990-01-01\"}"
  resp=$(curl -sS -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "$body" "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters")
  code=$(echo "$resp" | tail -1); echo "$role=$code"
  id=$(echo "$resp" | head -n-1 | jq -r .id 2>/dev/null); [ "$id" != null ] && created+=("$id")
done
# Cleanup:
for id in "${created[@]}"; do
  curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN_OWNER_A" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/$id"
done
```

**Pass criteria:** viewer/volunteer = 403; manager/admin/owner = 201.

---

### RBAC-VTR-04 | PATCH /voters/{id} — update (manager+)

**Endpoint:** `PATCH /api/v1/campaigns/{id}/voters/{voter_id}`
**Minimum role:** `manager` (voters.py:189)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 403 | | |
| `${TOKEN_MANAGER_A}` | 200 | | |
| `${TOKEN_ADMIN_A}` | 200 | | |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X PATCH -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"notes":"RBAC probe"}' \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/${ORG_A_VOTER_ID}"
done
```

**Pass criteria:** viewer/volunteer = 403; manager/admin/owner = 200.

---

### RBAC-VTR-05 | DELETE /voters/{id} — soft-delete (manager+)

**Endpoint:** `DELETE /api/v1/campaigns/{id}/voters/{voter_id}`
**Minimum role:** `manager` (voters.py:213)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 403 | | |
| `${TOKEN_MANAGER_A}` | 204 | | on throwaway voter |
| `${TOKEN_ADMIN_A}` | 204 | | on throwaway voter |
| `${TOKEN_OWNER_A}` | 204 | | on throwaway voter |

```bash
# Create 3 throwaway voters for the 3 success paths
for tgt in manager admin owner; do
  id=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN_OWNER_A" \
    -H "Content-Type: application/json" \
    -d "{\"first_name\":\"RBAC-del-$tgt\",\"last_name\":\"x\",\"birth_date\":\"1990-01-01\"}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters" | jq -r .id)
  eval "VID_$tgt=$id"
done
# Deny paths:
for role in viewer volunteer; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X DELETE -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/${ORG_A_VOTER_ID}"
done
# Success paths:
for role in manager admin owner; do
  tok="TOKEN_${role^^}_A"; vid="VID_$role"
  curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X DELETE -H "Authorization: Bearer ${!tok}" \
    "https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/${!vid}"
done
```

**Pass criteria:** viewer/volunteer = 403; manager/admin/owner = 204.

---

## Section 3: Voter sub-resources

### RBAC-VTR-06 | Voter contacts — GET list (volunteer+), write (manager+)

**Endpoints:**
- `GET /api/v1/campaigns/{id}/voters/{voter_id}/phones` — volunteer+
- `POST /api/v1/campaigns/{id}/voters/{voter_id}/phones` — manager+
- same pattern for `/emails` and `/addresses`

(voter_contacts.py:41 is the only volunteer+ gate — the list endpoint; all writes are manager+.)

| Token | GET phones | POST phones | GET emails | POST emails | GET addrs | POST addrs |
|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 200 | 403 | 200 | 403 | 200 | 403 |
| `${TOKEN_MANAGER_A}` | 200 | 201 | 200 | 201 | 200 | 201 |
| `${TOKEN_ADMIN_A}` | 200 | 201 | 200 | 201 | 200 | 201 |
| `${TOKEN_OWNER_A}` | 200 | 201 | 200 | 201 | 200 | 201 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/${ORG_A_VOTER_ID}"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"
  echo "--- $role"
  for path in phones emails addresses; do
    curl -sS -o /dev/null -w "  GET $path=%{http_code}\n" \
      -H "Authorization: Bearer ${!tok}" "$BASE/$path"
  done
  curl -sS -o /dev/null -w "  POST phones=%{http_code}\n" \
    -X POST -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"number":"+14045551234","type":"mobile"}' "$BASE/phones"
  curl -sS -o /dev/null -w "  POST emails=%{http_code}\n" \
    -X POST -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"address":"rbac@example.com","type":"personal"}' "$BASE/emails"
  curl -sS -o /dev/null -w "  POST addresses=%{http_code}\n" \
    -X POST -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"street":"1 RBAC St","city":"Macon","state":"GA","postal_code":"31201"}' "$BASE/addresses"
done
```

**Pass criteria:** table above. Cleanup created contacts after the run.

---

### RBAC-VTR-07 | Voter tags — list/assignments (volunteer+), CRUD tag (manager+)

**Endpoints:**
- `POST /campaigns/{id}/voter-tags` — manager+ (voter_tags.py:78)
- `GET /campaigns/{id}/voter-tags` — volunteer+ (voter_tags.py:56)
- `PATCH /campaigns/{id}/voter-tags/{tag_id}` — manager+ (voter_tags.py:104)
- `DELETE /campaigns/{id}/voter-tags/{tag_id}` — volunteer+ (voter_tags.py:131) **← confirm this matches current code**
- `POST /campaigns/{id}/voters/{voter_id}/voter-tags` — volunteer+ (assign) (voter_tags.py:158)
- `DELETE /campaigns/{id}/voters/{voter_id}/voter-tags/{tag_id}` — volunteer+ (unassign) (voter_tags.py:184)

| Token | POST tag | GET tags | PATCH tag | Assign tag | Unassign tag |
|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 403 | 201 | 204 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 201 | 204 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 201 | 204 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 201 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"
  echo "--- $role"
  curl -sS -o /dev/null -w "  POST tag=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"name\":\"rbac-$role-$$\",\"color\":\"#888\"}" "$BASE/voter-tags"
  curl -sS -o /dev/null -w "  GET tags=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "$BASE/voter-tags"
  curl -sS -o /dev/null -w "  PATCH tag=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"color":"#999"}' "$BASE/voter-tags/${ORG_A_VOTER_TAG_ID}"
  curl -sS -o /dev/null -w "  Assign=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"tag_id\":\"${ORG_A_VOTER_TAG_ID}\"}" \
    "$BASE/voters/${ORG_A_VOTER_ID}/voter-tags"
  curl -sS -o /dev/null -w "  Unassign=%{http_code}\n" -X DELETE \
    -H "Authorization: Bearer ${!tok}" \
    "$BASE/voters/${ORG_A_VOTER_ID}/voter-tags/${ORG_A_VOTER_TAG_ID}"
done
```

**Pass criteria:** matches table above.

---

### RBAC-VTR-08 | Voter lists — read (volunteer+), write (manager+)

**Endpoints:**
- `POST /campaigns/{id}/voter-lists` — manager+
- `GET /campaigns/{id}/voter-lists` — volunteer+
- `GET /campaigns/{id}/voter-lists/{list_id}` — volunteer+
- `PATCH /campaigns/{id}/voter-lists/{list_id}` — manager+
- `DELETE /campaigns/{id}/voter-lists/{list_id}` — manager+
- `GET /campaigns/{id}/voter-lists/{list_id}/members` — volunteer+
- `POST /campaigns/{id}/voter-lists/{list_id}/members` — manager+
- `DELETE /campaigns/{id}/voter-lists/{list_id}/members/{voter_id}` — manager+

| Token | POST list | GET list | PATCH list | Add member | Remove member |
|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 403 | 403 | 403 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 201 | 204 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 201 | 204 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 201 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voter-lists"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  POST=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"name\":\"rbac-list-$role-$$\"}" "$BASE"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"description":"probe"}' "$BASE/${ORG_A_VOTER_LIST_ID}"
  curl -sS -o /dev/null -w "  ADDMEM=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"voter_id\":\"${ORG_A_VOTER_ID}\"}" "$BASE/${ORG_A_VOTER_LIST_ID}/members"
  curl -sS -o /dev/null -w "  DELMEM=%{http_code}\n" -X DELETE \
    -H "Authorization: Bearer ${!tok}" \
    "$BASE/${ORG_A_VOTER_LIST_ID}/members/${ORG_A_VOTER_ID}"
done
```

**Pass criteria:** table above.

---

### RBAC-VTR-09 | Voter interactions — create (volunteer+), read (volunteer+)

**Endpoints (voter_interactions.py):**
- `GET /campaigns/{id}/voters/{voter_id}/interactions` — volunteer+ (45)
- `POST /campaigns/{id}/voters/{voter_id}/interactions` — volunteer+ (119)
- `PATCH /campaigns/{id}/voters/{voter_id}/interactions/{id}` — volunteer+ (172)
- `DELETE /campaigns/{id}/voters/{voter_id}/interactions/{id}` — volunteer+ (219)

| Token | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 200 | 201 | 200 | 204 |
| `${TOKEN_MANAGER_A}` | 200 | 201 | 200 | 204 |
| `${TOKEN_ADMIN_A}` | 200 | 201 | 200 | 204 |
| `${TOKEN_OWNER_A}` | 200 | 201 | 200 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/voters/${ORG_A_VOTER_ID}/interactions"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "$BASE"
  id=$(curl -sS -X POST -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"interaction_type":"note","notes":"rbac"}' "$BASE" | jq -r .id 2>/dev/null)
  echo "  POST id=$id"
  [ "$id" != null ] && curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"notes":"updated"}' "$BASE/$id"
  [ "$id" != null ] && curl -sS -o /dev/null -w "  DELETE=%{http_code}\n" -X DELETE \
    -H "Authorization: Bearer ${!tok}" "$BASE/$id"
done
```

**Pass criteria:** viewer = 403 everywhere; volunteer+ all success.

---

## Section 4: Canvassing (turfs, walk lists)

### RBAC-CANV-01 | Turfs — list/get (volunteer+), write (manager+)

**Endpoints (turfs.py):**
- `POST /campaigns/{id}/turfs` — manager+ (58)
- `GET /campaigns/{id}/turfs` — volunteer+ (90)
- `GET /campaigns/{id}/turfs/{turf_id}` — manager+ (122) **← confirm**
- `GET /campaigns/{id}/turfs/{turf_id}/voters` — volunteer+ (170)
- `GET /campaigns/{id}/turfs/{turf_id}/stats` — volunteer+ (218)
- `PATCH /campaigns/{id}/turfs/{turf_id}` — manager+ (247)
- `DELETE /campaigns/{id}/turfs/{turf_id}` — manager+ (285)

| Token | POST | GET list | GET detail | GET voters | GET stats | PATCH | DELETE |
|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 403 | 200 | 200 | 403 | 403 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 204 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 204 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/turfs"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GETlist=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  GETdetail=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_TURF_ID}"
  curl -sS -o /dev/null -w "  GETvoters=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_TURF_ID}/voters"
  curl -sS -o /dev/null -w "  GETstats=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_TURF_ID}/stats"
  curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"description":"probe"}' "$BASE/${ORG_A_TURF_ID}"
done
# DELETE path requires throwaway turf per success-role (skip owner success mutation if risk-averse)
```

**Pass criteria:** matches table.

---

### RBAC-CANV-02 | Walk lists — read (volunteer+), write (manager+)

**Endpoints (walk_lists.py):**
- `POST /campaigns/{id}/walk-lists` — manager+ (48)
- `GET /campaigns/{id}/walk-lists` — volunteer+ (82)
- `GET /campaigns/{id}/walk-lists/{id}` — volunteer+ (108)
- `PATCH /campaigns/{id}/walk-lists/{id}` — manager+ (137)
- `GET /campaigns/{id}/walk-lists/{id}/entries` — volunteer+ (179)
- `GET /campaigns/{id}/walk-lists/{id}/stats` — volunteer+ (205)
- `PATCH /campaigns/{id}/walk-lists/{id}/entries/{entry_id}` — volunteer+ (230)
- `POST /campaigns/{id}/walk-lists/{id}/canvassers` — manager+ (263)
- `DELETE /campaigns/{id}/walk-lists/{id}/canvassers/{user_id}` — manager+ (292)
- `GET /campaigns/{id}/walk-lists/{id}/canvassers` — volunteer+ (313)
- `GET /campaigns/{id}/walk-lists/{id}/unassigned-canvassers` — volunteer+ (343)
- `DELETE /campaigns/{id}/walk-lists/{id}` — manager+ (375)

| Token | POST | GET list | GET detail | PATCH | GET entries | PATCH entry | Assign canvasser | Get canvassers | DELETE |
|---|---|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 200 | 403 | 200 | 200 | 403 | 200 | 403 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 201 | 200 | 204 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 201 | 200 | 204 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 201 | 200 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/walk-lists"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GETlist=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  GETdetail=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_WALK_LIST_ID}"
  curl -sS -o /dev/null -w "  GETentries=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_WALK_LIST_ID}/entries"
  curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"description":"probe"}' "$BASE/${ORG_A_WALK_LIST_ID}"
  curl -sS -o /dev/null -w "  GETcanvass=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_WALK_LIST_ID}/canvassers"
done
```

**Pass criteria:** matches table. Note `PATCH entry` is volunteer+ deliberately (field ops).

---

## Section 5: Phone banking (call lists, sessions, DNC)

### RBAC-PB-01 | Call lists — read (volunteer+), write (manager+)

**Endpoints (call_lists.py):**
- `POST /campaigns/{id}/call-lists` — manager+ (42)
- `GET /campaigns/{id}/call-lists` — volunteer+ (73)
- `GET /campaigns/{id}/call-lists/{id}` — volunteer+ (97)
- `PATCH /campaigns/{id}/call-lists/{id}` — manager+ (127)
- `GET /campaigns/{id}/call-lists/{id}/entries` — volunteer+ (160)
- `DELETE /campaigns/{id}/call-lists/{id}` — manager+ (218)
- `GET /campaigns/{id}/call-lists/{id}/stats` — volunteer+ (249)
- `POST /campaigns/{id}/call-lists/{id}/entries/reorder` — manager+ (318)

| Token | POST | GET list | GET detail | PATCH | GET entries | GET stats | DELETE |
|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 200 | 403 | 200 | 200 | 403 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 204 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 204 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 200 | 200 | 200 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/call-lists"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GETlist=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  GETdetail=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_CALL_LIST_ID}"
  curl -sS -o /dev/null -w "  GETentries=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_CALL_LIST_ID}/entries"
  curl -sS -o /dev/null -w "  GETstats=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_CALL_LIST_ID}/stats"
  curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"description":"probe"}' "$BASE/${ORG_A_CALL_LIST_ID}"
done
```

---

### RBAC-PB-02 | Phone bank sessions — mixed (manager+ create/delete, volunteer+ claim/dispose)

**Endpoints (phone_banks.py):**
- `POST /campaigns/{id}/phone-banks` — manager+ (52)
- `GET /campaigns/{id}/phone-banks` — volunteer+ (76)
- `GET /campaigns/{id}/phone-banks/{id}` — volunteer+ (140)
- `PATCH /campaigns/{id}/phone-banks/{id}` — manager+ (176)
- `DELETE /campaigns/{id}/phone-banks/{id}` — manager+ (206)
- `POST /campaigns/{id}/phone-banks/{id}/canvassers` — manager+ (251)
- `DELETE /campaigns/{id}/phone-banks/{id}/canvassers/{user_id}` — manager+ (282)
- `GET /campaigns/{id}/phone-banks/{id}/canvassers` — volunteer+ (312)
- `POST /campaigns/{id}/phone-banks/{id}/sessions/start` — volunteer+ (364)
- `POST /campaigns/{id}/phone-banks/{id}/sessions/end` — volunteer+ (394)
- `POST /campaigns/{id}/phone-banks/{id}/claim` — volunteer+ (429)
- `GET /campaigns/{id}/phone-banks/{id}/claimed` — volunteer+ (468)
- `POST /campaigns/{id}/phone-banks/{id}/dispose` — volunteer+ (497, 531) — two variants
- `POST /campaigns/{id}/phone-banks/{id}/entries/reorder` — manager+ (541)
- `POST /campaigns/{id}/phone-banks/{id}/sessions/{session_id}/dispose` — volunteer+ (572)

| Token | POST bank | GET banks | PATCH | DELETE | start session | claim | dispose | reorder |
|---|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 403 | 403 | 200/201 | 200/201 | 200/201 | 403 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 204 | 200/201 | 200/201 | 200/201 | 200 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 204 | 200/201 | 200/201 | 200/201 | 200 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 204 | 200/201 | 200/201 | 200/201 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/phone-banks"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  POST=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"name\":\"rbac-$role-$$\",\"call_list_id\":\"${ORG_A_CALL_LIST_ID}\"}" "$BASE"
  curl -sS -o /dev/null -w "  REORDER=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"entry_ids":[]}' "$BASE/${ORG_A_PHONE_BANK_ID}/entries/reorder"
done
```

**Pass criteria:** matches table. Note claim/dispose/start-session endpoints are volunteer+ specifically so field volunteers can run the session without elevated perms.

---

### RBAC-PB-03 | DNC entries — read (volunteer+), write (manager+)

**Endpoints (dnc.py):**
- `GET /campaigns/{id}/dnc` — manager+ (38) **← confirm, docstring may differ**
- `POST /campaigns/{id}/dnc` — manager+ (60)
- `POST /campaigns/{id}/dnc/bulk` — manager+ (85)
- `DELETE /campaigns/{id}/dnc/{id}` — manager+ (141)
- `POST /campaigns/{id}/dnc/check` — volunteer+ (171) — volunteer-safe check endpoint

| Token | GET list | POST one | POST bulk | DELETE | POST check |
|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 403 | 403 | 403 | 200 |
| `${TOKEN_MANAGER_A}` | 200 | 201 | 200 | 204 | 200 |
| `${TOKEN_ADMIN_A}` | 200 | 201 | 200 | 204 | 200 |
| `${TOKEN_OWNER_A}` | 200 | 201 | 200 | 204 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/dnc"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  CHECK=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"phone":"+14045551234"}' "$BASE/check"
done
```

**Pass criteria:** matches table.

---

## Section 6: Surveys

### RBAC-SRV-01 | Survey scripts + questions + responses

**Endpoints (surveys.py):**
- `POST /campaigns/{id}/surveys` — manager+ (49)
- `GET /campaigns/{id}/surveys` — volunteer+ (77)
- `GET /campaigns/{id}/surveys/{survey_id}` — volunteer+ (119)
- `PATCH /campaigns/{id}/surveys/{survey_id}` — manager+ (154)
- `DELETE /campaigns/{id}/surveys/{survey_id}` — manager+ (185)
- `POST /campaigns/{id}/surveys/{survey_id}/questions` — manager+ (223)
- `PATCH /campaigns/{id}/surveys/{survey_id}/questions/{q_id}` — manager+ (256)
- `DELETE /campaigns/{id}/surveys/{survey_id}/questions/{q_id}` — manager+ (292)
- `PUT /campaigns/{id}/surveys/{survey_id}/questions:reorder` — manager+ (327)
- `POST /campaigns/{id}/surveys/{survey_id}/responses` — volunteer+ (368)
- `GET /campaigns/{id}/surveys/{survey_id}/responses` — volunteer+ (403)

| Token | POST survey | GET surveys | PATCH survey | DELETE survey | POST question | POST response | GET responses |
|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 403 | 403 | 403 | 201 | 200 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 204 | 201 | 201 | 200 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 204 | 201 | 201 | 200 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 204 | 201 | 201 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/surveys"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  GETone=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_SURVEY_ID}"
  curl -sS -o /dev/null -w "  GETresp=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_SURVEY_ID}/responses"
  curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"description":"probe"}' "$BASE/${ORG_A_SURVEY_ID}"
done
```

**Pass criteria:** matches table.

---

## Section 7: Volunteers & Shifts

### RBAC-VOL-01 | Volunteers — manager+ for writes, volunteer+ for reads

**Endpoints (volunteers.py):**
- `POST /campaigns/{id}/volunteers` — manager+ (51)
- `POST /campaigns/{id}/volunteers/bulk` — volunteer+ (76) **← confirm (appears unusual)**
- `GET /campaigns/{id}/volunteers` — volunteer+ (118)
- `GET /campaigns/{id}/volunteers/{id}` — volunteer+ (149)
- `PATCH /campaigns/{id}/volunteers/{id}` — manager+ (204)
- `PATCH /campaigns/{id}/volunteers/{id}/availability` — manager+ (235)
- `POST /campaigns/{id}/volunteers/{id}/tags` — volunteer+ (274)
- `DELETE /campaigns/{id}/volunteers/{id}` — volunteer+ (305) **← confirm**
- `GET /campaigns/{id}/volunteer-tags` — volunteer+ (335)
- `POST /campaigns/{id}/volunteer-tags` — manager+ (362)
- `GET /campaigns/{id}/volunteer-tags/{tag_id}` — volunteer+ (383)
- `PATCH /campaigns/{id}/volunteer-tags/{tag_id}` — manager+ (405)
- `DELETE /campaigns/{id}/volunteer-tags/{tag_id}` — manager+ (435)
- `POST /campaigns/{id}/volunteers/{id}/tags/{tag_id}` — manager+ (466)
- `DELETE /campaigns/{id}/volunteers/{id}/tags/{tag_id}` — manager+ (489)
- `GET /campaigns/{id}/volunteers/{id}/shifts` — volunteer+ (523)

| Token | POST vol | GET vols | GET one | PATCH vol | POST vol-tag | PATCH vol-tag | GET vol-tag |
|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 200 | 403 | 403 | 403 | 200 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 200 | 201 | 200 | 200 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 200 | 201 | 200 | 200 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 200 | 201 | 200 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GETvols=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/volunteers"
  curl -sS -o /dev/null -w "  GETone=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/volunteers/${ORG_A_VOLUNTEER_ID}"
  curl -sS -o /dev/null -w "  PATCHvol=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"notes":"probe"}' "$BASE/volunteers/${ORG_A_VOLUNTEER_ID}"
  curl -sS -o /dev/null -w "  GETtags=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/volunteer-tags"
  curl -sS -o /dev/null -w "  POSTtag=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"name\":\"rbac-$role-$$\"}" "$BASE/volunteer-tags"
done
```

**Pass criteria:** matches table.

---

### RBAC-VOL-02 | Shifts — manager+ CRUD, volunteer+ self-signup

**Endpoints (shifts.py):**
- `POST /campaigns/{id}/shifts` — manager+ (78)
- `GET /campaigns/{id}/shifts` — volunteer+ (103)
- `GET /campaigns/{id}/shifts/{id}` — volunteer+ (140)
- `PATCH /campaigns/{id}/shifts/{id}` — manager+ (169)
- `PATCH /campaigns/{id}/shifts/{id}/assignments/{vol_id}` — manager+ (201)
- `DELETE /campaigns/{id}/shifts/{id}` — manager+ (232)
- `POST /campaigns/{id}/shifts/{id}/signup` — volunteer+ (268) — self-signup
- `POST /campaigns/{id}/shifts/{id}/assignments` — manager+ (320) — admin-assign
- `DELETE /campaigns/{id}/shifts/{id}/signup` — volunteer+ (350)
- `DELETE /campaigns/{id}/shifts/{id}/assignments/{vol_id}` — manager+ (394)
- `POST /campaigns/{id}/shifts/{id}/start` — manager+ (432) **← verify**
- `POST /campaigns/{id}/shifts/{id}/end` — manager+ (463) **← verify**
- `PATCH /campaigns/{id}/shifts/{id}/status` — manager+ (499)
- `GET /campaigns/{id}/shifts/{id}/assignments` — volunteer+ (538)

| Token | POST | GET list | GET one | PATCH | DELETE | signup | unsignup | admin-assign |
|---|---|---|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 200 | 403 | 403 | 201 | 204 | 403 |
| `${TOKEN_MANAGER_A}` | 201 | 200 | 200 | 200 | 204 | 201 | 204 | 201 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 200 | 200 | 204 | 201 | 204 | 201 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 200 | 200 | 204 | 201 | 204 | 201 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/shifts"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  GETone=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE/${ORG_A_SHIFT_ID}"
  curl -sS -o /dev/null -w "  PATCH=%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"notes":"probe"}' "$BASE/${ORG_A_SHIFT_ID}"
done
```

**Pass criteria:** matches table.

---

## Section 8: Dashboard

### RBAC-DASH-01 | Overview + all drill-downs (manager+)

**Endpoints (dashboard.py):** All routes except one are `require_role("manager")`. The single volunteer+ endpoint is at line 114 (personal/field summary — verify path in code).

Dashboard paths (prefix `/api/v1/campaigns/{id}/dashboard`):
- `GET /overview` — manager+ (74)
- `GET /me` or similar — volunteer+ (114)
- `GET /canvassing/summary`, `/canvassing/turfs`, `/canvassing/walk-lists` — manager+
- `GET /phone-banking/summary`, `/phone-banking/call-lists`, `/phone-banking/sessions` — manager+
- `GET /volunteers/summary`, `/volunteers/top`, `/volunteers/hours` — manager+
- `GET /surveys/summary` — manager+
- plus additional drill-downs per dashboard.py:217, 245, 277, 309, 343, 364, 393, 424, 456, 487, 521, 542, 570, 601, 633

| Token | /overview | /me | any /canvassing/* | any /phone-banking/* | any /volunteers/* |
|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 200 | 403 | 403 | 403 |
| `${TOKEN_MANAGER_A}` | 200 | 200 | 200 | 200 | 200 |
| `${TOKEN_ADMIN_A}` | 200 | 200 | 200 | 200 | 200 |
| `${TOKEN_OWNER_A}` | 200 | 200 | 200 | 200 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/dashboard"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  for path in overview canvassing/summary phone-banking/summary volunteers/summary surveys/summary; do
    curl -sS -o /dev/null -w "  $path=%{http_code}\n" \
      -H "Authorization: Bearer ${!tok}" "$BASE/$path"
  done
done
```

**Pass criteria:** viewer = 403 everywhere; volunteer = 403 on manager+ endpoints, 200 on `/me`; manager/admin/owner = 200 everywhere.

---

## Section 9: Org-level endpoints

Org endpoints use `require_org_role(min_org_role)`. The ranks are `org_admin < org_owner`.
**Important:** org roles are resolved from ZITADEL org-level grants, **not** per-campaign roles. The mapping between our 5 per-campaign tokens and org roles must be confirmed in phase-00 results. For this section assume:
- `${TOKEN_OWNER_A}` has `org_owner` in ZITADEL
- `${TOKEN_ADMIN_A}` has `org_admin` in ZITADEL
- `${TOKEN_MANAGER_A}`, `${TOKEN_VOLUNTEER_A}`, `${TOKEN_VIEWER_A}` have no org-level admin/owner grant

### RBAC-ORG-01 | GET /org (org_admin+)

**Endpoint:** `GET /api/v1/org`
**Minimum role:** `org_admin` (org.py:41)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 403 | | |
| `${TOKEN_MANAGER_A}` | 403 | | |
| `${TOKEN_ADMIN_A}` | 200 | | org_admin |
| `${TOKEN_OWNER_A}` | 200 | | org_owner |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "https://run.civpulse.org/api/v1/org"
done
```

---

### RBAC-ORG-02 | PATCH /org (org_owner only)

**Endpoint:** `PATCH /api/v1/org`
**Minimum role:** `org_owner` (org.py:56)

| Token | Expected | Actual | Notes |
|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | | |
| `${TOKEN_VOLUNTEER_A}` | 403 | | |
| `${TOKEN_MANAGER_A}` | 403 | | |
| `${TOKEN_ADMIN_A}` | 403 | | org_admin not enough |
| `${TOKEN_OWNER_A}` | 200 | | |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X PATCH -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"name":"CivPulse Platform"}' "https://run.civpulse.org/api/v1/org"
done
```

**Pass criteria:** only owner = 200.

---

### RBAC-ORG-03 | GET /org/campaigns (org_admin+)

**Endpoint:** `GET /api/v1/org/campaigns`
**Minimum role:** `org_admin` (org.py:79)

| Token | Expected |
|---|---|
| viewer/volunteer/manager | 403 |
| admin/owner | 200 |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "https://run.civpulse.org/api/v1/org/campaigns"
done
```

---

### RBAC-ORG-04 | GET /org/members (org_admin+)

**Endpoint:** `GET /api/v1/org/members`
**Minimum role:** `org_admin` (org.py:106)

| Token | Expected |
|---|---|
| viewer/volunteer/manager | 403 |
| admin/owner | 200 |

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "https://run.civpulse.org/api/v1/org/members"
done
```

---

### RBAC-ORG-05 | POST /org/members (org_admin+)

**Endpoint:** `POST /api/v1/org/members`
**Minimum role:** `org_admin` (org.py:139)

| Token | Expected |
|---|---|
| viewer/volunteer/manager | 403 |
| admin/owner | 201 or 400 |

**Note:** accept `400` (validation error) as a pass if the token was permitted. A `403` for admin/owner is a fail.

```bash
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; curl -sS -o /dev/null -w "$role=%{http_code}\n" \
    -X POST -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d '{"email":"notareal@civpulse.org","role":"member"}' \
    "https://run.civpulse.org/api/v1/org/members"
done
```

**Pass criteria:** viewer/volunteer/manager = 403; admin/owner = 2xx or 4xx (not 403).

---

## Section 10: Imports

### RBAC-IMP-01 | Imports — all admin+

**All endpoints in `imports.py` require `admin` (imports.py:126, 190, 280, 362, 411, 459, 545, 611).**

| Token | POST initiate | POST detect | POST confirm | POST cancel | GET list |
|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_MANAGER_A}` | 403 | 403 | 403 | 403 | 403 |
| `${TOKEN_ADMIN_A}` | 200/201 | 200/201 | 200/201 | 200/204 | 200 |
| `${TOKEN_OWNER_A}` | 200/201 | 200/201 | 200/201 | 200/204 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/imports"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GETlist=%{http_code}\n" \
    -H "Authorization: Bearer ${!tok}" "$BASE"
done
```

**Critical note:** manager getting 2xx on any imports endpoint is a **P0** bypass — the task description mentioned "manager+" but the code gate is `admin+` across all import endpoints. **Source of truth = code.**

**Pass criteria:** viewer/volunteer/manager = 403; admin/owner = 2xx.

---

## Section 11: Campaign members

### RBAC-MEM-01 | Members matrix

**Endpoints (members.py):**
- `GET /campaigns/{id}/members` — viewer+ (37)
- `POST /campaigns/{id}/members` — admin+ (253) — actually this is the "add member by zitadel user ID" path; see members.py
- `PATCH /campaigns/{id}/members/{user_id}` — admin+ (85)
- `DELETE /campaigns/{id}/members/{user_id}` — admin+ (205), **owner-required when removing admin+ targets** (262)

| Token | GET | POST add | PATCH role | DELETE non-admin | DELETE admin |
|---|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 200 | 403 | 403 | 403 | 403 |
| `${TOKEN_VOLUNTEER_A}` | 200 | 403 | 403 | 403 | 403 |
| `${TOKEN_MANAGER_A}` | 200 | 403 | 403 | 403 | 403 |
| `${TOKEN_ADMIN_A}` | 200 | 201 | 200 | 204 | 403 |
| `${TOKEN_OWNER_A}` | 200 | 201 | 200 | 204 | 204 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/members"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
done
```

**Pass criteria:** matches table. The admin→admin escalation (admin removing another admin) must return 403 per members.py:262; only owner can remove an admin+.

**Critical:** if admin can remove another admin or owner, this is a **P0** lock bypass.

---

## Section 12: Invites

### RBAC-INV-01 | Invites matrix

**Endpoints (invites.py):**
- `POST /campaigns/{id}/invites` — admin+ (30)
- `GET /campaigns/{id}/invites` — admin+ (72)
- `DELETE /campaigns/{id}/invites/{invite_id}` — admin+ (102)
- `POST /invites/{code}/accept` — any authenticated user (via get_current_user, 115 — not require_role; join flow)

| Token | POST | GET | DELETE | accept (with valid token from admin) |
|---|---|---|---|---|
| `${TOKEN_VIEWER_A}` | 403 | 403 | 403 | 200 (any auth) |
| `${TOKEN_VOLUNTEER_A}` | 403 | 403 | 403 | 200 |
| `${TOKEN_MANAGER_A}` | 403 | 403 | 403 | 200 |
| `${TOKEN_ADMIN_A}` | 201 | 200 | 204 | 200 |
| `${TOKEN_OWNER_A}` | 201 | 200 | 204 | 200 |

```bash
BASE="https://run.civpulse.org/api/v1/campaigns/${ORG_A_CAMPAIGN_ID}/invites"
for role in viewer volunteer manager admin owner; do
  tok="TOKEN_${role^^}_A"; echo "--- $role"
  curl -sS -o /dev/null -w "  GET=%{http_code}\n" -H "Authorization: Bearer ${!tok}" "$BASE"
  curl -sS -o /dev/null -w "  POST=%{http_code}\n" -X POST \
    -H "Authorization: Bearer ${!tok}" -H "Content-Type: application/json" \
    -d "{\"email\":\"rbac-$role@example.com\",\"role\":\"viewer\"}" "$BASE"
done
```

**Pass criteria:** viewer/volunteer/manager = 403; admin/owner = 2xx. Accept endpoint: any authenticated user presenting a valid invite code should succeed (idempotent per user).

---

## Summary: aggregate pass/fail

Tally each test cell. A cell fails if **actual status != expected category** (2xx vs 4xx). Record one row per test ID in results.

| Section | Tests | Cells | Expected denials | Expected successes |
|---|---|---|---|---|
| 1. Campaigns | 5 | 25 | 9 | 16 |
| 2. Voters | 5 | 25 | 8 | 17 |
| 3. Voter sub-resources | 4 | ~70 | ~25 | ~45 |
| 4. Canvassing | 2 | ~55 | ~20 | ~35 |
| 5. Phone banking | 3 | ~45 | ~18 | ~27 |
| 6. Surveys | 1 | 35 | 11 | 24 |
| 7. Volunteers/shifts | 2 | ~55 | ~20 | ~35 |
| 8. Dashboard | 1 | 25 | 11 | 14 |
| 9. Org-level | 5 | 25 | 15 | 10 |
| 10. Imports | 1 | 25 | 15 | 10 |
| 11. Members | 1 | 25 | 12 | 13 |
| 12. Invites | 1 | 20 | 12 | 8 |
| **Total** | **~31 test IDs** | **~430 cells** | **~176** | **~254** |

---

## Results

Record outcomes per test ID:

| Test ID | Result | Severity (if FAIL) | Notes / evidence |
|---|---|---|---|
| RBAC-CAMP-01 | | | |
| RBAC-CAMP-02 | | | |
| RBAC-CAMP-03 | | | |
| RBAC-CAMP-04 | | | |
| RBAC-CAMP-05 | | | |
| RBAC-VTR-01 | | | |
| RBAC-VTR-02 | | | |
| RBAC-VTR-03 | | | |
| RBAC-VTR-04 | | | |
| RBAC-VTR-05 | | | |
| RBAC-VTR-06 | | | |
| RBAC-VTR-07 | | | |
| RBAC-VTR-08 | | | |
| RBAC-VTR-09 | | | |
| RBAC-CANV-01 | | | |
| RBAC-CANV-02 | | | |
| RBAC-PB-01 | | | |
| RBAC-PB-02 | | | |
| RBAC-PB-03 | | | |
| RBAC-SRV-01 | | | |
| RBAC-VOL-01 | | | |
| RBAC-VOL-02 | | | |
| RBAC-DASH-01 | | | |
| RBAC-ORG-01 | | | |
| RBAC-ORG-02 | | | |
| RBAC-ORG-03 | | | |
| RBAC-ORG-04 | | | |
| RBAC-ORG-05 | | | |
| RBAC-IMP-01 | | | |
| RBAC-MEM-01 | | | |
| RBAC-INV-01 | | | |

**Severity guide:**
- **P0**: underprivileged role got `2xx` on a write endpoint (authorization bypass) — blocks launch.
- **P0**: admin-only or owner-only action succeeded with insufficient role — blocks launch.
- **P1**: privileged role got `403` where it should succeed — blocks launch until workaround.
- **P2**: inconsistent status code (e.g., `401` vs `403`) but denial is still enforced.
- **P3**: response body shape issue; access control still correct.

Save results to `docs/production-shakedown/results/phase-11-results.md` with evidence in `results/evidence/phase-11/`.
