# CivicPulse Run — Production Shakedown Test Plan

**Version:** 1.0
**Created:** 2026-04-05
**Target:** `https://run.civpulse.org` (production)
**Audience:** AI agents (Claude Code, Codex, OpenCode, Pi, etc.) OR human QA testers
**Status:** Pre-launch final validation

This plan is the authoritative pre-launch validation suite. It exists to prove that production is ready for real users by exhaustively exercising every feature, role boundary, tenant isolation edge, and failure mode — leaving no stone unturned.

Each **phase** is a self-contained file that can be executed independently by a single agent. Phases declare their dependencies so multiple agents can work in parallel where dependencies allow.

---

## Phase Index & Dependency Graph

| # | Phase | Depends on | Duration | Focus |
|---|---|---|---|---|
| 00 | [Environment Setup](phase-00-environment-setup.md) | — | 30 min | Health checks, 2-org provisioning, baseline data |
| 01 | [Authentication & OIDC](phase-01-authentication.md) | 00 | 20 min | Login, tokens, session expiry, PKCE, logout |
| 02 | [Org Lifecycle](phase-02-org-lifecycle.md) | 00, 01 | 30 min | Create, switch, settings, delete (user emphasis) |
| 03 | [Cross-Tenant Isolation](phase-03-cross-tenant-isolation.md) | 00, 02 | 60 min | **Negative tests** — data leakage prevention (user emphasis) |
| 04 | [Campaign Lifecycle](phase-04-campaign-lifecycle.md) | 00, 02 | 30 min | Wizard, archive/restore, delete, member mgmt |
| 05 | [Voters](phase-05-voters.md) | 00, 04 | 60 min | CRUD, search, import, lists, tags, contacts, DNC |
| 06 | [Canvassing](phase-06-canvassing.md) | 00, 04, 05 | 45 min | Turfs, walk lists, entries, assignment |
| 07 | [Phone Banking](phase-07-phone-banking.md) | 00, 04, 05 | 45 min | Call lists, sessions, claim flow |
| 08 | [Surveys](phase-08-surveys.md) | 00, 04 | 20 min | Scripts, questions, response collection |
| 09 | [Volunteers & Shifts](phase-09-volunteers-shifts.md) | 00, 04 | 30 min | CRUD, tags, availability, scheduling |
| 10 | [Field Mode](phase-10-field-mode.md) | 00, 04, 06, 07, 08 | 60 min | **Offline queue, canvassing, phone banking** (user emphasis) |
| 11 | [RBAC Matrix](phase-11-rbac-matrix.md) | 00, 04 | 40 min | 5 roles × every endpoint, negative permission tests |
| 12 | [Security](phase-12-security.md) | 00, 01 | 40 min | SQL injection, XSS, forged tokens, oversized payloads, rate limit |
| 13 | [Concurrency](phase-13-concurrency.md) | 00, 07, 10 | 30 min | Race conditions, list claiming, offline conflicts |
| 14 | [Accessibility](phase-14-accessibility.md) | 00 | 40 min | WCAG AA — contrast, keyboard, screen reader |
| 15 | [Performance](phase-15-performance.md) | 00, 05 | 20 min | Page load, API SLAs, bulk ops |
| 16 | [Cleanup](phase-16-cleanup.md) | all | 15 min | Tear down test orgs/campaigns/users |

**Total estimated duration (sequential):** ~9 hours
**Parallelized (5 agents):** ~3 hours

### Dependency visualization

```
00 (setup) ──┬─ 01 (auth) ──┬─ 02 (org) ─┬─ 03 (isolation)
             │              │            └─ 04 (campaign) ─┬─ 05 (voters) ─┬─ 06 (canvassing) ──┐
             │              │                              │               ├─ 07 (phone bank) ──┤
             │              │                              │               └─ 09 (volunteers) ──┤
             │              │                              └─ 08 (surveys) ──────────────────────┤
             │              ├─ 11 (rbac matrix)            │                                     │
             │              └─ 12 (security)               │                                     │
             │                                             └─ 10 (field mode) ←──────────────────┘
             ├─ 14 (a11y)                                         └─ 13 (concurrency)
             └─ 15 (perf)
                                                                                                 └─ 16 (cleanup)
```

### Suggested parallel execution (5 agents)

- **Agent A**: 00 → 01 → 02 → 03 (isolation-focused)
- **Agent B**: 04 → 05 → 06 (voters + canvassing)
- **Agent C**: 07 → 08 → 09 → 10 (phone banking + surveys + volunteers + field)
- **Agent D**: 11 → 12 → 13 (RBAC + security + concurrency)
- **Agent E**: 14 → 15 (a11y + perf)

Agents must wait for phase 00 to complete before starting their chains. Agent A owns org-setup bleed-through to other agents (second org is critical for isolation tests).

---

## Configuration

