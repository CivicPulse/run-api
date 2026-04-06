# Phase 02: Organization Lifecycle

**Prefix:** `ORG`
**Depends on:** phase-00, phase-01
**Estimated duration:** 30 min
**Agents required:** 1

## Purpose

Exhaustively test organization CRUD, multi-org switching, member management, settings, and deletion (danger zone). This is a user-emphasis phase — organization lifecycle is core to multi-tenant correctness.

## Prerequisites

- Phase 00 complete (Org A + Org B exist with users)
- Active JWT tokens for qa-owner@civpulse.org (Org A) and qa-b-owner@civpulse.org (Org B)
- `$TOKEN_A` and `$TOKEN_B` env vars set

---

## Section 1: Org visibility & identity

### ORG-IDENT-01 | GET /api/v1/me/orgs returns correct orgs for qa-owner

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" https://run.civpulse.org/api/v1/me/orgs | jq .
```

**Expected:** Array containing CivPulse Platform org (`zitadel_org_id: 362268991072305186`). Should NOT contain Org B.

**Pass criteria:** Array includes Org A only (or Org A + any orgs qa-owner legitimately belongs to, but NEVER Org B).

**Failure meaning:** If Org B appears, cross-tenant leak (P0).

---

### ORG-IDENT-02 | GET /api/v1/me/orgs for qa-b-owner

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_B" https://run.civpulse.org/api/v1/me/orgs | jq .
```

**Expected:** Array containing only the Org B org.

**Pass criteria:** Org A does NOT appear.

---

### ORG-IDENT-03 | GET /api/v1/me (current user) identifies correct org

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" https://run.civpulse.org/api/v1/users/me | jq '.id, .email, .org_id'
```

**Expected:** `id: 367278364538437701`, `email: qa-owner@civpulse.org`, `org_id: 362268991072305186`.

**Pass criteria:** All 3 fields match.

---

## Section 2: Browser UI — org dashboard & switcher

### ORG-UI-01 | Dashboard shows only qa-owner's org info

**Steps:**
1. Log in as qa-owner via browser
2. Inspect the landing page `/`

**Expected:**
- Top nav shows org name: "CivPulse Platform"
- Campaign list shows campaigns under that org
- No references to "QA Tenant B"

**Pass criteria:** Only Org A info visible.

**Screenshot:** Save to `results/evidence/phase-02/ORG-UI-01-dashboard-a.png`.

---

### ORG-UI-02 | Dashboard shows only qa-b-owner's org info

**Steps:** Same as ORG-UI-01 but log in as qa-b-owner.

**Expected:** Only "QA Tenant B" info visible.

**Pass criteria:** No references to Org A.

---

### ORG-UI-03 | Org switcher absent for single-org user

**Steps:** Log in as qa-owner (single-org user) and inspect the top nav.

**Expected:** No org-switching dropdown visible (user is in only 1 org).

**Pass criteria:** No multi-org picker shown.

---

## Section 3: Org settings

### ORG-SET-01 | GET org returns correct metadata (qa-owner)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_A" https://run.civpulse.org/api/v1/org | jq .
```

**Expected:** `{id, name: "CivPulse Platform", zitadel_org_id: "362268991072305186", created_at, ...}`.

**Pass criteria:** Response contains Org A's metadata.

---

### ORG-SET-02 | Non-admin cannot update org settings (qa-viewer)

