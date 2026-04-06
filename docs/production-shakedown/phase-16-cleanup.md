# Phase 16: Cleanup & Final Results

**Prefix:** `CLN`
**Depends on:** all prior phases (00-15)
**Estimated duration:** 15 min
**Agents required:** 1 (sequential, writes authoritative teardown state)

## Purpose

1. Tear down the test state created during phases 00-15: campaigns, voters, turfs, walk lists, call lists, surveys, volunteers, tags, lists, DNC entries, invites, import jobs, campaign members.
2. Delete Org B (ZITADEL + DB) and its 5 test users; decide whether to retain Org A's 5 test users.
3. Verify no leftover test strings remain in any tenant-scoped table.
4. Document which short-term workarounds (BYPASSRLS, alembic_version VARCHAR(128)) remain in place and why.
5. Generate `results/SUMMARY.md` — the cross-phase pass/fail roll-up and launch-ready verdict.

This phase is **destructive**. Run it only after every other phase's results are captured and committed.

## Prerequisites

- All phases 00-15 complete; results files written to `results/phase-NN-results.md`.
- Postgres superuser access (`psql -h thor.tailb56d83.ts.net -U postgres`).
- ZITADEL service account credentials available in the `run-api` deployment env.
- `kubectl` context pointing at `civpulse-prod`.
- Org B IDs from `results/phase-00-results.md` (`${ORG_B_ZITADEL_ID}`, `${ORG_B_DB_ID}`, `${ORG_B_CAMPAIGN_ID}`, and the 5 ZITADEL user IDs).

---

## Section 1: Delete Test Campaigns

### CLN-CAMP-01 | Snapshot row counts before deletion

**Purpose:** Capture a before-state for every cascaded table so the verification queries later have a known delta.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SELECT 'campaigns'         AS tbl, count(*) FROM campaigns WHERE id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'voters',           count(*) FROM voters           WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'voter_tags',       count(*) FROM voter_tags       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'voter_lists',      count(*) FROM voter_lists      WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'turfs',            count(*) FROM turfs            WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'walk_lists',       count(*) FROM walk_lists       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'call_lists',       count(*) FROM call_lists       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'surveys',          count(*) FROM surveys          WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'volunteers',       count(*) FROM volunteers       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'shifts',           count(*) FROM shifts           WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'dnc_entries',      count(*) FROM dnc_entries      WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'invites',          count(*) FROM invites          WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'import_jobs',      count(*) FROM import_jobs      WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'campaign_members', count(*) FROM campaign_members WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}');
SQL
```

**Expected:** Non-zero counts for the tables that phases 00-15 populated (voters ≥20, volunteers ≥6, campaign_members ≥10, etc.).

**Record:** Copy the table into `results/phase-16-results.md` under "Pre-cleanup counts".

**Pass criteria:** Query returns without error and snapshot is recorded.

---

### CLN-CAMP-02 | Delete Org A test campaign ("QA Test Campaign")

**Purpose:** Cascade-delete all test data scoped to the Org A QA campaign.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE campaigns NO FORCE ROW LEVEL SECURITY;
DELETE FROM campaigns WHERE id = '06d710c8-32ce-44ae-bbab-7fcc72aab248' RETURNING id, name;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

**Expected:** 1 row returned: `id=06d710c8-32ce-44ae-bbab-7fcc72aab248 name='QA Test Campaign'`.

**Pass criteria:** DELETE returns exactly 1 row.

**If FAIL:** If FK violations surface here, a cascade path is misconfigured. Report as P1 and record the offending table name.

---

### CLN-CAMP-03 | Delete Org B test campaign ("Tenant B Test Campaign")

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE campaigns NO FORCE ROW LEVEL SECURITY;
DELETE FROM campaigns WHERE id = '${ORG_B_CAMPAIGN_ID}' RETURNING id, name;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

**Expected:** 1 row returned: `id=${ORG_B_CAMPAIGN_ID} name='Tenant B Test Campaign'`.

**Pass criteria:** DELETE returns exactly 1 row.

---

### CLN-CAMP-04 | Verify FK-cascaded rows are gone

**Purpose:** Confirm every campaign-scoped table has zero rows for the deleted campaigns.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SELECT 'campaigns'         AS tbl, count(*) FROM campaigns WHERE id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'voters',           count(*) FROM voters           WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'voter_tags',       count(*) FROM voter_tags       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'voter_lists',      count(*) FROM voter_lists      WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'turfs',            count(*) FROM turfs            WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'walk_lists',       count(*) FROM walk_lists       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'call_lists',       count(*) FROM call_lists       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'surveys',          count(*) FROM surveys          WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'volunteers',       count(*) FROM volunteers       WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'shifts',           count(*) FROM shifts           WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'dnc_entries',      count(*) FROM dnc_entries      WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'invites',          count(*) FROM invites          WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'import_jobs',      count(*) FROM import_jobs      WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}')
UNION ALL SELECT 'campaign_members', count(*) FROM campaign_members WHERE campaign_id IN ('06d710c8-32ce-44ae-bbab-7fcc72aab248', '${ORG_B_CAMPAIGN_ID}');
SQL
```

