# CivicPulse Run — Production Testing Runbook

**Version:** 1.0
**Created:** 2026-03-30
**Target Environment:** Production (`https://run.civpulse.org`)
**Status:** Pre-launch validation

---

## How to Use This Document

This runbook is designed for two audiences: an **AI agent** executing tests programmatically, and a **human QA tester** following steps manually.

**Dual-audience format:** Each test includes numbered steps, exact UI element labels, expected results, and curl/CLI commands where applicable. AI agents should execute curl commands directly and use Playwright CLI for UI validation. Human testers should follow the step-by-step instructions in a browser.

**Two tiers:**
- **Smoke Suite** (~18 tests, ~10 min): One happy-path per major domain. Run after any deployment to confirm the system is functional.
- **Extended Suite** (~65–70 tests, ~30 min): Full coverage of all domains, edge cases, and cross-cutting behaviors.

**Pre-launch context:** This is pre-launch validation — production is not yet live. All operations (including destructive writes such as deleting campaigns or voters, CSV imports, and full CRUD) are safe to execute. No real user data is at risk.

**Execution instructions for AI agents:**
1. Set all variables in the Configuration section below before proceeding.
2. Run Section 0 (Deployment Health Checks) first. Stop if any check fails (except HEALTH-06).
3. Run Section 1 (Test User Provisioning) once before tests.
4. Run Section 2 (Data Setup) once before tests.
5. Run Section 3 (Playwright Auth Setup) once before UI tests.
6. Execute either the Smoke Suite or Extended Suite (or both).
7. Fill in the Execution Results table as you go.

---

## Configuration

Set all variables before proceeding. Any unset variable will cause test failures.

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `${PROD_URL}` | Production application URL (frontend + API) | `https://run.civpulse.org` |
| `${ZITADEL_URL}` | Production ZITADEL authentication URL (external) | `https://auth.civpulse.org` |
| `${ZITADEL_PAT}` | Production ZITADEL admin Personal Access Token | `<obtain from ZITADEL admin console>` |
| `${DB_HOST}` | Production PostgreSQL host (in-cluster service name) | `postgresql.civpulse-infra.svc.cluster.local` |
| `${DB_USER}` | Production database username | `civicpulse` |
| `${DB_PASS}` | Production database password | `<from K8s secret run-api-secret>` |
| `${DB_NAME}` | Production database name | `civicpulse` |
| `${S3_ENDPOINT_URL}` | Cloudflare R2 endpoint URL | `https://r2.cloudflarestorage.com/<account-id>` |
| `${S3_ACCESS_KEY_ID}` | R2 S3-compatible access key ID | `<from K8s secret run-api-secret>` |
| `${S3_SECRET_ACCESS_KEY}` | R2 S3-compatible secret access key | `<from K8s secret run-api-secret>` |
| `${S3_BUCKET}` | R2 bucket name for voter import files | `voter-imports` |
| `${TEST_DATA_CSV}` | Path to the L2 test CSV file (551 voters) | `data/example-2026-02-24.csv` |
| `${OWNER1_PASSWORD}` | Password for owner test users | `Owner1234!` |

**Note:** Set all variables before proceeding. Any unset variable will cause test failures. The `${ZITADEL_PAT}` must be a service account PAT with admin privileges in the production ZITADEL instance. Contact the infrastructure team to obtain it if not available.

---

## 0. Deployment Health Checks

Run all health checks before any testing. If any check fails (except HEALTH-06), **STOP** and resolve the infrastructure issue before proceeding.

### HEALTH-01: API Liveness

**Purpose:** Confirm the API container is running and responding.

```bash
curl -sf "${PROD_URL}/health/live" | grep -q "ok" && echo "PASS: API liveness" || echo "FAIL: API liveness"
```

**Expected:** HTTP 200 response containing `"ok"`.

**STOP gate:** If this fails, the API container is not running. Check K8s pod status: `kubectl get pods -n civpulse-app`.

---

### HEALTH-02: API Readiness (DB Connectivity)

**Purpose:** Confirm the API can connect to PostgreSQL. The readiness probe validates DB connectivity at startup.

```bash
curl -sf "${PROD_URL}/health/ready" | grep -q "ok" && echo "PASS: API readiness" || echo "FAIL: API readiness"
```

**Expected:** HTTP 200 response containing `"ok"`.

**STOP gate:** If this fails, the API cannot reach the database. Check: (1) DB pod is running, (2) `DATABASE_URL` secret is correctly mounted, (3) network policies allow API → DB traffic.

---

### HEALTH-03: Public Config (ZITADEL Integration)

**Purpose:** Confirm the ZITADEL OIDC integration is configured and the public config endpoint is reachable.

```bash
curl -sf "${PROD_URL}/api/v1/config/public" && echo "PASS: Public config" || echo "FAIL: Public config"
```

**Expected:** HTTP 200 JSON response containing ZITADEL configuration (issuer URL, client ID).

**STOP gate:** If this returns an error, the application config is broken. Check `run-api-configmap` for correct `ZITADEL_BASE_URL` and `ZITADEL_CLIENT_ID` values.

---

### HEALTH-04: ZITADEL Reachability

**Purpose:** Confirm the production ZITADEL instance is accessible from the test machine.

```bash
curl -sf "${ZITADEL_URL}/debug/ready" && echo "PASS: ZITADEL ready" || echo "FAIL: ZITADEL unreachable"
```

**Expected:** HTTP 200 response.

**STOP gate:** If this fails, users cannot authenticate. Check: (1) ZITADEL pod health in the cluster, (2) Cloudflare Tunnel for `auth.civpulse.org`, (3) external DNS resolution.

---

### HEALTH-05: Frontend Load (React App)

**Purpose:** Confirm the React frontend is built and being served. The API container serves the frontend as static files.

```bash
curl -sf "${PROD_URL}" | grep -qi "civicpulse" && echo "PASS: Frontend loads" || echo "FAIL: Frontend not served"
```

**Expected:** HTML response containing "CivicPulse" in the page title or body.

**STOP gate:** If this fails, the React build was not included in the container image, or the SPA static mount is broken. All Playwright UI tests will fail if the frontend is not served.

---

### HEALTH-06: S3/R2 Bucket Access

**Purpose:** Confirm Cloudflare R2 is reachable and the voter-imports bucket exists. Required for voter import tests.

```bash
# Using AWS CLI with R2 endpoint
AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
  aws s3 ls "s3://${S3_BUCKET}" \
  --endpoint-url="${S3_ENDPOINT_URL}" \
  && echo "PASS: S3/R2 bucket accessible" \
  || echo "SKIP: S3/R2 not accessible — voter import tests should be marked SKIP"
```

**Expected:** Successful bucket listing (even if empty). HTTP 200.

**If FAIL:** Do NOT stop. Mark import-related tests (IMP-01 through IMP-04, SMOKE-IMP-01) as **SKIP (HEALTH-06 FAIL)** in the results table. All other tests can still proceed.

---

### Pre-flight Summary

After running all health checks, summarize before proceeding:

```
HEALTH-01: [ PASS / FAIL ]
HEALTH-02: [ PASS / FAIL ]
HEALTH-03: [ PASS / FAIL ]
HEALTH-04: [ PASS / FAIL ]
HEALTH-05: [ PASS / FAIL ]
HEALTH-06: [ PASS / FAIL / SKIP ]

S3 available for import tests: [ YES / NO ]
```

If HEALTH-01 through HEALTH-05 are all PASS, continue to Section 1.

---

## 1. Test User Provisioning

Provision 15 ZITADEL test users across 5 campaign roles (3 per role) using the idempotent provisioning script. This step is safe to run multiple times.

### 1.1 Prerequisites

Before running the provisioning script:

1. Confirm `${ZITADEL_PAT}` is set to a valid admin PAT for the production ZITADEL instance.
2. Confirm the CivicPulse project exists in ZITADEL (it must exist before users can receive project role grants).
3. **MFA Policy:** The production ZITADEL org must have MFA set to **"not enforced"** for the test org/project. If MFA is enforced, Playwright auth setup (Section 3) will fail because the automated login flow cannot handle MFA prompts.

   To check or set the org-level login policy (via ZITADEL management API or console):
   - Navigate to the ZITADEL Admin Console → Organization → Login Policy.
   - Set "Multi-Factor Init Lifetime" to 0 or disable MFA enforcement.
   - This policy affects only the test org/project, not production user accounts.

### 1.2 Run the Provisioning Script

```bash
# Write the PAT to a temp file (script reads from file, not stdin)
echo "${ZITADEL_PAT}" > /tmp/prod-pat.txt

# Run the provisioning script with production ZITADEL config
ZITADEL_DOMAIN="auth.civpulse.org" \
ZITADEL_EXTERNAL_PORT="443" \
ZITADEL_EXTERNAL_SECURE="true" \
ZITADEL_URL="${ZITADEL_URL}" \
PAT_PATH="/tmp/prod-pat.txt" \
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" \
  uv run python scripts/create-e2e-users.py

# Remove the temp PAT file
rm /tmp/prod-pat.txt
```

**What this does:** Creates 15 ZITADEL human users with project role grants, inserts `users` table rows, inserts `organization_members` rows for owner/admin users, and inserts `campaign_members` rows for all 15 users into the seed campaign.

### 1.3 Test User Credentials

All 15 test users created by the provisioning script:

| # | Display Name | Username (ZITADEL) | Campaign Role | Org Role | Password |
|---|---|---|---|---|---|
| 1 | Test Owner1 | `owner1@localhost` | owner | org_owner | `Owner1234!` |
| 2 | Test Owner2 | `owner2@localhost` | owner | org_owner | `Owner1234!` |
| 3 | Test Owner3 | `owner3@localhost` | owner | org_owner | `Owner1234!` |
| 4 | Test Admin1 | `admin1@localhost` | admin | org_admin | `Admin1234!` |
| 5 | Test Admin2 | `admin2@localhost` | admin | org_admin | `Admin1234!` |
| 6 | Test Admin3 | `admin3@localhost` | admin | org_admin | `Admin1234!` |
| 7 | Test Manager1 | `manager1@localhost` | manager | — | `Manager1234!` |
| 8 | Test Manager2 | `manager2@localhost` | manager | — | `Manager1234!` |
| 9 | Test Manager3 | `manager3@localhost` | manager | — | `Manager1234!` |
| 10 | Test Volunteer1 | `volunteer1@localhost` | volunteer | — | `Volunteer1234!` |
| 11 | Test Volunteer2 | `volunteer2@localhost` | volunteer | — | `Volunteer1234!` |
| 12 | Test Volunteer3 | `volunteer3@localhost` | volunteer | — | `Volunteer1234!` |
| 13 | Test Viewer1 | `viewer1@localhost` | viewer | — | `Viewer1234!` |
| 14 | Test Viewer2 | `viewer2@localhost` | viewer | — | `Viewer1234!` |
| 15 | Test Viewer3 | `viewer3@localhost` | viewer | — | `Viewer1234!` |

**Note:** Email domains are `@localhost` — this is intentional. ZITADEL does not send verification emails for these addresses since `isEmailVerified: true` is set via the v2beta API.

### 1.4 Verification

After the script completes:

```bash
# Confirm users exist in ZITADEL (should return 15 users)
curl -sf "${ZITADEL_URL}/management/v1/users/_search" \
  -H "Authorization: Bearer ${ZITADEL_PAT}" \
  -H "Content-Type: application/json" \
  -d '{"queries":[{"userNameQuery":{"userName":"owner1@localhost","method":"TEXT_QUERY_METHOD_EQUALS"}}]}' \
  | grep -q "owner1" && echo "PASS: User provisioning verified" || echo "FAIL: User not found"
```

---

## 2. Data Setup

### Step 1: Run Seed Script Against Production DB

The seed script creates an idempotent Macon-Bibb County GA demo dataset: 1 organization, 1 campaign, 50 voters (with PostGIS coordinates), 5 turfs, 4 walk lists, 3 call lists, 3 phone bank sessions, 20 volunteers, 10 shifts, 190 voter interactions, survey responses, tags, DNC entries, invites, and addresses.

```bash
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" \
DATABASE_URL_SYNC="postgresql+psycopg2://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" \
  uv run python scripts/seed.py
```

**Expected output:** Script prints "Seed complete" with counts for each entity created/updated.

**Note:** The seed script is idempotent — safe to run multiple times. It uses `ON CONFLICT` for all inserts.

**Pitfall:** If you run the seed script without setting `DATABASE_URL`, it will target the local Docker Compose PostgreSQL instead of production. Always set `DATABASE_URL` explicitly.

### Step 2: Operational Data via UI