**Steps:**
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X PATCH https://run.civpulse.org/api/v1/org \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d '{"name": "Hacked Name"}'
cat /tmp/body.json
```

**Expected:** HTTP 403.

**Pass criteria:** 403. Org name UNCHANGED.

---

### ORG-SET-03 | Non-admin cannot update org settings (qa-volunteer)

**Steps:** Same as ORG-SET-02 with volunteer token.

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### ORG-SET-04 | Non-admin cannot update org settings (qa-manager)

**Steps:** Same with manager token.

**Expected:** HTTP 403 (manager is NOT an org role).

**Pass criteria:** 403.

---

### ORG-SET-05 | Admin CAN update org settings

**Steps:**
```bash
# Save original name first
ORIG=$(curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" https://run.civpulse.org/api/v1/org | jq -r .name)
echo "Original: $ORIG"

# Try update with admin
curl -fsS -X PATCH https://run.civpulse.org/api/v1/org \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"name": "CivPulse Platform (TEST)"}' | jq .name

# Restore original
curl -fsS -X PATCH https://run.civpulse.org/api/v1/org \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$ORIG\"}" | jq .name
```

**Expected:** First PATCH returns updated name. Second PATCH restores original.

**Pass criteria:** Name changes on first PATCH, restored on second.

**Cleanup:** Verify name is restored by GET /api/v1/org.

---

## Section 4: Org members

### ORG-MEM-01 | List org members (admin-level access)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" https://run.civpulse.org/api/v1/org/members | jq .
```

**Expected:** Array of members, each with `user_id`, `role`, `email`. Should contain at minimum qa-owner (org_owner) and qa-admin (org_admin).

**Pass criteria:** ≥2 members returned with expected roles.

---

### ORG-MEM-02 | List org members (manager gets 403)

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_MGR_A" https://run.civpulse.org/api/v1/org/members
```

**Expected:** HTTP 403.

**Pass criteria:** 403.

---

### ORG-MEM-03 | List org members (volunteer gets 403)

**Steps:** Same with volunteer token.

**Expected:** 403.

**Pass criteria:** 403.

---

### ORG-MEM-04 | List org members (viewer gets 403)

**Steps:** Same with viewer token.

**Expected:** 403.

**Pass criteria:** 403.

---

### ORG-MEM-05 | Add member to campaign via org endpoint (admin+)

**Steps:** Add qa-volunteer as manager to the QA Test Campaign.

```bash
curl -fsS -X POST https://run.civpulse.org/api/v1/org/campaigns/$CAMPAIGN_A/members \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "367278371970744389", "role": "manager"}' | jq .
```

**Expected:** HTTP 201 with member object. OR HTTP 409 if already a member (valid).

**Pass criteria:** 201 or 409. Verify via GET /api/v1/campaigns/{id}/members that role is set.

---

### ORG-MEM-06 | Change member's role (admin promotes viewer→manager)

**Steps:**
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/org/campaigns/$CAMPAIGN_A/members/367278374319554629" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"role": "manager"}' | jq .
```

**Expected:** HTTP 200 with updated member (role=manager).

**Pass criteria:** Role updated. Verify via GET.

**Cleanup:** Restore viewer role:
```bash
curl -fsS -X PATCH "https://run.civpulse.org/api/v1/org/campaigns/$CAMPAIGN_A/members/367278374319554629" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" \
  -H "Content-Type: application/json" \
  -d '{"role": "viewer"}'
```

---

### ORG-MEM-07 | Admin CANNOT remove the last owner

**Steps:** Attempt to delete the only org_owner from the org.

```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/org/members/367278364538437701" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A"
cat /tmp/body.json
```

**Expected:** HTTP 409 or 422 with error indicating can't remove last owner. OR HTTP 200 if endpoint doesn't exist (skip).

**Pass criteria:** Last owner NOT deleted. qa-owner still has org_owner role post-test.

---

### ORG-MEM-08 | Viewer cannot add members

**Steps:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "https://run.civpulse.org/api/v1/org/campaigns/$CAMPAIGN_A/members" \
  -H "Authorization: Bearer $TOKEN_VIEWER_A" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"fake","role":"viewer"}'
```

**Expected:** 403.

**Pass criteria:** 403.

---

### ORG-MEM-09 | Volunteer cannot add members

**Steps:** Same with volunteer token.

**Expected:** 403.

**Pass criteria:** 403.

---

### ORG-MEM-10 | Manager cannot add members (org-scoped op)

**Steps:** Same with manager token.

**Expected:** 403 (manager has no org role).

**Pass criteria:** 403.

---

## Section 5: Org campaigns list

### ORG-CAMP-01 | List campaigns in org (org_admin)

**Steps:**
```bash
curl -fsS -H "Authorization: Bearer $TOKEN_ADMIN_A" https://run.civpulse.org/api/v1/org/campaigns | jq '.items[] | .name'
```

**Expected:** Array includes "QA Test Campaign".

**Pass criteria:** QA Test Campaign listed.

---

### ORG-CAMP-02 | Non-org-member gets 403

**Steps:** Use qa-viewer token (no org_member row for viewer role):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_VIEWER_A" https://run.civpulse.org/api/v1/org/campaigns
```

**Expected:** 403.

**Pass criteria:** 403.

---

### ORG-CAMP-03 | Campaign list across orgs is isolated

**Steps:**
```bash
# Org A owner's org campaigns
curl -fsS -H "Authorization: Bearer $TOKEN_A" https://run.civpulse.org/api/v1/org/campaigns | jq '.items[].id' > /tmp/a-campaigns.txt

# Org B owner's org campaigns  
curl -fsS -H "Authorization: Bearer $TOKEN_B" https://run.civpulse.org/api/v1/org/campaigns | jq '.items[].id' > /tmp/b-campaigns.txt

# Should have zero overlap
comm -12 <(sort /tmp/a-campaigns.txt) <(sort /tmp/b-campaigns.txt)
```

**Expected:** `comm -12` output is EMPTY (zero overlap — no shared campaign IDs).

**Pass criteria:** No shared campaign IDs between Org A and Org B.

**Failure meaning:** Cross-tenant campaign visibility — P0.

---

## Section 6: Org settings UI

### ORG-UI-04 | /org/settings renders for org_owner

**Steps:** Browser — log in as qa-owner, navigate to `/org/settings`.

**Expected:** Page renders with org name field + Danger Zone section + optional org-level settings.

**Pass criteria:** Page loads, no 500/403.

---