These are the canonical variables used throughout every phase. Set them once before execution. Where a test references `${VAR_NAME}`, substitute from this table.

### URLs & infrastructure

| Variable | Value | Notes |
|---|---|---|
| `PROD_URL` | `https://run.civpulse.org` | Web app + API |
| `API_URL` | `https://run.civpulse.org/api/v1` | API prefix |
| `ZITADEL_URL` | `https://auth.civpulse.org` | OIDC issuer |
| `DB_HOST` | `thor.tailb56d83.ts.net` | PostgreSQL via Tailscale |
| `DB_NAME` | `run_api_prod` | Prod database |
| `DB_SUPERUSER` | `postgres` | For direct DB verification |
| `K8S_NAMESPACE` | `civpulse-prod` | Prod K8s ns |
| `K8S_DEPLOY` | `run-api` | API deployment name |

### Test user credentials — Org A (existing, "CivPulse Platform")

Created 2026-04-05; see `.secrets/prod-test-users.md` for full details.

| Role | Email | Password | ZITADEL ID | Campaign Access |
|---|---|---|---|---|
| owner | `qa-owner@civpulse.org` | `k%A&ZrlYH4tgztoVK&Ms` | 367278364538437701 | QA Test Campaign (owner) |
| admin | `qa-admin@civpulse.org` | `gWRQi#uI9&8^1K4B28Dz` | 367278367172460613 | QA Test Campaign (admin)† |
| manager | `qa-manager@civpulse.org` | `%3%XQm*K0fT!9qx89e@$` | 367278369538048069 | QA Test Campaign (manager)† |
| volunteer | `qa-volunteer@civpulse.org` | `S27hYyk#b6ntLK8jHZLv` | 367278371970744389 | QA Test Campaign (volunteer)† |
| viewer | `qa-viewer@civpulse.org` | `QzkzepNgk6It$!7$!MYF` | 367278374319554629 | QA Test Campaign (viewer)† |

† Auto-provisioned by `ensure_user_synced` on first login (app/api/deps.py:91).

### Test user credentials — Org B (to be created in phase 00)

Required for cross-tenant isolation tests (phase 03). Phase 00 provisions these 5 users in a new ZITADEL org + backend org/campaign.

| Role | Email | Password placeholder | Notes |
|---|---|---|---|
| owner | `qa-b-owner@civpulse.org` | `${ORG_B_OWNER_PASSWORD}` | Generated in phase 00 |
| admin | `qa-b-admin@civpulse.org` | `${ORG_B_ADMIN_PASSWORD}` | Generated in phase 00 |
| manager | `qa-b-manager@civpulse.org` | `${ORG_B_MANAGER_PASSWORD}` | Generated in phase 00 |
| volunteer | `qa-b-volunteer@civpulse.org` | `${ORG_B_VOLUNTEER_PASSWORD}` | Generated in phase 00 |
| viewer | `qa-b-viewer@civpulse.org` | `${ORG_B_VIEWER_PASSWORD}` | Generated in phase 00 |

### IDs (Org A — existing)

| Name | Value |
|---|---|
| ZITADEL org ID | `362268991072305186` (CivPulse Platform) |
| ZITADEL project ID | `364255076543365156` (CivicPulse Run) |
| ZITADEL SPA client ID | `364255312682745892` (run-web) |
| DB org ID | `227ef98c-bf29-47d2-b6ea-b904507f50de` |
| DB campaign ID | `06d710c8-32ce-44ae-bbab-7fcc72aab248` (QA Test Campaign) |

### IDs (Org B — placeholder, populated in phase 00)

| Name | Value |
|---|---|
| ZITADEL org ID | `${ORG_B_ZITADEL_ID}` |
| DB org ID | `${ORG_B_DB_ID}` |
| DB campaign ID | `${ORG_B_CAMPAIGN_ID}` |

---

## How to execute

### Prerequisites

Every executing agent needs:

- `curl` (for API probes)
- `psql` client with network access to `thor.tailb56d83.ts.net:5432` as `postgres` superuser
- `kubectl` with context pointing at the prod cluster
- Node 20+ and Playwright ≥1.58 installed at `web/node_modules/playwright` (use `npx playwright` or the existing project install)
- Ability to launch a headless Chromium (works on Linux, macOS, Windows WSL)
- Read access to `.secrets/prod-test-users.md` (credentials for Org A)

### Pre-flight verification

Before starting any phase, verify you can reach the required surfaces:

```bash
# 1. Prod API
curl -fsS https://run.civpulse.org/health/live | jq .status
# expect: "ok"

# 2. ZITADEL
curl -fsS https://auth.civpulse.org/.well-known/openid-configuration | jq .issuer
# expect: "https://auth.civpulse.org"

# 3. DB
psql -h thor.tailb56d83.ts.net -U postgres -d run_api_prod -c "SELECT version();"
# expect: PostgreSQL 16.x

# 4. k8s
kubectl -n civpulse-prod get deploy run-api -o jsonpath='{.status.availableReplicas}'
# expect: 1 (or more)

# 5. Playwright
cd web && npx playwright --version
# expect: Version 1.58+
```