The seed script provides base data (org, campaign, voters). Additional operational data (turfs, walk lists, phone banks, surveys, shifts) will be created through UI steps **during the test flow itself**. This validates both the seed path and UI creation workflows.

- Turfs are created in TURF-01 / SMOKE-TURF-01
- Walk lists are generated in WL-01 / SMOKE-WL-01
- Call lists are created in CL-01 / SMOKE-CL-01
- Phone bank sessions are created in PB-01 / SMOKE-PB-01
- Surveys are created in SRV-01 / SMOKE-SRV-01
- Volunteers are registered in VOL-01 / SMOKE-VOL-01
- Shifts are created in SHIFT-01 / SMOKE-SHIFT-01

---

## 3. Playwright Auth Setup

Run once before any Playwright UI tests. This generates authentication state files (storageState JSON) for each role.

### Prerequisites

- The production frontend must be deployed and serving at `${PROD_URL}` (verified by HEALTH-05).
- Test users must be provisioned (Section 1).
- MFA must not be enforced for the test org (Section 1.1).

### Auth Setup Commands

```bash
cd web

# Delete any cached local auth files (they contain tokens from local ZITADEL and will be rejected by production)
rm -rf playwright/.auth/

# Run only the auth-setup project to generate production auth state
PLAYWRIGHT_BASE_URL="${PROD_URL}" npx playwright test --project=auth-setup
```

**What this does:** Navigates to `${PROD_URL}`, completes the OIDC login flow through `${ZITADEL_URL}` for each of the 5 role-based test users (owner1, admin1, manager1, volunteer1, viewer1), and serializes the browser auth state to `web/playwright/.auth/`.

**Expected output:** 5 auth state files created:
- `web/playwright/.auth/owner.json`
- `web/playwright/.auth/admin.json`
- `web/playwright/.auth/manager.json`
- `web/playwright/.auth/volunteer.json`
- `web/playwright/.auth/viewer.json`

**If auth setup fails with MFA prompts:** Return to Section 1.1 and verify the ZITADEL org login policy disables MFA enforcement. MFA prompts cannot be handled by the automated Playwright auth flow.

**If auth setup fails with a redirect loop:** Check that `${PROD_URL}` is correctly set and the frontend is returning the React app HTML (not an API error).

### Running Playwright Tests Against Production

After auth setup, run Playwright tests with the production base URL:

```bash
cd web

# Run specific spec files against production
npx playwright test --project=chromium \
  --base-url="${PROD_URL}" \
  --workers=2 \
  rbac.admin.spec.ts rbac.viewer.spec.ts

# Run full suite against production
npx playwright test --project=chromium \
  --base-url="${PROD_URL}" \
  --workers=4
```

**Note:** Reduce `--workers` to 2 or 1 if testing against production to avoid triggering rate limits (30 req/min per user). The API has trusted-proxy-aware rate limiting on all 73 endpoints.

---

## Smoke Suite

The smoke suite covers one happy-path per major domain. Target: ~18 tests, ~10 minutes.

Run the smoke suite after any production deployment to confirm the system is healthy.

---

### SMOKE-HEALTH-01: API and Frontend Are Up [Smoke]

**Preconditions:** Configuration variables are set.

**Steps:**
1. Run: `curl -sf "${PROD_URL}/health/live"` — expect `"ok"` with HTTP 200.
2. Run: `curl -sf "${PROD_URL}/health/ready"` — expect `"ok"` with HTTP 200.
3. Run: `curl -sf "${PROD_URL}"` — expect HTML containing "CivicPulse".

**Expected Results:** All three commands return expected responses. API is live, ready, and serving the frontend.

---

### SMOKE-AUTH-01: Login as Owner [Smoke]

**Preconditions:** Test users provisioned (Section 1). Production ZITADEL accessible.

**Steps:**
1. Navigate to `${PROD_URL}`.
2. Click "Log In" or wait for redirect to the ZITADEL login page at `${ZITADEL_URL}`.
3. Enter username `owner1@localhost` and password `Owner1234!`.
4. Complete the OIDC flow. Confirm redirect back to `${PROD_URL}`.
5. Confirm the org dashboard loads. "Test Owner1" appears in the sidebar/header.
6. Confirm the campaign card grid shows the "Macon-Bibb County" seed campaign.

**Expected Results:** Successful login. Org dashboard visible with seed campaign.

---

### SMOKE-RBAC-01: Viewer Cannot Mutate [Smoke]

**Preconditions:** Logged in as `viewer1@localhost` (password: `Viewer1234!`). Navigated to the Macon-Bibb campaign.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters`.
2. Confirm the "Add Voter" button is NOT visible in the UI.
3. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings`.
4. Confirm the Settings page is inaccessible or shows read-only content (no Save buttons for sensitive fields).
5. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing`.
6. Confirm the "New Turf" button is NOT visible.

**Expected Results:** Viewer cannot see mutation actions. Read-only access confirmed.

---

### SMOKE-ORG-01: Org Dashboard Loads with Campaign [Smoke]

**Preconditions:** Logged in as `owner1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}` (org dashboard root).
2. Confirm the org dashboard loads with:
   - Organization name in the header.
   - Campaign card grid showing at least the "Macon-Bibb County" campaign.
   - Stats bar (total campaigns, active campaigns, total members).
3. Confirm all stat values are numbers (not NaN, undefined, or empty).

**Expected Results:** Org dashboard renders with correct campaign card and stats.

---

### SMOKE-DASH-01: Campaign Dashboard KPIs Render [Smoke]

**Preconditions:** Logged in as `owner1@localhost`. Navigated to the Macon-Bibb campaign.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/dashboard`.
2. Confirm the following stat cards are present and show numeric values:
   - Doors Knocked
   - Contacts Made
   - Contact Rate (percentage)
   - Calls Made
   - Contacts Reached
   - Active Volunteers (with total volunteers subtitle)
3. Confirm no card shows NaN, undefined, or an error state.

**Expected Results:** All 6 stat cards render with valid numeric values from seed data.

---

### SMOKE-VCRUD-01: Create a Voter [Smoke]

**Preconditions:** Logged in as `manager1@localhost` (password: `Manager1234!`). Navigated to the Macon-Bibb campaign.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters`.
2. Click the "+ Add Voter" button.
3. Fill in the voter form:
   - First Name: `Smoke`
   - Last Name: `TestVoter`
   - Date of Birth: `1990-06-15`
   - Party: `Democrat`
   - Registration Address Line 1: `100 Smoke Test St`
   - City: `Macon`
   - State: `GA`
   - Zip: `31201`
4. Click Save / Create.
5. Confirm a success toast appears: "Voter created" or similar.
6. Search for "Smoke TestVoter" in the voters list.
7. Confirm the voter appears in the results.

**Expected Results:** Voter is created and appears in the voter list. Success toast shown.

---

### SMOKE-FLT-01: Search Voters by Name [Smoke]

**Preconditions:** Logged in as `manager1@localhost`. Seed data loaded (50 voters).

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters`.
2. In the search box, type a partial last name known to exist in Macon-Bibb seed data (e.g., type "Smith" or any surname from seed data). If unsure, type a common letter like "Jo".
3. Confirm the voter list filters to show only matching voters.
4. Clear the search. Confirm all voters return.

**Expected Results:** Text search filters voters by first or last name in real time.

---

### SMOKE-IMP-01: Upload CSV and Confirm Progress Bar [Smoke]

**Preconditions:** HEALTH-06 PASS. Logged in as `manager1@localhost`. Test CSV at `${TEST_DATA_CSV}`.

**Steps (Requires: HEALTH-06 PASS — mark SKIP if S3 unavailable):**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters/imports`.
2. Click "New Import" or "Import Voters."
3. In the import wizard Step 1 (Upload), upload `${TEST_DATA_CSV}`.
4. Confirm the file is accepted (filename displayed, column count shown).
5. Advance to Step 2 (Column Mapping). Confirm "L2 format detected" banner is shown.
6. Confirm columns are auto-mapped.
7. Advance to Step 3 (Preview). Confirm a preview table is shown.
8. Click "Start Import" in Step 4.
9. Confirm the progress indicator (progress bar or status polling) appears immediately.

**Expected Results:** Import job starts and progress UI is visible. Import continues in the background (do not wait for full completion in smoke suite).

---

### SMOKE-TURF-01: Create a Turf [Smoke]

**Preconditions:** Logged in as `manager1@localhost`. Navigated to the Macon-Bibb campaign.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing`.
2. Click "New Turf."
3. On the turf creation page (Leaflet map editor):
   - Enter turf name: `Smoke Turf Test`.
   - Use the polygon drawing tool to draw a rough boundary in Bibb County, GA (center map around Macon, GA coordinates: 32.84°N, 83.63°W).
   - Alternatively, use the GeoJSON import feature with a simple GeoJSON polygon.
4. Click Save.
5. Confirm the turf appears in the turfs table on the canvassing page.
6. Confirm a voter count is shown (may be 0 if polygon does not overlap seed voter coordinates).

**Expected Results:** Turf is created and appears in the canvassing turfs table.

---

### SMOKE-WL-01: Generate a Walk List [Smoke]

**Preconditions:** "Smoke Turf Test" turf exists from SMOKE-TURF-01.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing`.
2. Click "Generate Walk List."
3. In the walk list generation dialog:
   - Select "Smoke Turf Test" as the source turf.
   - Enter name: `Smoke Walk List`.
4. Click Generate / Confirm.
5. Confirm the walk list appears in the walk lists table with a voter count.

**Expected Results:** Walk list generated from the turf. Appears in the table.

---

### SMOKE-CL-01: Create a Call List [Smoke]

**Preconditions:** Logged in as `manager1@localhost`. Seed data includes voters with phone numbers.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/call-lists`.
2. Click "New Call List."
3. Fill in:
   - Name: `Smoke Call List`
   - Source: select from available voter lists or use a filter (Party = Democrat, or no filter).
4. Click Save / Create.
5. Confirm the call list appears with an entry count.

**Expected Results:** Call list created with voters (DNC numbers automatically excluded). Entry count shown.

---

### SMOKE-PB-01: Create a Phone Bank Session [Smoke]

**Preconditions:** "Smoke Call List" exists.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/sessions`.
2. Click "New Session."
3. Fill in:
   - Name: `Smoke Phone Bank Session`
   - Call List: select "Smoke Call List"
4. Click Save.
5. Confirm the session appears in the sessions list.

**Expected Results:** Phone banking session created and listed.

---

### SMOKE-SRV-01: Create a Survey Script [Smoke]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/surveys`.
2. Click the "+" or "New Survey" button.
3. Fill in:
   - Title: `Smoke Survey`
   - Description: `Smoke test survey`
4. Click Save.
5. Confirm the survey appears in the list with "draft" status badge.

**Expected Results:** Survey created in draft status.

---

### SMOKE-VOL-01: Register a Volunteer [Smoke]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers`.
2. Click "Register" or "Add Volunteer."
3. Select "Record only" mode.
4. Fill in:
   - First Name: `Smoke`
   - Last Name: `Volunteer`
   - Email: `smoke.volunteer@test.local`
5. Click Save.
6. Confirm the volunteer appears in the volunteer roster.

**Expected Results:** Volunteer record created and visible in the roster.

---

### SMOKE-SHIFT-01: Create and Schedule a Shift [Smoke]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers/shifts`.
2. Click "Create Shift" or "New Shift."
3. Fill in:
   - Name / Description: `Smoke Shift`
   - Date: tomorrow's date.
   - Start Time: `09:00`
   - End Time: `12:00`
   - Capacity: `5`
4. Click Save.
5. Confirm the shift appears in the shifts list, grouped by date.

**Expected Results:** Shift created and appears in the schedule view.

---

### SMOKE-FIELD-01: Volunteer Hub Loads [Smoke]

**Preconditions:** Logged in as `volunteer1@localhost` (password: `Volunteer1234!`). Test Volunteer1 has a campaign role of volunteer.

**Steps:**
1. Navigate to `${PROD_URL}/field/{campaign_id}` (use the campaign ID from the seed campaign).
2. Confirm the field hub loads with:
   - Mobile-first layout (no admin sidebar).
   - Welcome or assignment overview section.
   - No JavaScript errors in the browser console.

**Expected Results:** Field hub loads in mobile-optimized layout for the volunteer.

---

### SMOKE-NAV-01: Sidebar Navigation Works [Smoke]

**Preconditions:** Logged in as `owner1@localhost`. In the Macon-Bibb campaign.