### ORG-UI-05 | /org/settings returns 403/redirect for org_admin (owner-only area?)

**Steps:** Browser — log in as qa-admin, navigate to `/org/settings`.

**Expected:** Either page loads with some fields disabled (admin has read access) OR redirects to `/` (client-side guard). Verify behavior is consistent.

**Pass criteria:** No 500. Document actual behavior.

---

### ORG-UI-06 | /org/settings redirects non-org users

**Steps:** Log in as qa-volunteer → navigate to `/org/settings`.

**Expected:** Either redirect to `/` OR server returns 403.

**Pass criteria:** Not allowed to access org settings.

---

### ORG-UI-07 | /org/members renders for org_admin

**Steps:** Browser — log in as qa-admin, navigate to `/org/members`.

**Expected:** Members table renders. qa-admin can see all members.

**Pass criteria:** Page loads, shows members.

---

## Section 7: Danger zone (deletion)

**⚠️ CAUTION: These tests potentially destroy data. Use a throwaway test org, NOT Org A or Org B.**

### ORG-DEL-01 | Create a throwaway org for deletion testing

**Steps:** Create a NEW org "QA Disposable Org" via ZITADEL + DB (same pattern as phase-00 section 3).

**Pass criteria:** Throwaway org exists with 1 test user (owner).

**Record:** `${DISPOSABLE_ORG_ZITADEL_ID}`, `${DISPOSABLE_ORG_DB_ID}`.

---

### ORG-DEL-02 | Non-owner cannot delete org (admin attempt)

**Steps:** Attempt to delete "QA Disposable Org" via an admin (not owner):
```bash
curl -sS -o /tmp/body.json -w "%{http_code}\n" \
  -X DELETE "https://run.civpulse.org/api/v1/org" \
  -H "Authorization: Bearer $TOKEN_DISPOSABLE_ADMIN"
cat /tmp/body.json
```

**Expected:** HTTP 403 (only owner can delete).

**Pass criteria:** 403. Org still exists.

---

### ORG-DEL-03 | Owner can delete org

**Steps:**
```bash
curl -fsS -X DELETE "https://run.civpulse.org/api/v1/org" \
  -H "Authorization: Bearer $TOKEN_DISPOSABLE_OWNER" | jq .
```

**Expected:** HTTP 200 or 204. Org marked deleted or removed.

**Pass criteria:** Subsequent GET /api/v1/org returns 404 or `deleted_at` set.

---

### ORG-DEL-04 | After org deletion, campaigns in it are inaccessible

**Steps:** Try to access the disposable org's campaign:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_DISPOSABLE_OWNER" \
  "https://run.civpulse.org/api/v1/campaigns/$DISPOSABLE_CAMPAIGN_ID"
```

**Expected:** 403 or 404.

**Pass criteria:** Resource no longer accessible.

---

## Results Template

Save filled to `results/phase-02-results.md`.

### Org identity & visibility

| Test ID | Result | Notes |
|---|---|---|
| ORG-IDENT-01 | | |
| ORG-IDENT-02 | | |
| ORG-IDENT-03 | | |
| ORG-UI-01 | | screenshot: |
| ORG-UI-02 | | screenshot: |
| ORG-UI-03 | | |

### Org settings

| Test ID | Result | Notes |
|---|---|---|
| ORG-SET-01 | | |
| ORG-SET-02 | | |
| ORG-SET-03 | | |
| ORG-SET-04 | | |
| ORG-SET-05 | | |

### Org members

| Test ID | Result | Notes |
|---|---|---|
| ORG-MEM-01 | | |
| ORG-MEM-02 | | |
| ORG-MEM-03 | | |
| ORG-MEM-04 | | |
| ORG-MEM-05 | | |
| ORG-MEM-06 | | |
| ORG-MEM-07 | | |
| ORG-MEM-08 | | |
| ORG-MEM-09 | | |
| ORG-MEM-10 | | |

### Org campaigns

| Test ID | Result | Notes |
|---|---|---|
| ORG-CAMP-01 | | |
| ORG-CAMP-02 | | |
| ORG-CAMP-03 | | |

### Org UI

| Test ID | Result | Notes |
|---|---|---|
| ORG-UI-04 | | |
| ORG-UI-05 | | |
| ORG-UI-06 | | |
| ORG-UI-07 | | |

### Danger zone

| Test ID | Result | Notes |
|---|---|---|
| ORG-DEL-01 | | disposable org ID: |
| ORG-DEL-02 | | |
| ORG-DEL-03 | | |
| ORG-DEL-04 | | |

### Summary

- Total tests: 31
- PASS: ___ / 31
- **P0 candidates:** Any FAIL on ORG-IDENT-01, ORG-IDENT-02, ORG-CAMP-03 = cross-tenant leak.

## Cleanup

- Restore any org name changes (done inline in ORG-SET-05).
- Restore qa-viewer's role if changed (done inline in ORG-MEM-06).
- Delete the disposable org if it wasn't deleted by ORG-DEL-03.