**Expected:** Every row returns `count = 0`.

**Pass criteria:** All 14 counts are zero.

**Failure meaning:** Any non-zero count indicates a missing FK cascade — record the table name and open an issue before continuing.

---

## Section 2: Delete Test Organizations

### CLN-ORG-01 | Keep Org A ("CivPulse Platform") — decision log

**Purpose:** Org A is pre-existing production tenant data and is shared with real users. Do **not** delete it.

**Steps:** No action. Record the decision in the results file.

**Pass criteria:** Org A row is intact:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, name FROM organizations WHERE zitadel_org_id = '362268991072305186';
"
```
Returns exactly 1 row.

---

### CLN-ORG-02 | Delete Org B from DB ("QA Tenant B")

**Purpose:** Remove the tenant we provisioned for cross-tenant isolation testing.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE organizations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_members NO FORCE ROW LEVEL SECURITY;

-- Cascade should handle organization_members; confirm no orphans first
DELETE FROM organization_members WHERE organization_id = '${ORG_B_DB_ID}' RETURNING user_id, role;
DELETE FROM organizations WHERE id = '${ORG_B_DB_ID}' RETURNING id, name, zitadel_org_id;

ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

**Expected:**
- `organization_members`: 2 rows deleted (owner + admin per `_JWT_ROLE_TO_ORG_ROLE`).
- `organizations`: 1 row deleted with `name='QA Tenant B'` and `zitadel_org_id=${ORG_B_ZITADEL_ID}`.

**Pass criteria:** Both DELETEs return expected row counts.

---

### CLN-ORG-03 | Verify no orphaned campaigns reference Org B

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, name, organization_id, zitadel_org_id
FROM campaigns
WHERE organization_id = '${ORG_B_DB_ID}' OR zitadel_org_id = '${ORG_B_ZITADEL_ID}';
"
```

**Expected:** 0 rows.

**Pass criteria:** No orphaned campaigns remain.

---

## Section 3: Delete Test ZITADEL Users

### CLN-USR-01 | Decision — keep or delete Org A test users?

**Purpose:** Org A's 5 test users (`qa-owner@civpulse.org`, etc.) can be retained for future smoke tests, or deleted if a zero-trace cleanup is required.

**Default decision:** **KEEP** Org A users for repeatable regression runs. Document the decision in the results file; if deletion is chosen, mirror the CLN-USR-02 steps substituting Org A user IDs from the README configuration table.

**Pass criteria:** Decision recorded in results. No action required if KEEP.

---

### CLN-USR-02 | Delete 5 Org B test users from ZITADEL

**Steps:**
```bash
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<'PY'
import os, json, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
# Paste the 5 user IDs from results/phase-00-results.md
USER_IDS = [
    '<owner_user_id>',
    '<admin_user_id>',
    '<manager_user_id>',
    '<volunteer_user_id>',
    '<viewer_user_id>',
]
with httpx.Client(timeout=20, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
    results = []
    for uid in USER_IDS:
        r = c.delete(f'{BASE}/v2beta/users/{uid}', headers=H)
        results.append({'user_id': uid, 'status': r.status_code, 'body': r.text[:200]})
    print(json.dumps(results, indent=2))
PY
```

**Expected:** All 5 return HTTP 200 (or 404 if already deleted on a prior run).

**Pass criteria:** 5/5 DELETEs succeed.

---

### CLN-USR-03 | Verify Org B users in USER_STATE_DELETED

**Steps:**
```bash
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<'PY'
import os, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
USER_IDS = ['<owner>', '<admin>', '<manager>', '<volunteer>', '<viewer>']
with httpx.Client(timeout=15, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization': f'Bearer {tok}'}
    for uid in USER_IDS:
        r = c.get(f'{BASE}/v2beta/users/{uid}', headers=H)
        print(f"  {uid}: http={r.status_code} state={r.json().get('user',{}).get('state','(n/a)')}")
PY
```