If any pre-flight fails, STOP and fix the environment before proceeding.

### Running a single phase

```bash
# Open the phase file, follow steps, record results inline
# Example:
$EDITOR docs/production-shakedown/phase-02-org-lifecycle.md
# Execute each test ID in order, then fill in the Results table at the bottom
# Commit the results file to docs/production-shakedown/results/phase-02-results.md
```

### Running all phases sequentially

Execute in dependency order (see graph above). Each phase's results go into `results/phase-NN-results.md`.

### Running phases in parallel (multi-agent)

Assign one phase (or a chain) per agent. Agents MUST complete phase 00 before any other phase starts.

Coordination pattern:
1. **Phase 00** runs first, single agent. Writes `results/phase-00-results.md` with populated Org B IDs + passwords.
2. Other agents read `results/phase-00-results.md` to get Org B credentials.
3. Each agent runs its assigned phases, writing results to `results/phase-NN-results.md`.
4. Final aggregator reads all `results/*.md` and produces a consolidated summary.

### Reporting results

Each phase file has a **Results** section with a pre-populated table (one row per test ID). Fill in the `Result` and `Notes` columns:

- `PASS` — test passed fully
- `FAIL` — test failed; include details in Notes + link to screenshot/log evidence
- `SKIP` — test skipped (state reason in Notes)
- `BLOCKED` — couldn't execute due to prior failure

Save per-phase results to `docs/production-shakedown/results/phase-NN-results.md` as a copy of the Results table with real values.

Screenshots, logs, and other evidence go under `docs/production-shakedown/results/evidence/phase-NN/`.

---

## Test ID scheme

Every test has a globally unique ID: `${PHASE}-${DOMAIN}-${SEQ}`

Examples:
- `ENV-HEALTH-01` — phase 00, health-check domain, test #1
- `ISO-XTENANT-15` — phase 03, cross-tenant domain, test #15
- `FIELD-OFFLINE-03` — phase 10, offline-sync domain, test #3

Phase prefixes:
| Phase | Prefix | Phase | Prefix |
|---|---|---|---|
| 00 Environment | `ENV` | 09 Volunteers/Shifts | `VOL` |
| 01 Authentication | `AUTH` | 10 Field Mode | `FIELD` |
| 02 Org Lifecycle | `ORG` | 11 RBAC Matrix | `RBAC` |
| 03 Cross-Tenant Isolation | `ISO` | 12 Security | `SEC` |
| 04 Campaign Lifecycle | `CAMP` | 13 Concurrency | `CONC` |
| 05 Voters | `VTR` | 14 Accessibility | `A11Y` |
| 06 Canvassing | `CANV` | 15 Performance | `PERF` |
| 07 Phone Banking | `PB` | 16 Cleanup | `CLN` |
| 08 Surveys | `SRV` | | |

---

## Test execution conventions

### AI agent execution guidance

