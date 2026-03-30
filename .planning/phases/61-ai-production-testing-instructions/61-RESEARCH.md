# Phase 61: AI Production Testing Instructions - Research

**Researched:** 2026-03-30
**Domain:** Technical documentation authoring — production validation runbook for CivicPulse Run
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Document serves dual audience — AI agent and human QA. Structured enough for automated execution, readable enough for manual QA.
- **D-02:** Format is a Markdown runbook, same style as the existing `docs/testing-plan.md` (numbered steps, preconditions, expected results).
- **D-03:** Document is a standalone copy — fully self-contained with all test steps baked in. No cross-file references to `testing-plan.md` required. Agent can execute without reading other files.
- **D-04:** Document includes inline pass/fail reporting — instructs the agent to produce a structured result table at the end with test ID, status (pass/fail/skip), and notes.
- **D-05:** Tiered test structure — two tiers:
  - **Smoke suite** (~15-20 tests, ~10 min): Login, RBAC smoke, one happy-path per major domain (voter CRUD, canvassing, phone banking, volunteer, shift).
  - **Extended suite** (~50-70 tests, ~30 min): Full coverage of all domains including edge cases, filters, field mode, cross-cutting UI behaviors, accessibility spot checks.
- **D-06:** No test categories excluded. Since production is not yet live (pre-launch validation), all operations are safe — including destructive writes (delete campaign, delete org), imports (CSV upload), and offline/field mode testing.
- **D-07:** Reuse the same 15 ZITADEL test users (3 per role: owner, admin, manager, volunteer, viewer). Doc instructs agent to provision them in the prod ZITADEL instance using the existing provisioning script with prod config.
- **D-08:** Hybrid data setup — run the idempotent `seed.py` for base data (org, campaign, voters), then create operational data (turfs, walk lists, phone banks, surveys, shifts, etc.) through UI steps as part of the test flow. This validates both the seed path and UI creation workflows.
- **D-09:** No cleanup/teardown section. Test data remains in place after validation. Cleanup is manual before launch if needed.
- **D-10:** Placeholder variables for all environment-specific values (`${PROD_URL}`, `${ZITADEL_URL}`, `${DB_HOST}`, etc.). A "Configuration" section at the top lists all variables the agent must set before running.
- **D-11:** Document starts with a deployment health-check section — API health endpoint, ZITADEL reachability, DB connectivity, MinIO availability. Catches environment issues before testing begins.
- **D-12:** Agent interaction is a mix of direct API calls and Playwright CLI (not MCP). API calls for setup/data operations (faster), Playwright CLI for UI validation (supports parallel test execution). Steps are written accordingly — API steps use curl/httpx patterns, UI steps are Playwright-compatible.

### Claude's Discretion
- Exact test case selection for smoke vs extended tiers (guided by domain coverage goals)
- Health check specific endpoints and assertions
- Variable naming conventions in the configuration section
- How to structure the pass/fail result table

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROD-01 | AI-consumable production testing instruction document is created with production-specific URLs, auth, and data considerations | Full: production environment details, health endpoints, auth patterns, data setup strategy, Playwright CLI config, and complete test case inventory all researched and documented below |
</phase_requirements>

---

## Summary

Phase 61 produces a single Markdown document (`docs/production-testing-runbook.md`) that an AI agent or human QA tester can follow to validate CivicPulse Run on the production Kubernetes deployment. The document is authored once and consulted at deploy time — it is not code, tooling, or automation infrastructure. The primary authoring challenge is adapting ~130 local test cases from `docs/testing-plan.md` to the production context while organizing them into a smoke tier and an extended tier.

Production differs from local in three concrete ways: (1) URLs point to `https://run.civpulse.org` and `https://auth.civpulse.org` instead of localhost; (2) ZITADEL is the hosted production instance, requiring the provisioning script to run with prod credentials and env vars; (3) S3 storage is Cloudflare R2 (not local MinIO), so CSV import tests will validate against the real S3 endpoint. All other test logic — steps, expected results, role matrix — is directly lifted from the local plan.

**Primary recommendation:** The plan should have one task: author the full `docs/production-testing-runbook.md` document. The document's structure is fully specified by the locked decisions above; the implementation task is writing all 50-70 test cases to fill it.

---

## Standard Stack