**Steps:**
1. Click each sidebar navigation link and confirm the correct page loads:
   - "Dashboard" → confirm `${PROD_URL}/campaigns/{id}/dashboard` loads.
   - "Voters" → confirm `${PROD_URL}/campaigns/{id}/voters` loads.
   - "Canvassing" → confirm `${PROD_URL}/campaigns/{id}/canvassing` loads.
   - "Phone Banking" → confirm call lists page loads.
   - "Surveys" → confirm `${PROD_URL}/campaigns/{id}/surveys` loads.
   - "Volunteers" → confirm volunteers section loads.
   - "Settings" → confirm `${PROD_URL}/campaigns/{id}/settings` loads.
2. Confirm the active link is visually highlighted (bold text, active indicator).

**Expected Results:** All sidebar links navigate to correct pages. Active state is shown.

---

### SMOKE-CROSS-01: Toast Appears on Action [Smoke]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Create any resource (e.g., a voter tag via Voters > Tags > Create Tag with name "Smoke Tag").
2. Confirm a success toast notification appears at the bottom/top of the screen.
3. Confirm the toast auto-dismisses after a few seconds.
4. Perform a delete action (delete "Smoke Tag").
5. Confirm a success toast appears for the delete.

**Expected Results:** Toast notifications appear for create and delete operations. Auto-dismiss works.

---

### SMOKE-A11Y-01: Axe-Core Scan on Dashboard [Smoke]

**Preconditions:** Logged in as `owner1@localhost`. Campaign dashboard loaded.

**Steps (Playwright CLI):**

```bash
cd web
npx playwright test \
  --project=chromium \
  --base-url="${PROD_URL}" \
  --workers=1 \
  a11y.spec.ts
```

**Manual alternative:** Navigate to `${PROD_URL}/campaigns/{id}/dashboard`. Open browser DevTools → Run axe-core accessibility scan via the browser extension or DevTools Accessibility panel. Confirm no critical violations.

**Expected Results:** No critical (level A) WCAG 2.1 violations on the campaign dashboard. Minor or informational issues are acceptable.

---

## Extended Suite

The extended suite covers all domains with full test case coverage. Target: ~65–70 tests, ~30 minutes.

Run the extended suite for pre-launch validation or after major feature changes.

---

## 2. Authentication

### AUTH-01: Login with Valid Credentials [Extended]

**Preconditions:** Test users provisioned.

**Steps:**
1. Navigate to `${PROD_URL}`.
2. Click "Log In."
3. Enter username `owner1@localhost` and password `Owner1234!`.
4. Complete the OIDC flow through `${ZITADEL_URL}`.
5. Confirm redirect to `${PROD_URL}`.
6. Confirm org dashboard loads. "Test Owner1" visible in sidebar/header.
7. Confirm the Macon-Bibb County campaign card is visible.

**Expected Results:** Login succeeds. User lands on org dashboard.

---

### AUTH-02: Login Each Test User [Extended]

**Preconditions:** All 15 test users provisioned.

**Steps:**
1. For each of the 15 test users (credentials in Section 1.3):
   a. Log in via `${PROD_URL}`.
   b. Confirm OIDC flow completes without error.
   c. Confirm user lands on org dashboard or campaign dashboard.
   d. Confirm the user's display name is visible.
   e. Log out before logging in as the next user.

**Expected Results:** All 15 users can authenticate and access the application at their permission level.

---

### AUTH-03: Logout [Extended]

**Preconditions:** Logged in as any test user.

**Steps:**
1. Log in as `owner1@localhost`.
2. Click the user menu in the sidebar footer or header.
3. Click "Log Out" or "Sign Out."
4. Confirm redirect to the ZITADEL login page or `${PROD_URL}` with login prompt.
5. Attempt to navigate directly to `${PROD_URL}/campaigns/{campaign_id}/dashboard`.
6. Confirm redirect to login — no campaign data is visible.

**Expected Results:** User is logged out. Protected routes redirect to login.

---

### AUTH-04: Logout for 5 Different Users [Extended]

**Steps:**
1. Log in as `owner1@localhost`, log out.
2. Log in as `admin1@localhost`, log out.
3. Log in as `manager1@localhost`, log out.
4. Log in as `volunteer1@localhost`, log out.
5. Log in as `viewer1@localhost`, log out.

**Expected Results:** Each login/logout cycle completes cleanly. No session data from one user bleeds to another.

---

## 3. Role-Based Access Control (RBAC)

### RBAC-01: Assign Campaign Roles to Test Users [Extended]

**Preconditions:** Logged in as `owner1@localhost` in the Macon-Bibb campaign.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings/members`.
2. Invite each test user by email and assign their intended campaign role (see Section 1.3 credentials table).
3. Confirm each user appears in the member list with the correct role badge.

**Expected Results:** All 15 users are members of the campaign with correct roles.

**Note:** The seed script (`create-e2e-users.py`) already handles this via DB insert. This test validates the UI reflects those assignments correctly.

---

### RBAC-02: Assign Org Roles [Extended]

**Preconditions:** Logged in as `owner1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/org/members`.
2. Find `admin1@localhost` and `admin2@localhost` — confirm org_admin role is shown.
3. Find `owner1@localhost` through `owner3@localhost` — confirm org_owner role is shown.
4. Verify the per-campaign role matrix column shows the correct roles for each user.

**Expected Results:** Org roles are correctly shown in the member directory.

---

### RBAC-03: Viewer Cannot Access Mutation Actions [Extended]

**Preconditions:** Logged in as `viewer1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters` — confirm "+ Add Voter" button is NOT visible.
2. Navigate to any voter detail page — confirm "Edit" button is NOT visible.
3. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing` — confirm "New Turf" button is NOT visible.
4. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/call-lists` — confirm "New Call List" button is NOT visible.
5. Navigate to `${PROD_URL}/campaigns/{campaign_id}/surveys` — confirm "New Survey" button is NOT visible.
6. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers` — confirm no edit/delete actions on volunteer rows.
7. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings` — confirm settings are read-only or page is inaccessible.
8. Attempt direct URL access: `${PROD_URL}/campaigns/{campaign_id}/canvassing/turfs/new` — confirm redirect or permission error.

**Expected Results:** All mutation buttons hidden. Direct URL to create routes blocked.

---

### RBAC-04: Volunteer Can Record Interactions But Not Manage [Extended]

**Preconditions:** Logged in as `volunteer1@localhost`.

**Steps:**
1. Navigate to a voter detail page — confirm "Add Interaction" button IS visible.
2. Confirm "Edit" voter button is NOT visible.
3. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing` — confirm no "New Turf" or delete actions.
4. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings` — confirm page is inaccessible or limited.

**Expected Results:** Volunteers can view data and add interactions. Cannot create/edit/delete operational resources.

---

### RBAC-05: Manager Can Create and Manage Operational Resources [Extended]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters` — confirm "+ Add Voter" IS visible.
2. Navigate to a voter detail — confirm "Edit" IS visible.
3. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing` — confirm "New Turf" IS visible.
4. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/call-lists` — confirm "New Call List" IS visible.
5. Navigate to `${PROD_URL}/campaigns/{campaign_id}/surveys` — confirm "New Survey" IS visible.
6. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers` — confirm register/edit actions available.
7. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings/members` — confirm this page is NOT accessible (admin+ only).

**Expected Results:** Manager has full operational access but cannot manage campaign members or settings.

---

### RBAC-06: Admin Can Manage Members and Settings [Extended]

**Preconditions:** Logged in as `admin1@localhost`.

**Steps:**
1. Confirm all manager capabilities from RBAC-05 are present.
2. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings/members` — confirm the page loads and invite/role-change/remove actions are available.
3. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings` — confirm campaign name/description can be edited.
4. Navigate to the Danger Zone section — confirm it's visible.

**Expected Results:** Admin has all manager capabilities plus member management and campaign settings.

---

### RBAC-07: Owner Has Full Access Including Destructive Actions [Extended]

**Preconditions:** Logged in as `owner1@localhost`. A throwaway campaign exists for destructive testing.

**Steps:**
1. Confirm all admin capabilities from RBAC-06.
2. Navigate to the throwaway campaign's Settings > Danger Zone.
3. Confirm "Transfer Ownership" button is visible and clickable.
4. Confirm "Delete Campaign" button is visible and clickable.
5. Do NOT actually delete the main test campaign. Test on the throwaway campaign if verifying destructive flow.

**Expected Results:** Owner has access to transfer and delete actions.

---

### RBAC-08: Org Admin Has Admin-Equivalent Access Across All Campaigns [Extended]

**Preconditions:** `admin1@localhost` has org_admin role. A second campaign exists in the org.

**Steps:**
1. Log in as `admin1@localhost`.
2. Navigate to a campaign they were NOT explicitly invited to via UI (only via org role).
3. Confirm they have admin-level access (can see members section, settings).

**Expected Results:** Org admin role grants admin-equivalent access to all org campaigns.

---

### RBAC-09: Org Owner Has Owner-Equivalent Access Across All Campaigns [Extended]

**Steps:**
1. Log in as `owner1@localhost`.
2. Navigate to any campaign in the org.
3. Confirm owner-level access including Danger Zone visibility.

**Expected Results:** Org owner role grants owner-equivalent access across all campaigns.

---

## 4. Organization Management

### ORG-01: View Org Dashboard [Extended]

**Preconditions:** Logged in as `owner1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}` (org dashboard root).
2. Confirm: campaign card grid with Macon-Bibb campaign visible, stats bar (total/active campaigns, members), organization name in header.
3. Confirm all stat values are numeric.

**Expected Results:** Dashboard renders with correct campaign cards and stats.

---

### ORG-02: Create a New Campaign from Org Dashboard [Extended]

**Steps:**
1. Click "New Campaign" on the org dashboard.
2. Complete the 3-step campaign creation wizard:
   - Step 1 (Details): Name "Secondary Test Campaign", description "For extended testing."
   - Step 2 (Review): Confirm details, click Next.
   - Step 3 (Invite Team): Skip team invite, click Finish.
3. Confirm redirect to the new campaign's dashboard.

**Expected Results:** Campaign created. Appears on org dashboard.

---

### ORG-03: Archive a Campaign [Extended]

**Steps:**
1. On the org dashboard, find the "Secondary Test Campaign" card.
2. Click the archive action (menu icon on the card → Archive).
3. Confirm archive dialog. Confirm.
4. Confirm the campaign card moves to an "Archived" section or is visually marked as archived.

**Expected Results:** Campaign archived and visually distinguished.

---

### ORG-04: Unarchive a Campaign [Extended]

**Steps:**
1. Find the archived "Secondary Test Campaign."
2. Click "Unarchive" action.
3. Confirm it returns to the active campaign grid.

**Expected Results:** Campaign restored to active status.

---

### ORG-05: Edit Organization Name [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/org/settings`.
2. Change the organization name to "E2E Test Org (Renamed)".
3. Click Save. Confirm the name updates in the header.
4. Change it back to the original name. Save.

**Expected Results:** Organization name updates and reflects across the UI.

---

### ORG-06: View Org Member Directory [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/org/members`.
2. Confirm member list shows test users who have logged in.
3. For each member, confirm display name, email, and org role (if assigned) are shown.
4. Confirm per-campaign role matrix is visible.

**Expected Results:** Member directory shows users with correct roles.

---

### ORG-07: Change a Member's Org Role [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/org/members`.
2. Find `manager1@localhost` (no org role initially).
3. Assign them org_admin role.
4. Confirm the role badge updates.
5. Log in as `manager1@localhost`. Confirm they now have admin-level access on all campaigns.
6. Log back in as `owner1@localhost`. Remove org_admin from `manager1@localhost`.

**Expected Results:** Org role changes affect cross-campaign access immediately.

---

### ORG-08: Org Switcher (Multi-Org Users) [Extended]

**Preconditions:** A user belongs to 2+ organizations. (May need to create a second org for this test.)

**Steps:**
1. If a second org exists, log in as a user who belongs to both.
2. Click the org switcher in the header/sidebar.
3. Switch to the second org.
4. Confirm the dashboard, campaigns, and member list reflect the selected org.

**Expected Results:** Org switching is seamless. Previous org data not visible.

**Note:** If only one org exists in the production environment, mark this test as SKIP with note "Single org environment."

---

## 5. Campaign Settings

### CAMP-01: Edit Campaign General Settings [Extended]

**Preconditions:** Logged in as `admin1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings`.
2. Change the campaign name to "Macon-Bibb County (Updated)".
3. Update the description.
4. Click Save. Confirm the sidebar/header reflects the new name.
5. Revert the name back to "Macon-Bibb County". Save.