**Expected:** Each user returns HTTP 404 (hard-deleted) OR `state=USER_STATE_DELETED`.

**Pass criteria:** No user returns `USER_STATE_ACTIVE`.

---

### CLN-USR-04 | Verify no active project role grants remain

**Steps:**
```bash
kubectl -n civpulse-prod exec -i deploy/run-api -c run-api -- python <<'PY'
import os, httpx
BASE = os.environ['ZITADEL_BASE_URL']
HOST = {'Host': os.environ['ZITADEL_ISSUER'].replace('https://','').rstrip('/')}
USER_IDS = ['<owner>', '<admin>', '<manager>', '<volunteer>', '<viewer>']
with httpx.Client(timeout=15, headers=HOST) as c:
    r = c.post(f'{BASE}/oauth/v2/token', data={
        'grant_type':'client_credentials',
        'client_id':os.environ['ZITADEL_SERVICE_CLIENT_ID'],
        'client_secret':os.environ['ZITADEL_SERVICE_CLIENT_SECRET'],
        'scope':'openid urn:zitadel:iam:org:project:id:zitadel:aud'})
    tok = r.json()['access_token']
    H = {**HOST, 'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
    for uid in USER_IDS:
        r = c.post(f'{BASE}/management/v1/users/{uid}/grants/_search', headers=H, json={})
        grants = r.json().get('result') or []
        print(f"  {uid}: grants={len(grants)}")
PY
```

**Expected:** Every user shows `grants=0` (or a 404 on the search endpoint for hard-deleted users).

**Pass criteria:** No user retains active project grants.

---

### CLN-USR-05 | Verify DB `users` rows for Org B are orphaned or cleaned

**Purpose:** `users` rows are created on first login by `ensure_user_synced`. They reference ZITADEL IDs but do not cascade on ZITADEL delete.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT id, email, zitadel_user_id FROM users
WHERE email LIKE 'qa-b-%@civpulse.org';
"
```

**Expected:** 5 rows remain (they are detached from any org/campaign by the prior deletes). Optionally hard-delete them:
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
BEGIN;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
DELETE FROM users WHERE email LIKE 'qa-b-%@civpulse.org' RETURNING id, email;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
COMMIT;
SQL
```

**Expected:** 5 rows deleted.

**Pass criteria:** DB `users` table contains 0 rows matching `qa-b-%@civpulse.org`.

---

## Section 4: Final Credential & Secrets Hygiene

### CLN-SEC-01 | Annotate or archive `.secrets/prod-test-users.md`

**Purpose:** The secrets file contains live passwords for Org A + Org B test users. After cleanup, either annotate it with a cleanup date or move it to an archive.

**Default action (annotation):**
```bash
cat >> .secrets/prod-test-users.md <<NOTE

---
## Cleanup status — $(date -u +%Y-%m-%d)

- Org B users deleted from ZITADEL and DB (phase 16).
- Org B campaign + org deleted from DB (phase 16).
- Org A users retained for future smoke tests (decision: CLN-USR-01 KEEP).
- Do NOT re-use the Org B passwords below; they reference deleted users.
NOTE
```

**Alternative (archive):**
```bash
mkdir -p .secrets/archive
mv .secrets/prod-test-users.md ".secrets/archive/prod-test-users-$(date -u +%Y-%m-%d).md"
```

**Pass criteria:** File is either annotated or moved; git status shows the change.

---

## Section 5: Document Retained Workarounds

### CLN-WA-01 | Confirm BYPASSRLS workaround is still in place

**Purpose:** `civpulse_run_prod` was granted BYPASSRLS on 2026-04-05 as a short-term fix for migration 026 FORCE RLS. This stays until the underlying fix ships.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'civpulse_run_prod';
"
```

**Expected:** `rolbypassrls = t`.

**Pass criteria:** BYPASSRLS remains enabled. Record in results: "KEEP, tracked in CivicPulse/run-api#21".

---

### CLN-WA-02 | Confirm alembic_version VARCHAR(128) workaround is still in place

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'alembic_version' AND column_name = 'version_num';
"
```

**Expected:** `data_type=character varying, character_maximum_length=128`.

**Pass criteria:** Column remains VARCHAR(128). Record in results: "KEEP, tracked in CivicPulse/run-api#19".

---

## Section 6: Final DB Verification