This phase produces documentation, not code. There is no library stack to install.

### Tooling Required by the Document (not by authoring)

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `curl` or `httpx` | system | Health checks and API setup calls | Documented as curl patterns in the runbook |
| Playwright CLI | `npx playwright` | UI validation commands | `--base-url`, `--workers`, project flags |
| `uv run python` | ≥3.13 | Seed script and user provisioning | `scripts/seed.py`, `scripts/create-e2e-users.py` |
| `kubectl` | cluster kubectl | Pod log inspection and debug | Optional — for diagnosing failures |

---

## Architecture Patterns

### Document Structure (Prescribed by Decisions)

```
docs/production-testing-runbook.md
├── Configuration Section          # All ${VAR} placeholders
├── 0. Deployment Health Checks    # D-11: API, ZITADEL, DB, S3
├── 1. Test User Provisioning      # D-07: create-e2e-users.py with prod config
├── 2. Data Setup                  # D-08: seed.py + UI-driven operational data
├── Smoke Suite (15-20 tests)      # D-05: ~10 min coverage
│   ├── SMOKE-01 through SMOKE-~18
└── Extended Suite (50-70 tests)   # D-05: ~30 min full coverage
    ├── AUTH, RBAC, ORG, CAMP, ...
    └── FIELD, OFFLINE, CROSS
└── Pass/Fail Result Table         # D-04: agent fills in during execution
```

### Pattern: Tiered Test Selection

The local testing plan has 130+ tests. The smoke suite selects one happy-path representative per major domain. The extended suite covers all domains including edge cases.