**Expected Results:** Campaign name and description update and reflect in navigation.

---

### CAMP-02: Invite a New Member [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/settings/members`.
2. Click "Invite" or "Add Member."
3. Enter the email `viewer2@localhost`.
4. Select role "viewer".
5. Submit.
6. Confirm `viewer2@localhost` appears in the member list.

**Expected Results:** Invitation created. User appears in member list.

---

### CAMP-03: Change a Member's Campaign Role [Extended]

**Steps:**
1. In campaign Settings > Members, find `volunteer1@localhost`.
2. Change role to "manager."
3. Confirm role badge updates.
4. Log in as `volunteer1@localhost`. Confirm they can now create voters (manager action).
5. Log back in as admin/owner. Revert `volunteer1@localhost` back to "volunteer."

**Expected Results:** Role change is immediate and affects permissions.

---

### CAMP-04: Remove a Member from Campaign [Extended]

**Steps:**
1. In campaign Settings > Members, find `viewer3@localhost`.
2. Click Remove.
3. Confirm removal dialog. Confirm.
4. Confirm `viewer3@localhost` no longer in the member list.
5. Log in as `viewer3@localhost`. Confirm they cannot access the campaign.
6. Log back in as admin/owner. Re-invite `viewer3@localhost` as "viewer" to restore state.

**Expected Results:** Removed user loses campaign access.

---

### CAMP-05: Transfer Campaign Ownership [Extended]

**Preconditions:** A throwaway campaign exists (create one in ORG-02 or create a new one).

**Steps:**
1. Log in as `owner1@localhost` (who owns the throwaway campaign).
2. Navigate to throwaway campaign Settings > Danger Zone.
3. Click "Transfer Ownership."
4. Select `owner2@localhost` as the target.
5. Complete the type-to-confirm dialog.
6. Confirm ownership transfer.
7. Log in as `owner2@localhost`. Confirm they now own the throwaway campaign.
8. Log back in as `owner1@localhost`. Confirm their ownership changed.

**Expected Results:** Ownership transfers successfully.

---

### CAMP-06: Delete a Campaign [Extended]

**Preconditions:** A throwaway campaign exists.

**Steps:**
1. Log in as the campaign owner (whoever owns the throwaway campaign after CAMP-05).
2. Navigate to throwaway campaign Settings > Danger Zone.
3. Click "Delete Campaign."
4. Type the campaign name in the type-to-confirm dialog.
5. Submit.
6. Confirm redirect to org dashboard.
7. Confirm the throwaway campaign is gone from the org dashboard.

**Expected Results:** Campaign permanently deleted.

---

## 6. Campaign Dashboard

### DASH-01: View Campaign Dashboard KPIs [Extended]

**Preconditions:** Logged in. Seed data loaded (provides baseline data).

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/dashboard`.
2. Confirm 6 stat cards visible: Doors Knocked, Contacts Made, Contact Rate, Calls Made, Contacts Reached, Active Volunteers.
3. Confirm all values are numeric. Seed data should provide non-zero values.

**Expected Results:** All 6 stat cards render with valid values.

---

### DASH-02: Dashboard Loads for All Roles [Extended]

**Steps:**
1. Log in as owner1, navigate to dashboard — confirm loads.
2. Log in as admin1, navigate to dashboard — confirm loads.
3. Log in as manager1, navigate to dashboard — confirm loads.
4. Log in as volunteer1, navigate to dashboard — confirm loads.
5. Log in as viewer1, navigate to dashboard — confirm loads.

**Expected Results:** Dashboard viewable by all roles without errors.

---

### DASH-03: Dashboard Charts and Drilldowns [Extended]

**Steps:**
1. Log in as `owner1@localhost`. Navigate to the campaign dashboard.
2. Confirm any charts or trend graphs render (if present).
3. Click on any stat card that offers a drilldown (e.g., "Doors Knocked" → canvassing detail).
4. Confirm the drilldown navigates to the correct section.

**Expected Results:** Dashboard elements are interactive where applicable.

---

## 7. Voter Import

### IMP-01: Import L2 Voter File [Extended]

**Preconditions: Requires HEALTH-06 PASS.** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters/imports`.
2. Click "New Import."
3. Step 1 (Upload): Upload `${TEST_DATA_CSV}`. Confirm file accepted, column count shown.
4. Step 2 (Column Mapping): Confirm "L2 format detected" banner. Confirm all 55 columns auto-mapped. Verify: voter_file_id, first_name, last_name, party, cell phone, address, voting history (General_2024), propensity_general.
5. Step 3 (Preview): Confirm preview rows shown.
6. Step 4 (Confirm): Click "Start Import."
7. Monitor progress bar or status polling until import completes.
8. Confirm final status: "Complete" with 551 voters imported.

**Expected Results:** 551 voters imported. Import history shows completed job.

---

### IMP-02: Validate Import Progress and History [Extended]

**Preconditions: Requires HEALTH-06 PASS.** IMP-01 complete.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters/imports`.
2. Confirm the completed import appears with file name, row count (551), status (Complete), and timestamp.
3. Confirm "Download Error Report" link present only if errors occurred.

**Expected Results:** Import history accurately reflects completed job.

---

### IMP-03: Concurrent Import Prevention [Extended]

**Preconditions: Requires HEALTH-06 PASS.**

**Steps:**
1. Start a new import (re-upload `${TEST_DATA_CSV}`).
2. While first import is in progress, attempt to start a second import immediately.
3. Confirm the second import is blocked with a 409 Conflict or "Import already in progress" UI message.

**Expected Results:** Only one import can run at a time per campaign.

---

### IMP-04: Cancel an Import [Extended]

**Preconditions: Requires HEALTH-06 PASS.**

**Steps:**
1. Start a new import with `${TEST_DATA_CSV}`.
2. While import is in progress, click "Cancel."
3. Confirm ConfirmDialog appears.
4. Confirm the cancellation.
5. Confirm status changes to "Cancelled."
6. Confirm voters imported before cancellation are retained in the voter list.

**Expected Results:** Import cancelled gracefully. Partial data preserved.

---

## 8. Voter Data Validation

### VAL-01: Validate Imported Voter Data (Sample) [Extended]

**Preconditions:** IMP-01 complete. Local copy of `${TEST_DATA_CSV}` available to compare.

**Steps:**
1. Select 10 voters from the CSV with diverse data (different streets, parties, age ranges).
2. For each voter, search by name in `${PROD_URL}/campaigns/{campaign_id}/voters`.
3. Click into each voter detail page.
4. Verify against the CSV: full name, party registration, registration address, propensity scores (badges: green ≥67, yellow 34–66, red <34), cell phone (in Contacts tab), voting history (in Overview tab).

**Expected Results:** Voter data matches source CSV. Propensity badges show correct color coding.

---

### VAL-02: Validate Missing Data [Extended]

**Preconditions:** IMP-01 complete.

**Steps:**
1. Select 5 voters from the CSV with empty phone number fields.
2. Navigate to each voter's Contacts tab. Confirm no phone is listed.
3. Select 5 voters with empty mailing address fields.
4. Confirm no mailing address card is shown.
5. Select 5 voters with empty propensity score fields.
6. Confirm propensity badges show "N/A."

**Expected Results:** Missing data shown as absent, not as zeros or error values.

---

## 9. Voter Search and Filtering

### FLT-01: Text Search by Name [Extended]

**Preconditions:** Voters in the system (from seed or import).

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters`.
2. Type a known first name into the search box. Confirm matching voters appear.
3. Clear search. Type a known last name. Confirm matching voters appear.
4. Clear search. Confirm all voters return.

**Expected Results:** Text search filters by first and last name.

---

### FLT-02: Test Every Filter Dimension [Extended]

**Preconditions:** Voters loaded (seed + import). For each filter:
1. Apply the filter from the filter builder/panel.
2. Confirm results match the filter criteria.
3. Remove the filter (dismiss chip or clear).

Filters to test (from the 23-dimension filter system):
1. **Party** — Select "Democrat." Confirm all results are Democrats.
2. **Gender** — Select "Male." Confirm results.
3. **Age range** — Set min=25, max=35. Confirm results are in that age range.
4. **Propensity: General** — Set min=50, max=100. Confirm ≥50 propensity.
5. **Propensity: Primary** — Set min=0, max=30. Confirm low-propensity voters.
6. **Propensity: Combined** — Set a range. Verify results.
7. **Has phone** — Filter for voters with phone numbers.
8. **Has no phone** — Filter for voters without phone numbers.
9. **Voting history: General_2024** — Confirm voters voted in 2024 general.
10. **Voting history: Primary_2024** — Confirm 2024 primary voters.
11. **Registration city** — Filter by "Macon". Confirm results.
12. **Registration state** — Filter by "GA". Confirm results.
13. **Registration zip** — Filter by a zip code from CSV.
14. **Ethnicity** — Select one or more values.
15. **Spoken language** — Filter by a specific language.
16. **Household size** — Set a range.
17. **Military status** — Filter for veteran/active.
18. **Party change indicator** — Filter for changed-party voters.

**Expected Results:** Each filter dimension produces correct filtered results.

---

### FLT-03: Combined Filters [Extended]

**Steps:**
1. Apply: Party = Democrat AND Age range 30–50 AND Has Phone = true.
2. Confirm results satisfy ALL three criteria simultaneously.
3. Confirm 3 filter chips appear with category colors.
4. Click X on the age chip. Confirm results update to reflect 2 remaining filters.
5. Clear all filters.

**Expected Results:** Filters compose with AND logic. Filter chips dismissible individually.

---

### FLT-04: Sort Voters [Extended]

**Steps:**
1. Click "Last Name" column header → sort ascending. Confirm A–Z order.
2. Click again → descending. Confirm Z–A order.
3. Repeat for: First Name, Party, City.

**Expected Results:** Sorting works in both directions.

---

### FLT-05: Pagination [Extended]

**Steps:**
1. With no filters (551 voters after import), confirm first page loads correctly.
2. Click "Load More" or "Next Page" to load additional results.
3. Continue until all voters loaded or end of list reached.
4. Confirm no duplicate voters. Total count consistent.

**Expected Results:** Cursor-based pagination loads all results correctly.

---

## 10. Voter CRUD

### VCRUD-01: Create 5 New Voters [Extended]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Create 5 voters using the "+ Add Voter" button:
   - Voter 1: First=Test, Last=Alpha, DOB=1990-01-15, Party=Democrat, Address=100 Test St, Macon, GA, 31201
   - Voter 2: First=Test, Last=Bravo, DOB=1985-06-20, Party=Republican, Address=200 Test Ave, Macon, GA, 31201
   - Voter 3: First=Test, Last=Charlie, DOB=2000-03-10, Party=Independent (no address)
   - Voter 4: First=Test, Last=Delta, DOB=1975-11-30, Party=Libertarian, Address=400 Test Blvd, Warner Robins, GA, 31088
   - Voter 5: First=Test, Last=Echo, DOB=1960-08-05, Party=Democrat, Address=500 Test Dr, Macon, GA, 31204
2. For each voter: confirm success toast, search by name, confirm in list, click detail page to verify all data.

**Expected Results:** 5 voters created with correct data. Voter count increases by 5.

---

### VCRUD-02: Edit Created Voters [Extended]

**Steps:**
1. Navigate to Test Alpha's detail page. Click Edit. Change party from Democrat to Independent. Save. Confirm change shown.
2. Navigate to Test Bravo. Edit → change address. Save.
3. Navigate to Test Charlie. Edit → add an address (was empty). Save.
4. Navigate to Test Delta. Edit → change city. Save.
5. Navigate to Test Echo. Edit → change date of birth. Save.

**Expected Results:** All edits saved and immediately reflected in the UI.

---

### VCRUD-03: Delete 5 Imported Voters [Extended]

**Steps:**
1. Search for 5 voters from the imported CSV. Note their names.
2. For each: click row actions (three dots) → Delete → confirm the DestructiveConfirmDialog → confirm success toast.
3. Search for each deleted voter by name. Confirm they are absent.

**Expected Results:** Voters permanently deleted. Absent from all views.

---

### VCRUD-04: Delete Test-Created Voters [Extended]

**Steps:**
1. Delete Test Alpha, Bravo, Charlie, Delta, and Echo.
2. Confirm none appear in search results.

**Expected Results:** All 5 test voters deleted. Voter count returns to previous level.

---

## 11. Voter Contacts

### CON-01: Add Phone Numbers to Voters [Extended]

**Steps:**
1. For 5 voters, navigate to their detail page → Contacts tab → "Add Phone."
2. Enter a phone number (e.g., `478-555-0001` through `478-555-0005`), select phone type.
3. Save. Confirm phone appears in the contacts list.