**Tool selection:**
- **API testing** → `curl` with `-fsS` flags (fail on HTTP errors, silent, show errors)
- **UI testing** → Playwright headless Chromium via `npx playwright` (see `web/smoke-test-harness.mjs` for reference). OR browser MCPs (Claude Code's `chrome-devtools-mcp`, etc.)
- **DB verification** → `psql -h ${DB_HOST} -U postgres -d ${DB_NAME} -c "SELECT ..."`
- **Pod logs/state** → `kubectl -n civpulse-prod logs deploy/run-api -c run-api --tail=200`
- **Direct app queries** → `kubectl exec -i deploy/run-api -c run-api -- python < script.py` (has httpx, asyncpg, SQLAlchemy pre-installed)

**For each test:**
1. Read preconditions — verify or set up required state
2. Execute steps in order
3. Capture evidence (screenshot/response body/log line)
4. Compare against expected result
5. Record PASS/FAIL in the Results table
6. If FAIL: capture as much detail as possible (don't stop unless BLOCKING)

**State isolation:**
- Tests should NOT depend on side effects of tests that come later
- Tests SHOULD clean up their own mutations where safe (see each test's Cleanup section)
- If a test creates state that subsequent tests depend on, it's marked **(stateful)** in the title

### Obtaining a JWT for API tests

Several phases need a fresh access token for a specific user. Use this pattern (works for any test user):

```bash
# Via Playwright (gets token from a real login flow):
cd web && EMAIL='qa-owner@civpulse.org' PASSWORD='...' node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  const tokens = new Promise((r) => {
    p.on('request', (req) => {
      const h = req.headers();
      if (h.authorization?.startsWith('Bearer ')) r(h.authorization.slice(7));
    });
  });
  await p.goto('https://run.civpulse.org');
  await p.waitForSelector('input');
  await p.locator('input').first().fill(process.env.EMAIL);
  await p.getByRole('button', { name: /continue/i }).click();
  await p.waitForSelector('input[type=password]');
  await p.locator('input[type=password]').fill(process.env.PASSWORD);
  await p.getByRole('button', { name: /continue/i }).click();
  await p.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/);
  const token = await tokens;
  console.log(token);
  await b.close();
})();
"
```

Store the token in `TOKEN` env var, then:
```bash
curl -fsS -H "Authorization: Bearer $TOKEN" https://run.civpulse.org/api/v1/users/me | jq .
```

Alternatively, an AI system with browser automation can perform the OIDC flow directly in its browser tool and inspect the access token from DevTools.

### Record & evidence conventions

When a test fails or requires evidence:

- **Screenshots**: save to `docs/production-shakedown/results/evidence/phase-NN/${TEST_ID}-${description}.png`
- **Response bodies**: save to `docs/production-shakedown/results/evidence/phase-NN/${TEST_ID}-response.json`
- **Log excerpts**: save to `docs/production-shakedown/results/evidence/phase-NN/${TEST_ID}-log.txt`
- **Notes**: inline in the results table, with evidence paths

### Severity levels

In the Results table, mark severity for any FAIL:

- **P0 (critical)**: blocks launch; security breach, data loss, or complete feature breakage
- **P1 (high)**: significant feature broken; workaround may exist
- **P2 (medium)**: minor feature issue; degraded UX but functional
- **P3 (low)**: cosmetic; no functional impact

---

## What this plan DOES cover

- ✅ Every API endpoint in `app/api/v1/*.py` with every role
- ✅ Every frontend route with every role-based guard
- ✅ Multi-tenant isolation with negative tests (org A user attempts to access org B data)
- ✅ Full CRUD on every tenant-scoped resource
- ✅ Field mode offline queue + online sync + conflict resolution
- ✅ Input validation at API boundaries (SQL injection, XSS, malformed payloads)
- ✅ Concurrency — race conditions on list claiming, campaign member modifications
- ✅ Auth lifecycle — login, token refresh, expiry, forged tokens, logout
- ✅ Accessibility — WCAG AA contrast, keyboard nav, screen reader basics
- ✅ Performance smoke — page-load time, API p95s under light load
- ✅ Data integrity — FK cascades, soft-delete boundaries, referential consistency

## What this plan does NOT cover

- ❌ Load testing at scale (separate effort — k6/Artillery needed)
- ❌ Penetration testing (separate effort — professional pentest recommended)
- ❌ Chaos engineering (pod kills, network partitions)
- ❌ Backup/restore verification
- ❌ Long-term data durability
- ❌ Multi-region failover
- ❌ Email delivery validation (requires SMTP provider interaction)
- ❌ SMS delivery validation
- ❌ Real-geographic testing (volunteer in actual field, real GPS)

---

## Known pre-existing production state

As of 2026-04-05 15:00 UTC:

- **Deployed version**: `sha-c1c89c0` (commit 461432b on main)
- **Organizations**: 3 rows — "CivPulse Platform" (Org A) + 2 legacy orgs from Kerry's prior activity
- **Campaigns**: 18 rows — 17 legacy + 1 "QA Test Campaign" (created for this plan)
- **Users**: 3 — `system-bootstrap`, `Kerry Hatcher` (admin@civpulse.org), `QA Owner` (created via first login on 2026-04-05)
- **Known workarounds applied**:
  - `ALTER ROLE civpulse_run_prod BYPASSRLS` (short-term fix for migration 026 FORCE RLS issue, see CivicPulse/run-api#21)
  - `ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)` (migration name length fix, see CivicPulse/run-api#19)

These are expected to be in place. Tests should not attempt to alter these.

---

## Success criteria for production launch

Production is **go-live ready** when:

1. **Phase 00 (Environment)**: All 6 health checks PASS.
2. **Phase 01 (Auth)**: All auth flow tests PASS, no token leakage.
3. **Phase 03 (Isolation)**: **ZERO cross-tenant leaks** — this is non-negotiable.
4. **Phase 11 (RBAC)**: No permission bypasses (unexpected 200s for underprivileged roles).
5. **Phase 12 (Security)**: No SQL injection, XSS, or forged-token bypasses.
6. **Phase 10 (Field Mode)**: Offline queue drains reliably, no data loss on reconnect.
7. **All other phases**: ≥95% of tests PASS. Any P0/P1 failures MUST be resolved before launch.
8. **No open P0 issues** in `docs/production-shakedown/results/`.

---

## Changelog

- **1.0** (2026-04-05): Initial exhaustive plan covering phases 00-16. Authored post-deploy of sha-c1c89c0.