### CLN-VER-01 | Compare row counts against baseline

**Purpose:** Confirm the prod DB is back to (or close to) its pre-phase-00 baseline.

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SELECT 'organizations'  AS tbl, count(*) FROM organizations
UNION ALL SELECT 'campaigns',     count(*) FROM campaigns
UNION ALL SELECT 'users',         count(*) FROM users
UNION ALL SELECT 'voters',        count(*) FROM voters
UNION ALL SELECT 'volunteers',    count(*) FROM volunteers
UNION ALL SELECT 'turfs',         count(*) FROM turfs
UNION ALL SELECT 'walk_lists',    count(*) FROM walk_lists
UNION ALL SELECT 'call_lists',    count(*) FROM call_lists
UNION ALL SELECT 'surveys',       count(*) FROM surveys;
SQL
```

**Expected (approximate):**
- `organizations` = 3 (pre-phase-00 baseline)
- `campaigns` = 17 (baseline — 18 minus the deleted QA Test Campaign)
- `users` = 2-3 (system-bootstrap + Kerry; qa-owner remains if KEEP decision)

**Pass criteria:** Counts match baseline recorded in README § "Known pre-existing production state", ± any retained Org A users.

---

### CLN-VER-02 | Search for leftover test strings in tenant-scoped tables

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SELECT 'campaigns' AS tbl, name FROM campaigns
  WHERE name ILIKE '%QA Test%' OR name ILIKE '%Tenant B%' OR name ILIKE '%HACKED%' OR name ILIKE '%Cross%'
UNION ALL SELECT 'organizations', name FROM organizations
  WHERE name ILIKE '%QA Tenant%' OR name ILIKE '%HACKED%'
UNION ALL SELECT 'voters', first_name || ' ' || last_name FROM voters
  WHERE first_name ILIKE 'TestA%' OR first_name ILIKE 'TestB%' OR first_name ILIKE '%HACKED%'
UNION ALL SELECT 'volunteers', email FROM volunteers
  WHERE email ILIKE '%civpulse.test'
UNION ALL SELECT 'users', email FROM users
  WHERE email ILIKE '%civpulse.test' OR email ILIKE 'qa-b-%';
SQL
```

**Expected:** 0 rows.

**Pass criteria:** No test-string rows remain.

**Failure meaning:** Any row here is a leaked test record — delete manually and record in the results file.

---

### CLN-VER-03 | Verify no dangling campaign_members / organization_members

**Steps:**
```bash
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod <<SQL
SELECT 'campaign_members orphaned' AS tbl, count(*) FROM campaign_members cm
  LEFT JOIN campaigns c ON c.id = cm.campaign_id WHERE c.id IS NULL
UNION ALL SELECT 'organization_members orphaned', count(*) FROM organization_members om
  LEFT JOIN organizations o ON o.id = om.organization_id WHERE o.id IS NULL;
SQL
```

**Expected:** Both counts = 0.

**Pass criteria:** No orphaned membership rows.

---

## Section 7: Final Results Summary

### CLN-SUM-01 | Generate `results/SUMMARY.md`

**Purpose:** Produce the cross-phase roll-up that stakeholders read to decide on launch.

**Steps:**
1. For each phase 00-16, read `results/phase-NN-results.md` and extract PASS/FAIL/SKIP/BLOCKED counts.
2. List every FAIL at P0 or P1 severity with its test ID, phase, and issue link.
3. Apply the launch-ready decision criteria from `README.md § "Success criteria for production launch"`.
4. Write the summary to `docs/production-shakedown/results/SUMMARY.md` using the template in `results/README.md`.

**Expected output:** A `SUMMARY.md` with:
- Per-phase results table
- Critical-tests matrix (phase 01, 03, 10, 11, 12 must all pass)
- Full list of P0/P1 failures with issue links
- Go / No-go verdict

**Pass criteria:** `results/SUMMARY.md` exists and every phase has a row.

---

### CLN-SUM-02 | Apply launch-ready decision criteria

**Purpose:** Codify the go/no-go verdict.

**Decision matrix:**

| Criterion | Source | Launch blocker if … |
|---|---|---|
| All 6 health checks PASS | Phase 00 | Any FAIL |
| All auth flows PASS, no token leakage | Phase 01 | Any FAIL |
| ZERO cross-tenant leaks | Phase 03 | Any FAIL (non-negotiable) |
| No permission bypasses | Phase 11 | Any unexpected 200 for underprivileged role |
| No SQLi / XSS / forged-token bypass | Phase 12 | Any FAIL |
| Offline queue drains reliably | Phase 10 | Data loss on reconnect |
| All other phases ≥95% PASS | Phases 02, 04-09, 13-15 | <95% pass rate |
| No open P0 issues | All phases | Any open P0 |

