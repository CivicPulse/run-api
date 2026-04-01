# Phase 61: AI Production Testing Instructions - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a standalone production testing document that an AI agent or human QA tester can follow to validate the deployed CivicPulse Run application. The document covers all test areas from the local testing plan, adapted for the production environment with production-specific URLs, authentication, data setup, and deployment health verification. This is a pre-launch validation — production is not yet live, so all operations (including destructive writes, imports, and full CRUD) are safe to execute.

</domain>

<decisions>
## Implementation Decisions

### Target Audience & Format
- **D-01:** Document serves dual audience — AI agent and human QA. Structured enough for automated execution, readable enough for manual QA.
- **D-02:** Format is a Markdown runbook, same style as the existing `docs/testing-plan.md` (numbered steps, preconditions, expected results).
- **D-03:** Document is a standalone copy — fully self-contained with all test steps baked in. No cross-file references to `testing-plan.md` required. Agent can execute without reading other files.
- **D-04:** Document includes inline pass/fail reporting — instructs the agent to produce a structured result table at the end with test ID, status (pass/fail/skip), and notes.

### Production Scope
- **D-05:** Tiered test structure — two tiers:
  - **Smoke suite** (~15-20 tests, ~10 min): Login, RBAC smoke, one happy-path per major domain (voter CRUD, canvassing, phone banking, volunteer, shift).
  - **Extended suite** (~50-70 tests, ~30 min): Full coverage of all domains including edge cases, filters, field mode, cross-cutting UI behaviors, accessibility spot checks.
- **D-06:** No test categories excluded. Since production is not yet live (pre-launch validation), all operations are safe — including destructive writes (delete campaign, delete org), imports (CSV upload), and offline/field mode testing.

### Auth & Data Strategy
- **D-07:** Reuse the same 15 ZITADEL test users (3 per role: owner, admin, manager, volunteer, viewer). Doc instructs agent to provision them in the prod ZITADEL instance using the existing provisioning script with prod config.
- **D-08:** Hybrid data setup — run the idempotent `seed.py` for base data (org, campaign, voters), then create operational data (turfs, walk lists, phone banks, surveys, shifts, etc.) through UI steps as part of the test flow. This validates both the seed path and UI creation workflows.
- **D-09:** No cleanup/teardown section. Test data remains in place after validation. Cleanup is manual before launch if needed.

### Environment Details
- **D-10:** Placeholder variables for all environment-specific values (${PROD_URL}, ${ZITADEL_URL}, ${DB_HOST}, etc.). A "Configuration" section at the top lists all variables the agent must set before running.
- **D-11:** Document starts with a deployment health-check section — API health endpoint, ZITADEL reachability, DB connectivity, MinIO availability. Catches environment issues before testing begins.
- **D-12:** Agent interaction is a mix of direct API calls and Playwright CLI (not MCP). API calls for setup/data operations (faster), Playwright CLI for UI validation (supports parallel test execution). Steps are written accordingly — API steps use curl/httpx patterns, UI steps are Playwright-compatible.

### Claude's Discretion
- Exact test case selection for smoke vs extended tiers (guided by domain coverage goals)
- Health check specific endpoints and assertions
- Variable naming conventions in the configuration section
- How to structure the pass/fail result table

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Testing Plan (primary source)
- `docs/testing-plan.md` — The comprehensive 130+ test case local testing plan. All test IDs (AUTH-01 through CROSS-03) and test structure originate here. Production doc is a standalone adaptation of this content.

### Test Infrastructure
- `web/e2e/fixtures.ts` — Playwright test fixtures and auth setup patterns
- `web/scripts/run-e2e.sh` — E2E test runner wrapper with logging
- `web/playwright.config.ts` — Playwright configuration (projects, auth states, timeouts)

### Deployment & Environment
- `docs/k8s-deployment-guide.md` — K8s deployment procedures (referenced for health check endpoints and service architecture)
- `k8s/apps/run-api-prod/` — Production K8s manifests (configmap, deployment, ingress, service)
- `docker-compose.yml` — Local service architecture (API, PostgreSQL, MinIO, ZITADEL) as reference for prod equivalents

### Seed Data & User Provisioning
- `scripts/seed.py` — Idempotent Macon-Bibb County demo dataset script
- `scripts/bootstrap-zitadel.py` — ZITADEL user provisioning script (if exists)

### Getting Started Guides (context for test flows)
- `docs/getting-started-admin.md` — Admin workflow reference
- `docs/getting-started-campaign-manager.md` — Campaign manager workflow reference
- `docs/getting-started-volunteer.md` — Volunteer workflow reference

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docs/testing-plan.md`: Complete test case library (130+ tests, 34 sections) — primary content source for the production doc
- `scripts/seed.py`: Idempotent seed script that can run against any database (local or prod)
- 55 Playwright E2E spec files in `web/e2e/` — reference for what's already automated locally
- `web/e2e/fixtures.ts`: Auth fixture patterns showing how test users authenticate

### Established Patterns
- Test cases follow a consistent format: Preconditions, Steps, Expected Results
- ZITADEL OIDC auth flow is well-documented in existing test infrastructure
- Playwright CLI supports parallel execution via `--workers` flag
- API health check at `/api/v1/config/public`

### Integration Points
- Production ZITADEL instance (separate from local) — needs user provisioning
- Production PostgreSQL — seed script targets this for base data
- Production MinIO (if applicable) — file storage for imports
- Playwright CLI runs against production URLs rather than localhost

</code_context>

<specifics>
## Specific Ideas

- Production is NOT live yet — this is pre-launch validation, so all operations (including destructive ones) are safe
- Playwright CLI chosen over Playwright MCP because CLI supports parallel test execution
- API calls used for data setup operations for speed; Playwright CLI for UI validation
- The document should work as a "run this to validate the deployment is ready for real users" checklist

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 61-ai-production-testing-instructions*
*Context gathered: 2026-03-30*