**Smoke tier selection strategy (Claude's discretion area):**
- 1 auth test (AUTH-01: login one user)
- 1 RBAC smoke (RBAC-03: viewer restriction check)
- 1 org dashboard (ORG-01)
- 1 voter CRUD (VCRUD-01: create voter)
- 1 voter filter (FLT-01: basic name search)
- 1 canvassing (WL creation + assignment)
- 1 phone bank (session creation + caller assignment)
- 1 survey (script creation)
- 1 volunteer (registration)
- 1 shift (create + check-in)
- 1 field mode (FIELD-01: hub loads)
- 1 cross-cutting (CROSS-02: toasts visible)
- 1 dashboard (DASH-01: KPIs render)
- 1 health check (API /health/live)
- 1 import smoke (upload CSV, confirm progress appears)

That yields ~15 tests and matches the D-05 target.

### Pattern: Placeholder Variable Syntax

Decision D-10 prescribes `${VARIABLE_NAME}` syntax throughout the document. The Configuration section lists every variable with a description and example value.

**Required variables based on production infrastructure research:**

| Variable | Source | Example |
|----------|--------|---------|
| `${PROD_URL}` | ingress.yaml: `run.civpulse.org` | `https://run.civpulse.org` |
| `${ZITADEL_URL}` | configmap.yaml: `auth.civpulse.org` | `https://auth.civpulse.org` |
| `${ZITADEL_PAT}` | Production ZITADEL admin PAT | `<admin PAT token>` |
| `${DB_HOST}` | k8s-deployment-guide.md | `postgresql.civpulse-infra.svc.cluster.local` |
| `${S3_ENDPOINT_URL}` | run-api-secret.yaml.example | `https://r2.cloudflarestorage.com/<account-id>` |
| `${S3_BUCKET}` | run-api-secret.yaml.example | `voter-imports` |
| `${TEST_DATA_CSV}` | docs/testing-plan.md Appendix B | `data/example-2026-02-24.csv` |
| `${OWNER1_PASSWORD}` | create-e2e-users.py default | `Owner1234!` |

### Pattern: Health Check Section (D-11)

The production K8s deployment exposes two probes (confirmed in `k8s/apps/run-api-prod/deployment.yaml`):
- `/health/live` — liveness probe (HTTP GET → 200)
- `/health/ready` — readiness probe (HTTP GET → 200)
- `/api/v1/config/public` — mentioned in testing-plan.md as the API health check

The ZITADEL health endpoint pattern (from `scripts/bootstrap-zitadel.py`): `${ZITADEL_URL}/debug/ready`

**Health check block the runbook must include:**

```bash
# 1. API liveness
curl -sf "${PROD_URL}/health/live" | grep -q "ok" && echo "PASS" || echo "FAIL"

# 2. API readiness
curl -sf "${PROD_URL}/health/ready" | grep -q "ok" && echo "PASS" || echo "FAIL"

# 3. Public config endpoint (ZITADEL connection health)
curl -sf "${PROD_URL}/api/v1/config/public" && echo "PASS" || echo "FAIL"

# 4. ZITADEL reachability
curl -sf "${ZITADEL_URL}/debug/ready" && echo "PASS" || echo "FAIL"
```

DB connectivity is validated indirectly by the readiness probe (which checks DB connectivity in FastAPI startup). S3 connectivity is validated when the first CSV import succeeds in the extended suite.

### Pattern: User Provisioning (D-07)

The existing `scripts/create-e2e-users.py` is idempotent and accepts ZITADEL config via environment variables (same env vars as `scripts/bootstrap-zitadel.py`). For production, the agent must supply:

```bash
ZITADEL_DOMAIN=auth.civpulse.org \
ZITADEL_EXTERNAL_PORT=443 \
ZITADEL_EXTERNAL_SECURE=true \
ZITADEL_URL=https://auth.civpulse.org \
PAT_PATH=/path/to/prod-pat.txt \
uv run python scripts/create-e2e-users.py
```

The document must instruct the agent to have the production PAT available before running. The script creates 15 users across 5 roles (owner1-3, admin1-3, manager1-3, volunteer1-3, viewer1-3) with `@localhost` email domains and known passwords defined in the script body.

### Pattern: Playwright CLI Against Production (D-12)

The local Playwright config (`web/playwright.config.ts`) hardcodes `localhost:5173` or `localhost:4173`. Against production the agent must override via CLI flags:

```bash
# Example — run chromium project against prod URL
cd web && npx playwright test --project=chromium \
  --base-url="${PROD_URL}" \
  voter-crud.spec.ts
```

However, the auth setup (storageState files) is generated against the local ZITADEL. Against production ZITADEL the agent must re-run auth setup pointing to `${ZITADEL_URL}`. This is a key adaptation the runbook must address:

```bash
# 1. Set PLAYWRIGHT_BASE_URL so auth setup resolves correctly
export PLAYWRIGHT_BASE_URL="${PROD_URL}"

# 2. Delete cached auth to force re-auth
rm -rf web/playwright/.auth/

# 3. Run auth setup only (no tests)
cd web && npx playwright test --project=auth-setup \
  --base-url="${PROD_URL}"
```

**Important caveat:** The auth setup scripts (`web/e2e/auth-*.setup.ts`) navigate to the app and complete OIDC login via ZITADEL. They rely on the app's VITE-built frontend being served at `${PROD_URL}`. Against production this means the production frontend must be deployed before auth setup can run. The runbook must make this dependency explicit.

### Pattern: Inline Pass/Fail Table (D-04)

The document ends with a template result table the agent fills in as it executes:

```markdown
## Execution Results

| Test ID | Suite | Status | Notes |
|---------|-------|--------|-------|
| HEALTH-01 | — | PASS/FAIL | |
| HEALTH-02 | — | PASS/FAIL | |
| SMOKE-01 | Smoke | PASS/FAIL | |
...
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test user creation | Custom provisioning code | `scripts/create-e2e-users.py` | Idempotent, handles ZITADEL v2beta API, org login policy, and MFA skip |
| Seed data | Manual DB inserts | `scripts/seed.py` | Idempotent, creates full Macon-Bibb County dataset including PostGIS coords |
| Auth state files | Custom login automation | Playwright auth setup projects (`auth-*.setup.ts`) | Already written, handles OIDC flow and storageState serialization |
| ZITADEL provisioning | New ZITADEL API calls | `scripts/bootstrap-zitadel.py` patterns | Tested patterns for project, roles, SPA app, service account creation |

---

## Common Pitfalls

### Pitfall 1: Auth Setup Points to Local ZITADEL
**What goes wrong:** Playwright auth setup generates `playwright/.auth/*.json` files with OIDC tokens issued by `http://localhost:8080`. These tokens are signed by the local ZITADEL — the production API will reject them (wrong issuer).
**Why it happens:** `playwright.config.ts` hardcodes localhost URLs; auth setup is run locally first.
**How to avoid:** The runbook must instruct the agent to delete `web/playwright/.auth/` and re-run auth setup with `PLAYWRIGHT_BASE_URL=${PROD_URL}` so tokens come from the production ZITADEL.
**Warning signs:** All API calls return 401 after auth setup; token issuer in JWT does not match `${ZITADEL_URL}`.

### Pitfall 2: Frontend Not Deployed Before Running Tests
**What goes wrong:** Health checks pass (API is up) but Playwright navigates to `${PROD_URL}` and gets a 404 or raw API JSON instead of the React app.
**Why it happens:** The React frontend is served as static files from the FastAPI app container. If the container was built without the frontend build step, or if the frontend Vite build failed, no HTML is served.
**How to avoid:** The health check section must include a UI load check: navigate to `${PROD_URL}` and assert that `<title>` contains "CivicPulse" (or similar). This is a precondition for all subsequent UI tests.
**Warning signs:** Playwright test fails at `page.goto()` with unexpected response or wrong page content.

### Pitfall 3: Seed Script Targeting Local DB
**What goes wrong:** `scripts/seed.py` connects via the `DATABASE_URL` env var. If run without overriding env, it targets the local Docker Compose PostgreSQL.
**Why it happens:** `seed.py` uses the same env var resolution as the API container — defaults to whatever `DATABASE_URL` is in the current shell.
**How to avoid:** Runbook must instruct agent to run seed.py with production `DATABASE_URL` explicitly set:
```bash
DATABASE_URL="postgresql+asyncpg://<prod_user>:<prod_pass>@${DB_HOST}:5432/<db>" \
uv run python scripts/seed.py
```
**Warning signs:** Seed script reports success but no data appears in the production UI.

### Pitfall 4: ZITADEL MFA Blocking Test Users
**What goes wrong:** Test users created by `create-e2e-users.py` trigger MFA prompts in the production ZITADEL, breaking the Playwright auth setup flow which does not handle MFA.
**Why it happens:** Production ZITADEL may have default MFA policies enabled org-wide.
**How to avoid:** The runbook must note that an org-level login policy without mandatory MFA must exist for the test org/project in production ZITADEL (same fix applied in Phase 60 per STATE.md: "Created org-level ZITADEL login policy without MFA for E2E testing").
**Warning signs:** Playwright auth setup hangs or fails at a step past username/password entry.

### Pitfall 5: CSV Import Requires S3 Connectivity
**What goes wrong:** Voter import tests fail with a server-side error because production S3/R2 is not reachable, credentials are wrong, or the bucket does not exist.
**Why it happens:** Local dev uses MinIO; production uses Cloudflare R2. The bucket name, endpoint, and credentials differ.
**How to avoid:** Include a pre-flight S3 check in the health section: attempt to list or head the S3 bucket using `${S3_ENDPOINT_URL}`, `${S3_ACCESS_KEY_ID}`, `${S3_SECRET_ACCESS_KEY}`, `${S3_BUCKET}`. If the check fails, skip import tests and flag as a blocking issue.
**Warning signs:** Import wizard shows "Upload failed" on file selection; server logs show S3 connection errors.

### Pitfall 6: create-e2e-users.py Needs Access to Production ZITADEL PAT
**What goes wrong:** The provisioning script reads the PAT from a file path (`PAT_PATH` env var). On production the PAT is not at the default Docker Compose path `/zitadel-data/pat.txt`.
**Why it happens:** The script was designed for local Docker Compose.
**How to avoid:** The runbook must instruct the agent to create a temp file with the production PAT and set `PAT_PATH` to that file path before running the script.
**Warning signs:** Script exits with "PAT file not found" or "401 Unauthorized" on first ZITADEL API call.

---

## Code Examples

### Health Check Commands

```bash
# Source: k8s/apps/run-api-prod/deployment.yaml (livenessProbe/readinessProbe paths)
# Source: docs/testing-plan.md (1.1 Environment Startup — API health URL)

# API liveness
curl -sf "https://${PROD_URL}/health/live"

# API readiness (also validates DB connection)
curl -sf "https://${PROD_URL}/health/ready"

# OIDC config (confirms ZITADEL integration works)
curl -sf "https://${PROD_URL}/api/v1/config/public"

# ZITADEL health
# Source: scripts/bootstrap-zitadel.py (wait_for_zitadel())
curl -sf "https://${ZITADEL_URL}/debug/ready"

# Frontend load check (confirms React app is served)
curl -sf "https://${PROD_URL}" | grep -i "civicpulse"
```

### Run Seed Script Against Production

```bash
# Source: CLAUDE.md (seed.py usage), k8s-deployment-guide.md (DB connection string)
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" \
DATABASE_URL_SYNC="postgresql+psycopg2://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" \
uv run python scripts/seed.py
```

### Run User Provisioning Against Production ZITADEL

```bash
# Source: scripts/create-e2e-users.py (env var pattern from bootstrap-zitadel.py)
# Write PAT to a temp file first:
echo "${ZITADEL_PAT}" > /tmp/prod-pat.txt

ZITADEL_DOMAIN="auth.civpulse.org" \
ZITADEL_EXTERNAL_PORT="443" \
ZITADEL_EXTERNAL_SECURE="true" \
ZITADEL_URL="https://auth.civpulse.org" \
PAT_PATH="/tmp/prod-pat.txt" \
uv run python scripts/create-e2e-users.py
```

### Run Playwright Auth Setup Against Production

```bash
# Source: web/playwright.config.ts (projects structure), web/e2e/auth-*.setup.ts
cd web
rm -rf playwright/.auth/
PLAYWRIGHT_BASE_URL="https://${PROD_URL}" \
  npx playwright test --project=auth-setup
```

### Run Playwright Smoke Tests Against Production

```bash
# Source: web/playwright.config.ts (workers, base-url override)
cd web
npx playwright test \
  --project=chromium \
  --base-url="https://${PROD_URL}" \
  --workers=4 \
  login.spec.ts rbac.spec.ts voter-crud.spec.ts
```

---

## Production Environment Findings

### Production URLs (HIGH confidence — from k8s manifests)

| Service | Production URL | Source |
|---------|---------------|--------|
| App (frontend + API) | `https://run.civpulse.org` | `k8s/apps/run-api-prod/ingress.yaml` |
| ZITADEL (auth) | `https://auth.civpulse.org` | `k8s/apps/run-api-prod/configmap.yaml` (ZITADEL_BASE_URL) |
| PostgreSQL | `postgresql.civpulse-infra.svc.cluster.local:5432` | `docs/k8s-deployment-guide.md` |
| S3/R2 (imports) | Cloudflare R2 endpoint via secret | `k8s/apps/run-api-prod/run-api-secret.yaml.example` |

Note: ZITADEL_BASE_URL in configmap is `http://zitadel.civpulse-infra.svc.cluster.local:8080` (in-cluster internal URL). External ZITADEL URL used by browsers and the runbook is `https://auth.civpulse.org` — confirmed by `docs/k8s-deployment-guide.md` section 5.

### K8s Health Endpoints (HIGH confidence — from deployment.yaml)

| Endpoint | Type | Path |
|----------|------|------|
| Liveness | K8s probe | `/health/live` |
| Readiness | K8s probe | `/health/ready` |
| API health (app-level) | Manual | `/api/v1/config/public` |

### ZITADEL Production Configuration Differences from Local

| Aspect | Local | Production |
|--------|-------|------------|
| TLS | Disabled (`DISABLE_TLS=true`) | Enabled (Cloudflare Tunnel terminates) |
| Domain | `localhost:8080` | `auth.civpulse.org` |
| PAT location | `/zitadel-data/pat.txt` (Docker volume) | Provided externally |
| EXTERNAL_SECURE | `false` | `true` |
| In-cluster URL | `http://zitadel:8080` | `http://zitadel.civpulse-infra.svc.cluster.local:8080` |

### Test User Emails (from create-e2e-users.py)

The script uses `@localhost` email domains (e.g., `owner1@localhost`). This is intentional — ZITADEL does not send verification emails for these since they are not real email addresses. The provisioning script explicitly sets `isEmailVerified: true` via the v2beta API.

### Local E2E Test Infrastructure — What Transfers to Production

| Asset | Transfers? | Adaptation Needed |
|-------|-----------|-------------------|
| `web/e2e/*.spec.ts` (55 files) | Yes — runnable against prod URL | Override `--base-url` via CLI |
| `web/playwright.config.ts` | Yes — but baseURL must be overridden | Pass `--base-url` flag |
| `web/e2e/fixtures.ts` | Yes — uses `/api/v1/me/campaigns` | No change (Macon-Bibb seed data) |
| `web/playwright/.auth/*.json` | No — tokens are issuer-bound | Delete and re-run auth setup |
| `scripts/seed.py` | Yes — idempotent | Override `DATABASE_URL` env var |
| `scripts/create-e2e-users.py` | Yes — idempotent | Override ZITADEL env vars + PAT_PATH |

---

## Local Testing Plan Coverage Map

The existing `docs/testing-plan.md` has 34 sections with ~130+ test IDs. The production runbook maps these to smoke and extended tier. The full section list:

| Section | Test IDs | Smoke | Extended |
|---------|----------|-------|----------|
| 2. Authentication | AUTH-01 to 04 | AUTH-01 | AUTH-01 through 04 |
| 3. RBAC | RBAC-01 to 09 | RBAC-01, RBAC-03 | RBAC-01 through 09 |
| 4. Org Management | ORG-01 to 08 | ORG-01 | ORG-01 through 08 |
| 5. Campaign Settings | CAMP-01 to 06 | — | CAMP-01 through 06 |
| 6. Campaign Dashboard | DASH-01 to 03 | DASH-01 | DASH-01 through 03 |
| 7. Voter Import | IMP-01 to 04 | IMP-01 (smoke only) | IMP-01 through 04 |
| 8. Voter Validation | VAL-01 to 02 | — | VAL-01 through 02 |
| 9. Voter Filters | FLT-01 to 05 | FLT-01 | FLT-01 through 05 |
| 10. Voter CRUD | VCRUD-01 to 04 | VCRUD-01 | VCRUD-01 through 04 |
| 11. Voter Contacts | CON-01 to 06 | — | CON-01 through 06 |
| 12. Voter Tags | TAG-01 to 05 | — | TAG-01 through 05 |
| 13. Voter Notes | NOTE-01 to 03 | — | NOTE-01 through 03 |
| 14. Voter Lists | VLIST-01 to 06 | — | VLIST-01 through 06 |
| 15. Turfs | TURF-01 to 07 | TURF-01 | TURF-01 through 07 |
| 16. Walk Lists | WL-01 to 07 | WL-01 | WL-01 through 07 |
| 17. Call Lists | CL-01 to 05 | CL-01 | CL-01 through 05 |
| 18. DNC | DNC-01 to 06 | — | DNC-01 through 06 |
| 19. Phone Banking Sessions | PB-01 to 10 | PB-01 | PB-01 through 10 |
| 20. Surveys | SRV-01 to 08 | SRV-01 | SRV-01 through 08 |
| 21. Volunteers | VOL-01 to 08 | VOL-01 | VOL-01 through 08 |
| 22. Volunteer Tags | VTAG-01 to 05 | — | VTAG-01 through 05 |
| 23. Volunteer Availability | AVAIL-01 to 03 | — | AVAIL-01 through 03 |
| 24. Shifts | SHIFT-01 to 10 | SHIFT-01 | SHIFT-01 through 10 |
| 25-27. Field Mode | FIELD-01 to 10 | FIELD-01 | FIELD-01 through 10 |
| 28. Offline | OFFLINE-01 to 03 | — | OFFLINE-01 through 03 |
| 29. Onboarding Tour | TOUR-01 to 03 | — | TOUR-01 through 03 |
| 30. Navigation | NAV-01 to 03 | NAV-01 | NAV-01 through 03 |
| 31. Empty States | UI-01 to 03 | — | UI-01 through 03 |
| 32. Dashboard Drilldowns | DRILL-01 to 05 | — | DRILL-01 through 05 |
| 33. Accessibility | A11Y-01 to 05 | — | A11Y-01 through 05 |
| 34. Cross-Cutting | CROSS-01 to 03 | CROSS-02 | CROSS-01 through 03 |

Estimated smoke: ~18 tests. Estimated extended: 65-70 tests. Both within D-05 targets.

---

## Validation Architecture

Nyquist validation is enabled per `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Not applicable — this phase produces documentation, not code |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROD-01 | Production testing runbook exists at `docs/production-testing-runbook.md` | manual-only (document review) | `ls docs/production-testing-runbook.md && wc -l docs/production-testing-runbook.md` | ❌ Wave 0 |

**Justification for manual-only:** PROD-01 requires authoring a document. The verification is: (a) file exists, (b) it contains a Configuration section, health checks, smoke suite, extended suite, and result table. These are content checks, not behavioral automation.

### Wave 0 Gaps

- [ ] `docs/production-testing-runbook.md` — the deliverable of this phase

---

## Environment Availability

This phase produces documentation. The document itself references production infrastructure, but the authoring process requires only the local codebase and the canonical reference files.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `docs/testing-plan.md` | Primary content source | ✓ | v1.0 (2026-03-29) | — |
| `scripts/create-e2e-users.py` | User provisioning instructions | ✓ | in repo | — |
| `scripts/seed.py` | Data setup instructions | ✓ | in repo | — |
| `k8s/apps/run-api-prod/` | Production URL/config details | ✓ | in repo | — |
| `web/playwright.config.ts` | CLI invocation patterns | ✓ | in repo | — |

No missing dependencies.

---

## Open Questions

1. **ZITADEL production org login policy**
   - What we know: Phase 60 STATE.md notes "Created org-level ZITADEL login policy without MFA for E2E testing" for local dev.
   - What's unclear: Has an equivalent MFA-disabled login policy been configured in the production ZITADEL for the CivicPulse project/org? If not, Playwright auth setup will fail.
   - Recommendation: The runbook should include a pre-flight step: verify that the production ZITADEL org has MFA set to "not enforced" for the CivicPulse project, and provide the API call to create the policy if missing.

2. **Production PAT availability**
   - What we know: `create-e2e-users.py` requires a ZITADEL admin PAT. Local dev gets this from `/zitadel-data/pat.txt`.
   - What's unclear: How is the production admin PAT stored and accessed? Is it in a K8s secret? In a team secrets manager?
   - Recommendation: The runbook should instruct the agent to check for `${ZITADEL_PAT}` in the environment before running the provisioning script, and note that obtaining this PAT is a prerequisite the human operator must satisfy.

3. **S3/R2 bucket pre-existence**
   - What we know: The secret template references `S3_BUCKET=voter-imports`.
   - What's unclear: Does this bucket exist in production Cloudflare R2? Was it created as part of infrastructure provisioning?
   - Recommendation: The runbook health check section should include an S3 bucket accessibility check. If the bucket is not reachable, voter import tests should be marked as "SKIP (S3 not available)" rather than FAIL.

---

## Sources

### Primary (HIGH confidence)
- `k8s/apps/run-api-prod/ingress.yaml` — production hostname `run.civpulse.org`
- `k8s/apps/run-api-prod/configmap.yaml` — ZITADEL internal URL, CORS origin
- `k8s/apps/run-api-prod/deployment.yaml` — health probe paths `/health/live`, `/health/ready`
- `k8s/apps/run-api-prod/run-api-secret.yaml.example` — all 12 production secret keys including S3 config
- `docs/k8s-deployment-guide.md` — cluster architecture, traffic flow, ZITADEL external URL
- `docs/testing-plan.md` — complete local test case library (130+ tests, 34 sections)
- `scripts/create-e2e-users.py` — ZITADEL env var interface for user provisioning
- `scripts/bootstrap-zitadel.py` — ZITADEL health check endpoint pattern
- `web/playwright.config.ts` — Playwright projects, auth state caching, baseURL
- `web/e2e/fixtures.ts` — Auth token extraction and campaign resolution patterns
- `.planning/STATE.md` — Phase 60 decisions about ZITADEL MFA policy and v2beta API

### Secondary (MEDIUM confidence)
- `CLAUDE.md` (project) — confirms `uv run` requirement for Python scripts, `run-e2e.sh` as E2E wrapper
- `.planning/REQUIREMENTS.md` — PROD-01 requirement definition and context

---

## Metadata

**Confidence breakdown:**
- Production URLs and config: HIGH — read directly from K8s manifests
- User provisioning adaptation: HIGH — read directly from script source
- Playwright CLI adaptation: HIGH — read from playwright.config.ts and fixture patterns
- Test case selection for smoke tier: MEDIUM — applies discretion criteria based on domain coverage goals
- S3/R2 availability in prod: LOW — bucket existence not verifiable from code alone

**Research date:** 2026-03-30
**Valid until:** Stable — documentation phase. Valid until production infrastructure changes.