**Expected Results:** Phone numbers added and displayed with type labels.

---

### CON-02: Add Email Addresses to Voters [Extended]

**Steps:**
1. For 5 voters, add email addresses via Contacts tab → "Add Email."
2. Enter emails (e.g., `voter1@test.local`). Save and confirm.

**Expected Results:** Emails added and displayed correctly.

---

### CON-03: Add Mailing Addresses to Voters [Extended]

**Steps:**
1. For 5 voters, add mailing addresses via Contacts tab → "Add Address."
2. Fill in line1, city, state, zip. Save and confirm.

**Expected Results:** Mailing addresses added and displayed correctly.

---

### CON-04: Edit Contacts [Extended]

**Steps:**
1. For 3 voters with added contacts, edit:
   - A phone number (change the number or type).
   - An email (change the address).
   - A mailing address (change a field).
2. Save each. Confirm changes are reflected.

**Expected Results:** Contact edits persist.

---

### CON-05: Delete Contacts [Extended]

**Steps:**
1. For 3 voters, delete their added phone, email, and mailing address.
2. Confirm each is removed from the Contacts tab.

**Expected Results:** Contacts permanently removed.

---

### CON-06: Validate Imported Contact Data [Extended]

**Preconditions:** IMP-01 complete.

**Steps:**
1. Find 5 voters from the CSV with a cell phone number. Navigate to Contacts tab. Confirm phone matches CSV.
2. Find 5 voters from CSV WITHOUT a cell phone. Confirm Contacts tab shows no phone.
3. Repeat for mailing addresses (5 with, 5 without).

**Expected Results:** Imported contact data matches source CSV.

---

## 12. Voter Tags

### TAG-01: Create Voter Tags [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters` → Tags section.
2. Create 5 tags: "Priority Voter", "Door Knocked", "Phone Contacted", "Supporter", "Undecided".
3. Confirm each appears in the tag list.

**Expected Results:** 5 voter tags created.

---

### TAG-02: Add Tags to Voters [Extended]

**Steps:**
1. For 10 voters, navigate to their detail page → Tags tab.
2. Add 1–3 of the 5 created tags to each voter.
3. Confirm tags appear as badges on the Tags tab.

**Expected Results:** Tags applied and visible on voter detail pages.

---

### TAG-03: Validate Tags Appear on Voters [Extended]

**Steps:**
1. For 5 tagged voters, navigate to their detail page.
2. Confirm the Tags tab shows the exact tags assigned in TAG-02.

**Expected Results:** Tag assignments persistent and visible.

---

### TAG-04: Remove Tags from Voters [Extended]

**Steps:**
1. For 5 voters, navigate to Tags tab. Remove all assigned tags (click X on each badge).
2. Confirm Tags tab shows no tags.

**Expected Results:** Tags removed.

---

### TAG-05: Delete Voter Tags [Extended]

**Steps:**
1. Navigate to voter tags management page.
2. Delete all 5 test tags.
3. Confirm tag list no longer shows them.
4. Navigate to a previously-tagged voter — confirm their tags are gone.

**Expected Results:** Tags permanently deleted. Removed from all voters.

---

## 13. Voter Notes (Interactions)

### NOTE-01: Add Notes to Voters [Extended]

**Steps:**
1. For 5 voters, navigate to detail page → click "Add Interaction" button.
2. For each voter, add 2 notes with different text:
   - "Initial contact - friendly"
   - "Confirmed supporter"
3. Confirm each note appears in the History tab with text, author (user display name), and timestamp.

**Expected Results:** Notes created and displayed in History tab.

---

### NOTE-02: Edit Notes [Extended]

**Preconditions:** Note edit feature implemented.

**Steps:**
1. For 3 voters from NOTE-01, navigate to History tab.
2. Find a note → click Edit → change note text (append " - UPDATED") → Save.
3. Confirm updated text displayed. Confirm original timestamp preserved or "edited" indicator shown.

**Expected Results:** Notes editable. Changes persist.

---

### NOTE-03: Delete Notes [Extended]

**Preconditions:** Note delete feature implemented.

**Steps:**
1. For the 5 voters from NOTE-01, delete all test notes.
2. Confirm History tab no longer shows the deleted notes.
3. Confirm system-generated interactions (import events, tag additions) are NOT affected.

**Expected Results:** Test notes deleted. System interactions remain.

---

## 14. Voter Lists

### VLIST-01: Create a Static Voter List [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/voters` → Lists section.
2. Click "Create List." Enter name "E2E Static Test List", type = Static.
3. Save. Confirm list appears.

**Expected Results:** Static voter list created (empty).

---

### VLIST-02: Add Voters to Static List [Extended]

**Steps:**
1. Open "E2E Static Test List" detail page.
2. Click "+ Add Voters." In the dialog, search and select 10 voters.
3. Confirm the list now shows 10 members.

**Expected Results:** Voters added to static list.

---

### VLIST-03: Remove Voters from Static List [Extended]

**Steps:**
1. On the static list detail page, remove 3 voters.
2. Confirm list count decreases to 7.
3. Confirm removed voters still exist as voters (not deleted).

**Expected Results:** Voters removed from list. Still exist as voters.

---

### VLIST-04: Create a Dynamic Voter List [Extended]

**Steps:**
1. Create a new list: name "E2E Dynamic Test List", type = Dynamic.
2. Define filter criteria: Party = "Democrat" AND Age > 30.
3. Save. Navigate to list detail page. Confirm voters matching the criteria are shown.

**Expected Results:** Dynamic list auto-populates based on filter criteria.

---

### VLIST-05: Edit a List Name [Extended]

**Steps:**
1. Find "E2E Static Test List." Click edit. Rename to "E2E Static Test List (Renamed)."
2. Save. Confirm name updates.

**Expected Results:** List rename persists.

---

### VLIST-06: Delete Voter Lists [Extended]

**Steps:**
1. Delete "E2E Static Test List (Renamed)."
2. Delete "E2E Dynamic Test List."
3. Confirm both removed. Voters in those lists NOT deleted.

**Expected Results:** Lists permanently deleted.

---

## 15. Canvassing — Turfs

### TURF-01: Create 5 Non-Overlapping Turfs [Extended]

**Preconditions:** Logged in as `manager1@localhost`. Macon-Bibb campaign loaded.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing` → click "New Turf."
2. Create the following 5 turfs (draw non-overlapping polygons in Bibb County, GA — center: 32.84°N, 83.63°W):
   - "E2E Turf North" — northern Bibb County
   - "E2E Turf South" — southern area
   - "E2E Turf East" — eastern area
   - "E2E Turf West" — western area
   - "E2E Turf Central" — central area
3. For each turf: confirm it appears in the canvassing turfs table and shows a voter count.

**Expected Results:** 5 non-overlapping turfs created with voter counts.

---

### TURF-02: Create Overlapping Turfs [Extended]

**Steps:**
1. Create 3 turfs that intentionally overlap with the first 5:
   - "E2E Overlap NE" — overlapping North and East
   - "E2E Overlap SW" — overlapping South and West
   - "E2E Overlap Center" — overlapping Central
2. For each, confirm the overlap detection highlights overlapping areas during creation.
3. Confirm turfs can be saved despite overlaps.

**Expected Results:** Overlapping turfs created. Overlap detection works visually.

---

### TURF-03: Edit Turf Boundaries [Extended]

**Steps:**
1. Navigate to "E2E Turf North" detail page. Click Edit.
2. Drag a polygon vertex to adjust the boundary.
3. Save. Confirm updated boundary reflected. Voter count may change.
4. Repeat for "E2E Turf East."

**Expected Results:** Turf boundaries update. Voter counts recalculate.

---

### TURF-04: GeoJSON Import [Extended]

**Steps:**
1. Create a simple GeoJSON Polygon file for a turf boundary in Macon, GA.

   Example GeoJSON content:
   ```json
   {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-83.65,32.85],[-83.60,32.85],[-83.60,32.82],[-83.65,32.82],[-83.65,32.85]]]},"properties":{}}
   ```

2. Navigate to New Turf page. Use the GeoJSON import feature to upload/paste the file.
3. Confirm polygon renders on the map from the GeoJSON data.
4. Save the turf as "E2E GeoJSON Import Turf."

**Expected Results:** GeoJSON import creates a valid turf boundary.

---

### TURF-05: GeoJSON Export [Extended]

**Steps:**
1. Navigate to an existing turf detail page (e.g., "E2E Turf North").
2. Click the GeoJSON export button.
3. Confirm a .geojson file is downloaded.
4. Open/inspect the file. Confirm it contains a valid Polygon geometry.

**Expected Results:** Exported GeoJSON is valid and matches the turf boundary.

---

### TURF-06: Address Search on Turf Map [Extended]

**Steps:**
1. Navigate to turf creation or edit page.
2. Use the address search input.
3. Type "478 Mulberry St, Macon, GA" or a known Bibb County address.
4. Confirm the map pans/zooms to the searched address.

**Expected Results:** Address search locates and centers on the searched address.

---

### TURF-07: Delete Turfs [Extended]

**Steps:**
1. Navigate to canvassing page.
2. Delete "E2E Overlap SW" and "E2E Overlap Center" via row action → Delete.
3. Confirm deletion dialog. Confirm.
4. Confirm they are removed from the turfs table and overview map.

**Expected Results:** Turfs permanently deleted.

---

## 16. Canvassing — Walk Lists

### WL-01: Generate a Walk List from a Turf [Extended]

**Preconditions:** "E2E Turf North" exists with voters.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing`.
2. Click "Generate Walk List."
3. Select "E2E Turf North" as source turf.
4. Enter name "E2E Walk List North."
5. Click Generate / Confirm.
6. Confirm walk list appears with voter count.

**Expected Results:** Walk list generated with voters from the turf.

---

### WL-02: View Walk List Details [Extended]

**Steps:**
1. Click "E2E Walk List North" to open detail page.
2. Confirm: walk list entries with voter names and addresses, household-clustered ordering, status indicators, Google Maps navigation link.

**Expected Results:** Walk list detail shows all entries correctly.

---

### WL-03: Assign Canvassers to Walk List [Extended]

**Steps:**
1. On "E2E Walk List North" detail page, click "Assign Canvasser."
2. Select `volunteer1@localhost` from the member picker.
3. Assign `volunteer2@localhost` as well.
4. Confirm both appear in the assignment section.

**Expected Results:** Multiple canvassers assigned.

---

### WL-04: Unassign a Canvasser [Extended]

**Steps:**
1. Remove `volunteer2@localhost` from walk list assignment.
2. Confirm they are no longer listed.

**Expected Results:** Canvasser unassigned.

---

### WL-05: Rename a Walk List [Extended]

**Preconditions:** Walk list rename feature implemented.

**Steps:**
1. On walk list detail page or canvassing index, find the rename/edit action.
2. Rename "E2E Walk List North" to "E2E Walk List North (Updated)."
3. Save. Confirm name updates.

**Expected Results:** Walk list name updated.

---

### WL-06: Delete a Walk List [Extended]

**Steps:**
1. Delete "E2E Walk List North (Updated)" via row action → Delete.
2. Confirm deletion dialog.
3. Confirm removed from the table.

**Expected Results:** Walk list permanently deleted.

---

### WL-07: Create Walk List for Further Testing [Extended]

**Steps:**
1. Generate a new walk list from "E2E Turf East" named "E2E Walk List — Active."
2. Assign `volunteer1@localhost` as canvasser.

**Expected Results:** Walk list ready for field mode testing.

---

## 17. Phone Banking — Call Lists

### CL-01: Create a Call List [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/call-lists`.
2. Click "New Call List."
3. Enter name "E2E Call List 1." Select a voter list or use filter criteria.
4. Confirm DNC filtering is applied.
5. Save. Confirm call list appears with entry count.

**Expected Results:** Call list created with voters (DNC excluded).

---

### CL-02: View Call List Details [Extended]

**Steps:**
1. Click "E2E Call List 1."
2. Confirm: entries list (voter names, phone numbers), status tabs/filters, entry count.

**Expected Results:** Call list detail page shows all entries.

---

### CL-03: Edit a Call List [Extended]

**Steps:**
1. Edit "E2E Call List 1" name to "E2E Call List 1 (Updated)."
2. Save. Confirm name updates.

**Expected Results:** Call list name update persists.

---

### CL-04: Delete a Call List [Extended]

**Steps:**
1. Create throwaway call list "E2E Call List — Delete Me."
2. Delete it via row action.
3. Confirm removed from list.

**Expected Results:** Call list permanently deleted.

---