**Pass criteria:** Every criterion is evaluated and recorded in `SUMMARY.md`. Produce an explicit GO or NO-GO verdict.

---

## Rollback

If cleanup damages production in unexpected ways:

1. **Restore from backup:** Prod DB has daily snapshots; restore the most recent pre-phase-00 snapshot to a staging DB and diff against current state.
2. **Re-grant BYPASSRLS:** If removed accidentally, run `ALTER ROLE civpulse_run_prod BYPASSRLS`.
3. **Recreate ZITADEL users:** Phase 00 § ENV-PROV-03 is idempotent and can be re-run to recreate Org B users.
4. **Halt the phase:** If a DELETE returns more rows than expected, BEGIN/ROLLBACK and investigate before committing.

All DB statements in this phase are wrapped in `BEGIN; ... COMMIT;` so uncommitted deletes can be rolled back with `ROLLBACK` before `COMMIT`.

---

## Decision matrix — KEEP vs DELETE

| Item | Default | Rationale |
|---|---|---|
| Org A ("CivPulse Platform") | KEEP | Pre-existing production tenant |
| Org B ("QA Tenant B") | DELETE | Created solely for phase 03 |
| Org A test users (5) | KEEP | Enables repeat regression runs |
| Org B test users (5) | DELETE | Tied to deleted Org B |
| QA Test Campaign (Org A) | DELETE | Created for this plan |
| Tenant B Test Campaign (Org B) | DELETE | Created for this plan |
| BYPASSRLS on civpulse_run_prod | KEEP | Tracked in issue #21 |
| alembic_version VARCHAR(128) | KEEP | Tracked in issue #19 |
| `.secrets/prod-test-users.md` | ANNOTATE | Preserves audit trail for Org A creds |

---

## Results Template

Save a filled-in copy of this section to `results/phase-16-results.md`.

### Pre-cleanup counts

Paste the output of CLN-CAMP-01 here.

### Campaign deletion

| Test ID | Result | Notes |
|---|---|---|
| CLN-CAMP-01 | | Snapshot saved |
| CLN-CAMP-02 | | Org A campaign deleted |
| CLN-CAMP-03 | | Org B campaign deleted |
| CLN-CAMP-04 | | 14 counts all zero |

### Organization deletion

| Test ID | Result | Notes |
|---|---|---|
| CLN-ORG-01 | | Org A KEPT |
| CLN-ORG-02 | | Org B DB rows deleted |
| CLN-ORG-03 | | No orphaned campaigns |

### User deletion

| Test ID | Result | Notes |
|---|---|---|
| CLN-USR-01 | | Decision: KEEP / DELETE Org A users |
| CLN-USR-02 | | 5/5 Org B users deleted from ZITADEL |
| CLN-USR-03 | | All in USER_STATE_DELETED or 404 |
| CLN-USR-04 | | 0 active grants |
| CLN-USR-05 | | DB users table cleaned |

### Secrets hygiene

| Test ID | Result | Notes |
|---|---|---|
| CLN-SEC-01 | | Annotated / archived |

### Retained workarounds

| Test ID | Result | Notes |
|---|---|---|
| CLN-WA-01 | | BYPASSRLS KEEP, issue #21 |
| CLN-WA-02 | | VARCHAR(128) KEEP, issue #19 |

### Final verification

| Test ID | Result | Notes |
|---|---|---|
| CLN-VER-01 | | Counts match baseline |
| CLN-VER-02 | | 0 test strings remain |
| CLN-VER-03 | | 0 orphaned memberships |

### Summary generation

| Test ID | Result | Notes |
|---|---|---|
| CLN-SUM-01 | | SUMMARY.md written |
| CLN-SUM-02 | | Verdict: GO / NO-GO |

### Summary

- Total tests: 18
- PASS: ___ / 18
- FAIL: ___ / 18
- SKIP: ___ / 18
- BLOCKED: ___ / 18

**Launch decision:** GO / NO-GO — see `results/SUMMARY.md`.

## Cleanup

This phase IS the cleanup. After it completes, commit all results files and close the shakedown cycle per `results/README.md § "Next steps after cleanup"`.