### CL-05: Create Call List for Further Testing [Extended]

**Steps:**
1. Create "E2E Active Call List" with sufficient voters for phone banking sessions.

**Expected Results:** Call list ready for session testing.

---

## 18. Phone Banking — DNC

### DNC-01: Add a Single Phone to DNC [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/dnc` (or DNC section).
2. Click "Add Number."
3. Enter phone number `478-555-9001` and reason "Requested removal."
4. Save. Confirm number appears in DNC list.

**Expected Results:** Number added to DNC.

---

### DNC-02: Bulk Add to DNC [Extended]

**Steps:**
1. Click "Bulk Import" or "Import DNC."
2. Upload a CSV with 5 phone numbers (format: phone, reason).
3. Confirm all 5 numbers appear in the DNC list.

**Expected Results:** Bulk DNC import works.

---

### DNC-03: Add Voter Phone Numbers to DNC [Extended]

**Steps:**
1. Find 3 voters with phone numbers in the system.
2. Note their numbers.
3. Add all 3 to the DNC list.
4. Confirm they appear in the DNC list.

**Expected Results:** Voter phone numbers on DNC list.

---

### DNC-04: Verify DNC Enforcement in Call Lists [Extended]

**Steps:**
1. Create a new call list from a voter list that includes the 3 DNC'd voters.
2. Confirm none of the 3 DNC'd phone numbers appear in the call list entries.

**Expected Results:** DNC filtering prevents DNC'd numbers from appearing in call lists.

---

### DNC-05: Delete DNC Entries [Extended]

**Steps:**
1. Delete 2 of the 3 DNC entries added in DNC-03.
2. Confirm they are removed from the DNC list.
3. Create a new call list — confirm the 2 removed numbers now appear.

**Expected Results:** Removing DNC entries re-enables those numbers.

---

### DNC-06: Search DNC List [Extended]

**Steps:**
1. With multiple DNC entries, type a partial phone number in the DNC search field.
2. Confirm the list filters to show matching entries.

**Expected Results:** DNC search filters correctly.

---

## 19. Phone Banking — Sessions

### PB-01: Create a Phone Banking Session [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/sessions`.
2. Click "New Session."
3. Enter name "E2E Session 1." Select "E2E Active Call List." Optionally attach a survey.
4. Save. Confirm session appears in sessions list.

**Expected Results:** Session created.

---

### PB-02: Assign Callers to Session [Extended]

**Steps:**
1. Open "E2E Session 1" detail page.
2. Click "Add Caller." Select `volunteer1@localhost`, `volunteer2@localhost`, `manager1@localhost`.
3. Confirm all three appear in the callers section.

**Expected Results:** Three callers assigned.

---

### PB-03: Remove a Caller [Extended]

**Steps:**
1. Remove `manager1@localhost` from the session.
2. Confirm they are no longer listed.

**Expected Results:** Caller removed.

---

### PB-04: Create Multiple Phone Banking Sessions [Extended]

**Steps:**
1. Create 3 additional sessions: "E2E Session 2" (assign volunteer1), "E2E Session 3" (assign volunteer2), "E2E Session 4" (assign both volunteers).

**Expected Results:** Sessions created with correct assignments.

---

### PB-05: Verify Caller Access Per User [Extended]

**Steps:**
1. Log in as `volunteer1@localhost`. Navigate to Phone Banking → My Sessions or Sessions list.
2. Confirm only sessions where volunteer1 is assigned appear.
3. Log in as `volunteer2@localhost`. Confirm only their assigned sessions appear.

**Expected Results:** Each user sees only their assigned sessions.

---

### PB-06: Active Calling — Claim and Record a Call [Extended]

**Preconditions:** Logged in as `volunteer1@localhost`. "E2E Session 1" is active.

**Steps:**
1. Navigate to "E2E Session 1" detail page.
2. Click "Start Calling."
3. Confirm calling screen shows voter name and phone number, outcome buttons, and survey questions (if script attached).
4. Select outcome "Supporter."
5. If survey present, answer questions.
6. Submit the outcome.
7. Confirm screen auto-advances to next call.

**Expected Results:** Call claimed, outcome recorded, screen advances.

---

### PB-07: Skip a Call [Extended]

**Steps:**
1. On the calling screen, click "Skip."
2. Confirm screen advances to next call without recording outcome.

**Expected Results:** Call skipped and remains available.

---

### PB-08: Session Progress [Extended]

**Steps:**
1. Make several calls in "E2E Session 1" (record outcomes for 3–5 calls).
2. Confirm progress indicator updates (e.g., "5/50 calls completed").
3. Navigate back to session detail. Confirm progress reflected there.

**Expected Results:** Progress tracking accurate and consistent.

---

### PB-09: Edit a Session [Extended]

**Steps:**
1. Edit "E2E Session 1" — change name to "E2E Session 1 (Updated)." Save.
2. Confirm name updates.

**Expected Results:** Session edit persists.

---

### PB-10: Delete a Session [Extended]

**Steps:**
1. Create throwaway session "E2E Session — Delete." Delete it. Confirm removed.

**Expected Results:** Session permanently deleted.

---

## 20. Surveys

### SRV-01: Create a Survey Script [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/surveys`.
2. Click "New Survey" (+).
3. Enter title: "E2E Voter Sentiment Survey." Description: "Standard survey for canvassing and phone banking."
4. Save. Confirm it appears with "draft" status badge.

**Expected Results:** Survey created in draft status.

---

### SRV-02: Add Questions to a Survey [Extended]

**Steps:**
1. Open "E2E Voter Sentiment Survey" detail page.
2. Add the following questions:
   - Q1: "What is the most important issue to you?" (Multiple Choice: Economy, Healthcare, Education, Environment, Public Safety)
   - Q2: "How likely are you to vote in the next election?" (Scale: 1–10)
   - Q3: "Would you like to volunteer for the campaign?" (Multiple Choice: Yes, No, Maybe)
   - Q4: "How would you rate the current administration?" (Scale: 1–5)
3. Confirm each question appears with correct type and options.

**Expected Results:** 4 questions added.

---

### SRV-03: Edit a Question [Extended]

**Steps:**
1. Edit Q1 — change one option (e.g., "Environment" to "Climate Policy").
2. Save. Confirm the change persists.

**Expected Results:** Question edit saved.

---

### SRV-04: Reorder Questions [Extended]

**Steps:**
1. Move Q4 to be Q2 (use drag or reorder buttons).
2. Confirm new order is: Q1, Q4 (now 2nd), Q2 (now 3rd), Q3 (now 4th).

**Expected Results:** Question order updates and persists.

---

### SRV-05: Delete a Question [Extended]

**Steps:**
1. Delete the last question (Q3 in new order — "Would you like to volunteer?").
2. Confirm it's removed. 3 questions remain.

**Expected Results:** Question deleted.

---

### SRV-06: Change Survey Status [Extended]

**Steps:**
1. Change "E2E Voter Sentiment Survey" status from "draft" to "active." Confirm badge changes.
2. Change to "archived." Confirm badge changes.
3. Change back to "active" for use in other tests.

**Expected Results:** Status lifecycle works: draft → active → archived → active.

---

### SRV-07: Create Additional Surveys for Testing [Extended]

**Steps:**
1. Create 3 more surveys and set to "active":
   - "E2E Canvassing Script" (2 questions: sentiment scale + free text)
   - "E2E Phone Banking Script" (2 questions: supporter yes/no + follow-up)
   - "E2E Short Survey" (1 question: multiple choice)

**Expected Results:** 4 active surveys available for use in sessions and field mode.

---

### SRV-08: Delete a Survey [Extended]

**Steps:**
1. Create throwaway survey "E2E Survey — Delete." Delete it. Confirm removed.

**Expected Results:** Survey permanently deleted.

---

## 21. Volunteers

### VOL-01: Register a User Volunteer (Record Mode) [Extended]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers`.
2. Click "Register" or "Add Volunteer." Select "Record only" mode.
3. Link to an existing user account (select `volunteer1@localhost`).
4. Add skills: "Canvassing", "Phone Banking."
5. Save. Confirm volunteer appears in the roster.

**Expected Results:** User volunteer created and linked to user account.

---

### VOL-02: Register a Non-User Volunteer (Record Mode) [Extended]

**Steps:**
1. Navigate to Volunteers → Register. Select "Record only" mode.
2. Enter: First Name=Non-User, Last Name=VolA, Email=nonuser.vola@test.local, Phone=478-555-0100.
3. Add skills, notes.
4. Save. Confirm in roster.

**Expected Results:** Non-user volunteer created.

---

### VOL-03: Register via Invite Mode [Extended]

**Steps:**
1. Navigate to Volunteers → Register. Select "Invite to app" mode.
2. Enter new volunteer info with email.
3. Submit. Confirm volunteer record created (email invite may show toast).

**Expected Results:** Volunteer record created with invite flag.

---

### VOL-04: Create Additional Volunteers [Extended]

**Steps:**
1. Create 3 more non-user volunteers: "Non-User VolB" (minimal data), "Non-User VolC" (with availability preferences), "Non-User VolD" (with special skills).

**Expected Results:** 5+ volunteers in roster total.

---

### VOL-05: View Volunteer Roster [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers`.
2. Confirm all created volunteers appear in the roster table.
3. Confirm table shows: name, email/phone, skills, status.
4. Search by name. Confirm filtering works.

**Expected Results:** Roster displays all volunteers. Searchable.

---

### VOL-06: View Volunteer Detail Page [Extended]

**Steps:**
1. Click on a volunteer in the roster.
2. Confirm detail page shows: name, contact info, skills, availability slots, assigned shifts, hours worked, tags.

**Expected Results:** Volunteer detail page shows comprehensive info.

---

### VOL-07: Edit a Volunteer [Extended]

**Steps:**
1. On a volunteer detail page, click Edit.
2. Change skills or contact info.
3. Save. Confirm changes persist.

**Expected Results:** Volunteer edits saved.

---

### VOL-08: Delete a Volunteer [Extended]

**Steps:**
1. Create throwaway volunteer "E2E Vol — Delete." Delete them. Confirm removed from roster.

**Expected Results:** Volunteer permanently deleted.

---

## 22. Volunteer Tags

### VTAG-01: Create Volunteer Tags [Extended]

**Steps:**
1. Navigate to Volunteers → Tags.
2. Create 5 tags: "Canvasser", "Phone Banker", "Bilingual", "Experienced", "Weekend Only."
3. Confirm all 5 appear in the tag list.

**Expected Results:** 5 volunteer tags created.

---

### VTAG-02: Assign Tags to Volunteers [Extended]

**Steps:**
1. For 5 volunteers, navigate to their detail page. Assign 1–3 tags each.
2. Confirm tags appear on each volunteer.

**Expected Results:** Tags assigned to volunteers.

---

### VTAG-03: Edit Volunteer Tags [Extended]

**Steps:**
1. For 3 tagged volunteers, remove one tag and add a different one.
2. Confirm changes persist.

**Expected Results:** Tag changes saved.

---

### VTAG-04: Remove All Tags from a Volunteer [Extended]

**Steps:**
1. For 2 volunteers, remove ALL assigned tags.
2. Confirm their tag sections are empty.

**Expected Results:** Tags fully removed.

---

### VTAG-05: Delete Volunteer Tags [Extended]

**Steps:**
1. Navigate to Volunteers → Tags. Delete all 5 test tags.
2. Confirm removed from tag list.
3. Navigate to a previously-tagged volunteer — confirm their tags are gone.

**Expected Results:** Deleting a tag removes it from all volunteers.

---

## 23. Volunteer Availability

### AVAIL-01: Set Availability for Volunteers [Extended]

**Steps:**
1. For 3 volunteers, navigate to their detail page → click "Add Availability."
2. Set availability slots (e.g., "Saturday 9am–1pm", "Sunday 2pm–6pm").
3. Save. Confirm availability appears on detail page.

**Expected Results:** Availability slots set and displayed.

---

### AVAIL-02: Edit Availability [Extended]

**Steps:**
1. For 2 volunteers, edit their availability times.
2. Confirm changes persist.

**Expected Results:** Availability edits saved.

---

### AVAIL-03: Delete Availability [Extended]

**Steps:**
1. For 1 volunteer, remove all availability slots.
2. Confirm availability section is empty.

**Expected Results:** Availability cleared.

---

## 24. Shifts

### SHIFT-01: Create Shifts [Extended]

**Preconditions:** Logged in as `manager1@localhost`.

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers/shifts`.
2. Create 5 shifts with varying dates and capacity:
   - Shift A: tomorrow morning (9am–12pm), capacity 5
   - Shift B: tomorrow afternoon (1pm–5pm), capacity 5
   - Shift C: day after tomorrow morning, capacity 3
   - Shift D: next week morning, capacity 10
   - Shift E: next week afternoon, capacity 2
3. Confirm each shift appears in the shifts list, grouped by date.

**Expected Results:** 5 shifts created with correct dates, times, and capacity.

---

### SHIFT-02: Assign Volunteers to Shifts [Extended]

**Steps:**
1. For each of the 5 shifts, navigate to the shift detail page.
2. Assign at least 1 volunteer.
3. Confirm assigned volunteers appear on the shift roster.

**Expected Results:** Volunteers assigned to shifts.

---

### SHIFT-03: Validate Availability Enforcement [Extended]

**Steps:**
1. Take 2 volunteers who have availability set (from AVAIL-01).
2. Attempt to assign them to shifts within their availability window. Confirm success.
3. Attempt to assign them to shifts outside their availability window.
4. Observe: confirm UI either warns, blocks, or allows. Document actual behavior.

**Expected Results:** Availability is enforced (blocking) or advisory (warning). Behavior documented.

---

### SHIFT-04: Check In a Volunteer [Extended]

**Steps:**
1. Navigate to a shift detail page where `volunteer1@localhost` is assigned.
2. Click "Check In" for Volunteer1.
3. Confirm check-in time recorded. Status changes to "checked in."

**Expected Results:** Check-in time captured.

---

### SHIFT-05: Check Out a Volunteer [Extended]

**Steps:**
1. On the same shift, click "Check Out" for Volunteer1.
2. Confirm check-out time recorded.
3. Confirm hours worked calculated (checkout minus checkin).

**Expected Results:** Check-out recorded. Hours calculated.

---

### SHIFT-06: View Volunteer Hours [Extended]

**Steps:**
1. Navigate to `volunteer1@localhost`'s volunteer detail page.
2. Confirm hours section shows the hours logged from the shift.

**Expected Results:** Hours tracking accurate.

---

### SHIFT-07: Adjust Hours [Extended]

**Steps:**
1. On the shift detail page, find a checked-in/out volunteer.
2. Use the hours adjustment feature to modify their hours.
3. Confirm adjusted hours reflected.

**Expected Results:** Manual hours adjustment works.

---

### SHIFT-08: Edit a Shift [Extended]

**Steps:**
1. Navigate to a shift detail. Edit the time or capacity.
2. Save. Confirm changes persist.

**Expected Results:** Shift edits saved.

---

### SHIFT-09: Delete a Shift [Extended]

**Steps:**
1. Create throwaway shift. Delete it. Confirm removed from shifts list.

**Expected Results:** Shift permanently deleted.

---

### SHIFT-10: Unassign a Volunteer from a Shift [Extended]

**Steps:**
1. On a shift detail page, unassign one volunteer.
2. Confirm they are removed from the roster.

**Expected Results:** Volunteer unassigned.

---

## 25–27. Field Mode

### FIELD-01: Access Field Mode as a Volunteer [Extended]

**Preconditions:** `volunteer1@localhost` is assigned to "E2E Walk List — Active" (WL-07) and "E2E Session 1" (PB-01).

**Steps:**
1. Log in as `volunteer1@localhost`.
2. Navigate to `${PROD_URL}/field/{campaign_id}`.
3. Confirm field hub loads with: welcome section, canvassing assignment card, phone banking session card, mobile-first layout (no admin sidebar).

**Expected Results:** Field hub shows assignments in clean mobile layout.

---

### FIELD-02: Pull-to-Refresh [Extended]

**Steps:**
1. On the field hub at `${PROD_URL}/field/{campaign_id}`, simulate a pull-to-refresh gesture (on mobile device or mobile emulation in browser).
2. Confirm data refreshes.

**Expected Results:** Pull-to-refresh updates assignment data.

---

### FIELD-03: Start Canvassing a Walk List [Extended]

**Steps:**
1. From the field hub, click "Start Canvassing" or the canvassing assignment card.
2. Confirm canvassing wizard loads with: voter name and address for first door, household grouping (if multiple voters at same address), progress indicator, Google Maps walking directions link.

**Expected Results:** Canvassing wizard shows first door with correct voter info.

---

### FIELD-04: Record Door Knock Outcomes [Extended]

**Steps:**
1. At the first door, select outcome "Contact Made — Supporter."
2. If a survey is attached, answer the questions.
3. Submit. Confirm auto-advance to next door.
4. Record different outcomes for next 5 doors: "Not Home", "Refused", "Contact Made — Undecided", "Contact Made — Opposed", "Moved / Wrong Address."

**Expected Results:** Each outcome recorded. Wizard advances door by door.

---

### FIELD-05: Canvassing Progress Tracking [Extended]

**Steps:**
1. After recording several doors, check the progress indicator.
2. Confirm it shows correct completed/total count.

**Expected Results:** Progress indicator accurate.

---

### FIELD-06: Canvassing Session Persistence [Extended]

**Steps:**
1. Mid-way through the walk list, close the browser tab.
2. Re-open `${PROD_URL}/field/{campaign_id}/canvassing`.
3. Confirm a resume prompt appears.
4. Resume. Confirm you're at the correct door (not restarted).

**Expected Results:** Session state persists via sessionStorage. Resume works.

---

### FIELD-07: Canvassing with Inline Survey [Extended]

**Preconditions:** Walk list associated with a survey script.

**Steps:**
1. At a door, select "Contact Made."
2. Confirm inline survey questions appear.
3. Answer each question and submit the combined outcome + survey response.

**Expected Results:** Survey responses recorded along with door knock outcome.

---

### FIELD-08: Start Phone Banking in Field Mode [Extended]

**Steps:**
1. From the field hub, tap "Start Phone Banking."
2. Confirm phone banking interface loads with: voter name and phone number, "Call" button (tel: link), outcome buttons, survey questions (if attached), progress indicator.

**Expected Results:** Phone banking field mode loads with correct voter data.

---

### FIELD-09: Tap to Call [Extended]

**Steps:**
1. Click/tap the "Call" button.
2. On mobile: confirm `tel:` link opens phone dialer.
3. On desktop: confirm clipboard fallback copies the phone number (check clipboard content).
4. Confirm phone number is in E.164 format (e.g., `+14785550001`).

**Expected Results:** Call initiation works via tel: link (mobile) or clipboard copy (desktop).

---

### FIELD-10: Record Phone Outcome [Extended]

**Steps:**
1. After the call, select an outcome from the grouped outcome buttons.
2. If survey attached, answer questions.
3. Submit. Confirm auto-advance to next voter.

**Expected Results:** Outcome recorded. Advances to next voter.

---

## 28. Offline Support

### OFFLINE-01: Offline Banner [Extended]

**Preconditions:** In field mode at `${PROD_URL}/field/{campaign_id}`.

**Steps:**
1. Disable network connectivity (in browser DevTools, Network tab → "Offline").
2. Confirm an offline banner/indicator appears.

**Expected Results:** Offline banner visible when disconnected.

**Production note:** Service worker behavior may differ over HTTPS vs localhost. Over HTTPS (production), service workers are fully enabled, which may cause different caching behavior than local dev.

---

### OFFLINE-02: Queue Outcomes While Offline [Extended]

**Steps:**
1. While offline, record 3 door knock outcomes.
2. Confirm each shows a "queued" indicator.
3. Confirm offline queue count shows "3 pending."

**Expected Results:** Outcomes queued in localStorage.

---

### OFFLINE-03: Auto-Sync on Reconnection [Extended]

**Steps:**
1. Re-enable network connectivity.
2. Confirm queued outcomes automatically sync.
3. Confirm offline banner disappears.
4. Confirm synced outcomes appear in voter interaction histories.

**Expected Results:** Outcomes sync automatically. Data consistent.

---

## 29. Onboarding Tour

### TOUR-01: First-Time Onboarding Tour [Extended]

**Steps:**
1. Log in as a user who has never used field mode before (or clear tour state in localStorage).
2. Navigate to `${PROD_URL}/field/{campaign_id}`.
3. Confirm driver.js guided tour starts automatically.
4. Step through each tour step (welcome, canvassing overview, phone banking overview).
5. Confirm each step highlights the correct UI element.
6. Complete the tour.

**Expected Results:** Tour completes without errors.

---

### TOUR-02: Replay Tour via Help Button [Extended]

**Steps:**
1. After completing the tour, find the help / "?" button.
2. Click it. Confirm the tour replays from the beginning.

**Expected Results:** Help button triggers tour replay.

---

### TOUR-03: Tour Completion Persists [Extended]

**Steps:**
1. Complete the tour. Refresh the page.
2. Confirm the tour does NOT auto-start again.

**Expected Results:** Tour completion persisted per user (localStorage or user preference).

---

## 30. Navigation and Sidebar

### NAV-01: Campaign Sidebar Navigation [Extended]

**Preconditions:** Logged in as `owner1@localhost`. In the Macon-Bibb campaign.

**Steps:**
1. Click each sidebar link. Confirm correct page loads:
   - Dashboard → `${PROD_URL}/campaigns/{id}/dashboard`
   - Voters → `${PROD_URL}/campaigns/{id}/voters`
   - Canvassing → `${PROD_URL}/campaigns/{id}/canvassing`
   - Phone Banking → `${PROD_URL}/campaigns/{id}/phone-banking/call-lists`
   - Surveys → `${PROD_URL}/campaigns/{id}/surveys`
   - Volunteers → `${PROD_URL}/campaigns/{id}/volunteers`
   - Settings → `${PROD_URL}/campaigns/{id}/settings`
   - Field Operations → `${PROD_URL}/field/{id}` (if link exists)
2. Confirm active link is visually highlighted.
3. On mobile viewport (≤768px), confirm sidebar collapses / slides.

**Expected Results:** All nav links work. Active state shown. Mobile collapse works.

---

### NAV-02: Organization Navigation [Extended]

**Steps:**
1. From the sidebar, verify org navigation links:
   - All Campaigns → `${PROD_URL}` (org dashboard)
   - Members → `${PROD_URL}/org/members`
   - Settings → `${PROD_URL}/org/settings`

**Expected Results:** Org nav links work correctly.

---

### NAV-03: Breadcrumb / Back Navigation [Extended]

**Steps:**
1. Navigate to a voter detail page.
2. Use the browser back button. Confirm return to voter list.
3. Enter a deep URL directly: `${PROD_URL}/campaigns/{id}/voters`. Confirm page loads correctly.

**Expected Results:** Back navigation and direct URL access work.

---

## 31. Empty States and Loading

### UI-01: Empty States on List Pages [Extended]

**Steps:**
1. Create a new campaign with no data added.
2. Navigate to each list page. Confirm contextual empty state messages and CTAs:
   - Voters: "No voters" with import CTA.
   - Turfs: "No turfs" with create CTA.
   - Walk Lists: "No walk lists" with generate CTA.
   - Call Lists: "No call lists" with create CTA.
   - DNC: "No DNC entries."
   - Sessions: "No sessions" with create CTA.
   - Surveys: "No surveys" with create CTA.
   - Volunteers Roster: "No volunteers" with register CTA.
   - Shifts: "No shifts" with create CTA.
   - Voter Tags: "No tags" with create CTA.
   - Volunteer Tags: "No tags" with create CTA.
   - Voter Lists: "No lists" with create CTA.
   - Import History: "No imports" with import CTA.

**Expected Results:** Each empty state has an icon, relevant message, and CTA button.

---

### UI-02: Loading Skeletons [Extended]

**Steps:**
1. Navigate to each major page. Throttle network in DevTools if needed to observe loading state.
2. Confirm layout-matching skeleton loaders appear (not just a centered spinner).

**Expected Results:** Skeleton loaders match page layout.

---

### UI-03: Error Boundary [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/00000000-0000-0000-0000-000000000000/dashboard`.
2. Confirm a RouteErrorBoundary renders with a card-based error UI.
3. Confirm a way to navigate back (home link or retry button).

**Expected Results:** Error boundary catches route errors gracefully. Navigation recovery available.

---

## 32. Dashboard Drilldowns

### DRILL-01: Canvassing Dashboard [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/canvassing`.
2. Confirm: turf overview map (if turfs exist), turfs table with voter counts, walk lists table with progress indicators.

**Expected Results:** Canvassing overview data accurate.

---

### DRILL-02: Phone Banking Dashboard [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/phone-banking/call-lists`.
2. Confirm call lists shown with entry counts and status.
3. Navigate to Sessions. Confirm sessions shown with caller counts and progress.

**Expected Results:** Phone banking data accurate.

---

### DRILL-03: Volunteer Dashboard [Extended]

**Steps:**
1. Navigate to `${PROD_URL}/campaigns/{campaign_id}/volunteers`.
2. Confirm volunteer section navigation works: Roster, Registration, Shifts, Tags tabs/sections.
3. Confirm stats or counts are shown.

**Expected Results:** Volunteer section navigation correct.

---

## 33. Accessibility (Spot Checks)

### A11Y-01: Axe-Core Scan on Key Pages [Extended]

**Steps (Playwright CLI):**

```bash
cd web
npx playwright test \
  --project=chromium \
  --base-url="${PROD_URL}" \
  --workers=1 \
  a11y.spec.ts
```

**Manual alternative:** Use the axe DevTools browser extension on:
- `${PROD_URL}/campaigns/{id}/dashboard`
- `${PROD_URL}/campaigns/{id}/voters`
- `${PROD_URL}/campaigns/{id}/canvassing`

Confirm no critical (WCAG Level A) violations. Log any violations found.

**Expected Results:** No critical WCAG 2.1 Level A violations.

---

### A11Y-02: Touch Targets [Extended]

**Steps:**
1. On a mobile viewport (375×667, iPhone SE) or mobile device, confirm all interactive elements have at least 44px tap targets.
2. Test: buttons, links, checkboxes, radio buttons, dropdown triggers, tag dismiss buttons.

**Expected Results:** All touch targets meet 44px minimum.

---

### A11Y-03: ARIA Landmarks and Keyboard Navigation [Extended]

**Steps:**
1. Navigate the app using only keyboard (Tab, Shift+Tab, Enter, Escape, Arrow keys).
2. Confirm all interactive elements reachable via Tab.
3. Confirm focus indicators visible.
4. Confirm dialogs trap focus (Tab cycles within the dialog).
5. Confirm Escape closes modals/sheets/dialogs.
6. Confirm skip nav link accessible (Tab from page top).
7. Inspect ARIA landmarks (main, nav, banner): confirm proper structure.

**Expected Results:** Full keyboard operability. ARIA structure correct.

---

## 34. Cross-Cutting Validations

### CROSS-01: Form Navigation Protection [Extended]

**Steps:**
1. Start filling out a voter creation form (`${PROD_URL}/campaigns/{id}/voters/new` or via the Add Voter sheet).
2. Without saving, click a sidebar link to navigate away.
3. Confirm a navigation guard dialog appears: "You have unsaved changes."
4. Click "Stay" — confirm you remain on the form.
5. Click "Leave" — confirm navigation proceeds. Form data lost.
6. Test browser back button with an unsaved form — confirm `beforeunload` warning.

**Expected Results:** Form guard prevents accidental data loss. Dialogs function on all navigation attempts.

---

### CROSS-02: Toast Notifications [Extended]

**Steps:**
1. Create a voter tag: confirm success toast.
2. Edit a voter: confirm success toast.
3. Delete a voter tag: confirm success toast.
4. Attempt an action that should fail (e.g., create a voter with duplicate voter_file_id): confirm error toast.
5. Confirm all toasts auto-dismiss after 3–5 seconds.
6. Confirm toasts are manually dismissible (click X).

**Expected Results:** Consistent success/error toasts for all operations. Auto-dismiss and manual dismiss work.

---

### CROSS-03: Rate Limiting [Extended]

**Steps:**
1. Rapidly perform 35+ voter searches or API calls within 60 seconds (rate limit is 30 requests/minute per user for search endpoints).
2. Confirm a 429 Too Many Requests error is returned (either as an API error or a UI message).
3. Wait 60 seconds. Confirm access is restored.

**Playwright CLI approach:**
```bash
# Use a script to rapidly call the search endpoint
for i in $(seq 1 35); do
  curl -sf -o /dev/null -w "%{http_code}\n" \
    "${PROD_URL}/api/v1/campaigns/{campaign_id}/voters/search" \
    -H "Authorization: Bearer <access_token>" \
    -H "Content-Type: application/json" \
    -d '{"filters":[],"sort_by":"last_name","sort_order":"asc","limit":10}'
done
```

**Expected Results:** 429 response received after exceeding rate limit. Access restored after cooldown.

**Production note:** Rate limiting uses `CF-Connecting-IP` for trusted proxy header and JWT sub for per-user keys. Behavior is consistent across production cluster nodes.

---

## Execution Results

Fill in Status (PASS / FAIL / SKIP) and Notes as you execute each test. Leave Status blank until executed.

| Test ID | Suite | Status | Notes |
|---------|-------|--------|-------|
| HEALTH-01 | Health | | |
| HEALTH-02 | Health | | |
| HEALTH-03 | Health | | |
| HEALTH-04 | Health | | |
| HEALTH-05 | Health | | |
| HEALTH-06 | Health | | |
| SMOKE-HEALTH-01 | Smoke | | |
| SMOKE-AUTH-01 | Smoke | | |
| SMOKE-RBAC-01 | Smoke | | |
| SMOKE-ORG-01 | Smoke | | |
| SMOKE-DASH-01 | Smoke | | |
| SMOKE-VCRUD-01 | Smoke | | |
| SMOKE-FLT-01 | Smoke | | |
| SMOKE-IMP-01 | Smoke | | |
| SMOKE-TURF-01 | Smoke | | |
| SMOKE-WL-01 | Smoke | | |
| SMOKE-CL-01 | Smoke | | |
| SMOKE-PB-01 | Smoke | | |
| SMOKE-SRV-01 | Smoke | | |
| SMOKE-VOL-01 | Smoke | | |
| SMOKE-SHIFT-01 | Smoke | | |
| SMOKE-FIELD-01 | Smoke | | |
| SMOKE-NAV-01 | Smoke | | |
| SMOKE-CROSS-01 | Smoke | | |
| SMOKE-A11Y-01 | Smoke | | |
| AUTH-01 | Extended | | |
| AUTH-02 | Extended | | |
| AUTH-03 | Extended | | |
| AUTH-04 | Extended | | |
| RBAC-01 | Extended | | |
| RBAC-02 | Extended | | |
| RBAC-03 | Extended | | |
| RBAC-04 | Extended | | |
| RBAC-05 | Extended | | |
| RBAC-06 | Extended | | |
| RBAC-07 | Extended | | |
| RBAC-08 | Extended | | |
| RBAC-09 | Extended | | |
| ORG-01 | Extended | | |
| ORG-02 | Extended | | |
| ORG-03 | Extended | | |
| ORG-04 | Extended | | |
| ORG-05 | Extended | | |
| ORG-06 | Extended | | |
| ORG-07 | Extended | | |
| ORG-08 | Extended | | |
| CAMP-01 | Extended | | |
| CAMP-02 | Extended | | |
| CAMP-03 | Extended | | |
| CAMP-04 | Extended | | |
| CAMP-05 | Extended | | |
| CAMP-06 | Extended | | |
| DASH-01 | Extended | | |
| DASH-02 | Extended | | |
| DASH-03 | Extended | | |
| IMP-01 | Extended | | |
| IMP-02 | Extended | | |
| IMP-03 | Extended | | |
| IMP-04 | Extended | | |
| VAL-01 | Extended | | |
| VAL-02 | Extended | | |
| FLT-01 | Extended | | |
| FLT-02 | Extended | | |
| FLT-03 | Extended | | |
| FLT-04 | Extended | | |
| FLT-05 | Extended | | |
| VCRUD-01 | Extended | | |
| VCRUD-02 | Extended | | |
| VCRUD-03 | Extended | | |
| VCRUD-04 | Extended | | |
| CON-01 | Extended | | |
| CON-02 | Extended | | |
| CON-03 | Extended | | |
| CON-04 | Extended | | |
| CON-05 | Extended | | |
| CON-06 | Extended | | |
| TAG-01 | Extended | | |
| TAG-02 | Extended | | |
| TAG-03 | Extended | | |
| TAG-04 | Extended | | |
| TAG-05 | Extended | | |
| NOTE-01 | Extended | | |
| NOTE-02 | Extended | | |
| NOTE-03 | Extended | | |
| VLIST-01 | Extended | | |
| VLIST-02 | Extended | | |
| VLIST-03 | Extended | | |
| VLIST-04 | Extended | | |
| VLIST-05 | Extended | | |
| VLIST-06 | Extended | | |
| TURF-01 | Extended | | |
| TURF-02 | Extended | | |
| TURF-03 | Extended | | |
| TURF-04 | Extended | | |
| TURF-05 | Extended | | |
| TURF-06 | Extended | | |
| TURF-07 | Extended | | |
| WL-01 | Extended | | |
| WL-02 | Extended | | |
| WL-03 | Extended | | |
| WL-04 | Extended | | |
| WL-05 | Extended | | |
| WL-06 | Extended | | |
| WL-07 | Extended | | |
| CL-01 | Extended | | |
| CL-02 | Extended | | |
| CL-03 | Extended | | |
| CL-04 | Extended | | |
| CL-05 | Extended | | |
| DNC-01 | Extended | | |
| DNC-02 | Extended | | |
| DNC-03 | Extended | | |
| DNC-04 | Extended | | |
| DNC-05 | Extended | | |
| DNC-06 | Extended | | |
| PB-01 | Extended | | |
| PB-02 | Extended | | |
| PB-03 | Extended | | |
| PB-04 | Extended | | |
| PB-05 | Extended | | |
| PB-06 | Extended | | |
| PB-07 | Extended | | |
| PB-08 | Extended | | |
| PB-09 | Extended | | |
| PB-10 | Extended | | |
| SRV-01 | Extended | | |
| SRV-02 | Extended | | |
| SRV-03 | Extended | | |
| SRV-04 | Extended | | |
| SRV-05 | Extended | | |
| SRV-06 | Extended | | |
| SRV-07 | Extended | | |
| SRV-08 | Extended | | |
| VOL-01 | Extended | | |
| VOL-02 | Extended | | |
| VOL-03 | Extended | | |
| VOL-04 | Extended | | |
| VOL-05 | Extended | | |
| VOL-06 | Extended | | |
| VOL-07 | Extended | | |
| VOL-08 | Extended | | |
| VTAG-01 | Extended | | |
| VTAG-02 | Extended | | |
| VTAG-03 | Extended | | |
| VTAG-04 | Extended | | |
| VTAG-05 | Extended | | |
| AVAIL-01 | Extended | | |
| AVAIL-02 | Extended | | |
| AVAIL-03 | Extended | | |
| SHIFT-01 | Extended | | |
| SHIFT-02 | Extended | | |
| SHIFT-03 | Extended | | |
| SHIFT-04 | Extended | | |
| SHIFT-05 | Extended | | |
| SHIFT-06 | Extended | | |
| SHIFT-07 | Extended | | |
| SHIFT-08 | Extended | | |
| SHIFT-09 | Extended | | |
| SHIFT-10 | Extended | | |
| FIELD-01 | Extended | | |
| FIELD-02 | Extended | | |
| FIELD-03 | Extended | | |
| FIELD-04 | Extended | | |
| FIELD-05 | Extended | | |
| FIELD-06 | Extended | | |
| FIELD-07 | Extended | | |
| FIELD-08 | Extended | | |
| FIELD-09 | Extended | | |
| FIELD-10 | Extended | | |
| OFFLINE-01 | Extended | | |
| OFFLINE-02 | Extended | | |
| OFFLINE-03 | Extended | | |
| TOUR-01 | Extended | | |
| TOUR-02 | Extended | | |
| TOUR-03 | Extended | | |
| NAV-01 | Extended | | |
| NAV-02 | Extended | | |
| NAV-03 | Extended | | |
| UI-01 | Extended | | |
| UI-02 | Extended | | |
| UI-03 | Extended | | |
| DRILL-01 | Extended | | |
| DRILL-02 | Extended | | |
| DRILL-03 | Extended | | |
| A11Y-01 | Extended | | |
| A11Y-02 | Extended | | |
| A11Y-03 | Extended | | |
| CROSS-01 | Extended | | |
| CROSS-02 | Extended | | |
| CROSS-03 | Extended | | |

---

## Summary

Fill in after completing test execution:

```
## Execution Summary

- Total tests: ___
- Passed: ___
- Failed: ___
- Skipped: ___
- Pass rate: ___%
- Blocking issues: ___

### Failed Tests (list):
(none)

### Skipped Tests (list with reason):
(none)

### Blocking Issues (list):
(none — ready for launch / OR / list of issues that must be resolved before launch)
```

---

*Runbook version: 1.0*
*Generated: 2026-03-30*
*Source: CivicPulse Run v1.7 testing-plan.md (130+ test cases)*
