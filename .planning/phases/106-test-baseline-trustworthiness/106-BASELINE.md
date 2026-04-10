# Phase 106 Baseline — Test Suite Failures

**Captured:** 2026-04-10 19:36 EDT
**Captured against:** 4d01c90cd9332c4586f4737e26e3c9d4c6135fa2 (branch `gsd/v1.18-field-ux-polish`)
**Docker stack state:** all services Up after full recreate this run; alembic at `039_volunteer_applications (head)`
**Per D-05 this file is the phase scope fence. Any failure not listed here is a NEW regression and out-of-scope.**

> **Environment note (material to triage):**
> The docker stack was fully recreated at the start of this baseline run because `minio`, `zitadel`, `zitadel-db`, and `zitadel-bootstrap` were in `Exited (0)` state (stack had been partially down for 3 days). Recreate also pulled ZITADEL v4.10.1 (from v2.71.6 previously) and re-ran `zitadel-bootstrap`. This has two knock-on effects visible in the baseline below:
>
> 1. **Postgres host port changed** from the previously-fixed `:5433` to an ephemeral `:49374` (see `docker compose ps`). Host-side pytest (`uv run pytest` from the repo root) is still configured to hit `localhost:5433`, so every integration test that opens an asyncpg connection fails with `OSError: Connect call failed (...5433)`. This produces **92 of the 104 pytest errors** as a single root cause.
> 2. **ZITADEL login form not reachable** by Playwright's locator during auth setup. All 5 auth setup projects time out at `findIdentifierInput` in `web/e2e/auth-flow.ts`. The wrapper's strict-policy check passed (wrapper did not exit early), so this is either a ZITADEL v4 login-UI locator drift or the bootstrap-created E2E users not being present. This produces **5 Playwright fails + 391 did-not-run**.
>
> Both of these are pre-existing environment-drift issues, not new product bugs. They belong in Phase 106 scope per D-05/D-06 because they are the reason the test suites cannot produce trustworthy signal today. A triage plan may decide to fix the env drift (unblock the suite) rather than fix individual tests. Decisions on that belong to the scope-gate checkpoint that follows this task.

## Summary

| Suite      | Pass | Fail  | Flaky-suspect | Unjustified Skip | Total runnable |
|------------|------|-------|---------------|------------------|----------------|
| pytest     | 1011 | 12    | 0 (single run) | 0 (1 skipif is justified) | 1115 |
| vitest     | 614  | 65    | 0 (single run) | 0                | 686 (+24 todo, 7 skipped files excluded by .todo) |
| Playwright | 0    | 5 (+391 did-not-run, blocked by auth setup) | unknown | 11 markers across 7 D-11 files (see audit) | 396 |
| **TOTAL pytest+vitest hard fails** | — | **77 fail + 92 error = 169** | — | — | — |
| **TOTAL Playwright hard fails**    | — | **5 (suite blocked)**                     | — | — | — |

**Scope fence implication:** Even excluding the 92 pytest errors (single root cause: host-port drift) and the 5 Playwright fails (single root cause: auth setup broken), **the baseline already exceeds the 50-fail scope-explosion threshold** from Task 3 (`12 pytest fail + 65 vitest fail = 77`). See the "Scope Explosion Analysis" section at the bottom.

## Pytest (backend)

### 12 hard failures (FAILED)

| File | Test Name | Failure Mode | Initial Verdict | Notes |
|------|-----------|--------------|-----------------|-------|
| tests/integration/test_canvassing_rls.py | TestCanvassingRLSIsolation::test_voter_geom_column_exists | hard fail | investigate | Could be schema drift (A1) — geom column rename or PostGIS extension state |
| tests/integration/test_data_integrity.py | test_shift_signup_race_no_overflow | hard fail | investigate | Concurrency test; may be flake — needs rerun |
| tests/integration/test_data_integrity.py | test_dnc_concurrent_import | hard fail | investigate | Concurrency / parallel DNC import |
| tests/integration/test_data_integrity.py | test_voter_interactions_indexes_exist | hard fail | investigate | Index-presence assertion; may reflect migration drift |
| tests/integration/test_data_integrity.py | test_reinvite_after_accept_allowed | hard fail | investigate | Invite lifecycle |
| tests/integration/test_data_integrity.py | test_duplicate_pending_invite_blocked | hard fail | investigate | Uniqueness constraint on invites |
| tests/integration/test_data_integrity.py | test_voter_email_unique_violation | hard fail | investigate | Voter email unique constraint |
| tests/integration/test_data_integrity.py | test_volunteer_tag_unique_violation | hard fail | investigate | Volunteer tag unique constraint |
| tests/integration/test_data_integrity.py | test_dnc_has_unique_constraint | hard fail | investigate | DNC unique constraint |
| tests/integration/test_import_parallel_processing.py | test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list | hard fail | investigate | Parallel chunk dispatch; timing-sensitive |
| tests/integration/test_rls_hardening.py | test_migration_reversible | hard fail | investigate | Alembic downgrade path |
| tests/integration/test_spatial.py | TestSpatialOperations::test_postgis_extension_active | hard fail | investigate | PostGIS availability |

### 92 ERRORs (collection / fixture failures — single root cause)

All 92 errors share the same exception: `OSError: Multiple exceptions: [Errno 111] Connect call failed ('::1', 5433, 0, 0), [Errno 111] Connect call failed ('127.0.0.1', 5433)`. Root cause: docker compose rebuild assigned postgres host port `:49374` but the test runner is still configured for the prior fixed `:5433`.

Error distribution by file:

| Count | File | Notes |
|-------|------|-------|
| 18 | tests/integration/test_tenant_isolation.py | All collection/connect errors |
| 12 | tests/integration/test_voter_rls.py | RLS isolation fixtures all blocked |
| 9  | tests/integration/test_rls_api_smoke.py | RLS smoke suite blocked |
| 8  | tests/integration/test_canvassing_rls.py | Canvassing RLS isolation |
| 7  | tests/integration/test_rls_hardening.py | RLS hardening |
| 6  | tests/integration/test_phase78_tenant_containment.py | Tenant containment |
| 5  | tests/integration/test_volunteer_rls.py | Volunteer RLS |
| 5  | tests/integration/test_phone_banks.py | Phone banks |
| 5  | tests/integration/test_phone_banking_rls.py | Phone banking RLS |
| 5  | tests/integration/test_assignment_idempotency.py | Assignment idempotency |
| 4  | tests/integration/test_rls.py | RLS base |
| 3  | tests/integration/test_spatial.py | Spatial |
| 3  | tests/integration/test_rls_isolation.py | Pool isolation |
| 2  | tests/integration/test_critical_path.py | Critical path |

**Verdict for all 92 errors: `investigate-env-first`.** Fix the host-port drift (update `.env` `DATABASE_URL` or re-pin postgres to `:5433` in docker-compose) and re-run this subset before triaging as individual test bugs. Per D-09, this is an allowable minimal test-infra fix because it unblocks the entire integration suite with zero test-code changes.

### Pytest skip/xfail audit (D-10)

| File | Line | Marker | Justified? |
|------|------|--------|-----------|
| tests/integration/test_l2_import.py | 24 | `pytestmark = pytest.mark.skipif(...)` | **Yes** — conditional on fixture data availability; adjacent comment explains. No action needed. |

No other `pytest.mark.skip` / `xfail` / `@pytest.skip` found across `tests/`. Backend is clean for D-10.

## Vitest (frontend unit)

**Result:** 7 test files fail, 65 tests fail, 614 pass, 24 todo, 7 tests skipped (via `.todo`). Total test files: 80.

### Failing test files

| File | Failing tests | Observed failure mode | Initial Verdict | Notes |
|------|---------------|----------------------|-----------------|-------|
| src/hooks/useCanvassing.test.ts | (full file) | multiple | investigate | Canvassing hook — **Pitfall 5 candidate**: phase 107 CANV-01 rewrites canvassing; likely delete-with-reference |
| src/hooks/usePermissions.test.ts | (full file) | multiple | investigate | Permissions hook — not downstream-rewritten; probably mechanical fix |
| src/hooks/useVolunteerTags.test.ts | (full file) | multiple | investigate | Volunteer tags hook |
| src/routes/callback.test.tsx | (full file) | multiple | investigate | OIDC callback — auth-adjacent |
| src/routes/campaigns/$campaignId/phone-banking/dnc/index.test.tsx | (full file) | multiple | investigate | DNC index route |
| src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.test.tsx | **34 tests fail** | `TypeError: signups.map is not a function` at `index.tsx:261` | fix | Root cause: `volunteersData` default is `[]` but test mocks return `undefined`, or mock shape changed. **Single-file mechanical fix likely.** |
| src/routes/campaigns/$campaignId/volunteers/shifts/index.test.tsx | multiple | `expect(getByTestId("empty-state"))` and similar | fix | Empty-state / shift listing |

### Sample failure signatures

- `src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.test.tsx`:
  ```
  TypeError: signups.map is not a function
    at src/routes/campaigns/$campaignId/volunteers/shifts/$shiftId/index.tsx:261:19
  ```
  The component has `const signups = volunteersData ?? []` but the test's mock `volunteersData` is apparently not the array the component expects. Pattern is "test mock schema drift."

### Vitest skip/fixme/only audit (D-10)

No `.skip(`, `.fixme(`, `.only(`, `describe.skip`, `it.skip`, `test.skip`, `describe.only`, `it.only`, `test.only` markers found in `web/src/**/*.test.{ts,tsx}` or `web/src/**/*.spec.{ts,tsx}`. The 7 "skipped" tests in the run summary are `.todo()` entries (24 total counted), which are a separate concern and out of scope for D-10 (they are explicit TODO markers, not skipped failing tests).

**Verdict: vitest unit tests are clean for D-10.**

## Playwright (E2E)

**Result: SUITE BLOCKED.** The full run aborted during auth setup. 5 auth setup projects failed, 391 tests did not run, 0 passed.

### Failing specs (all 5 are auth setup)

| Spec | Test Name | Failure Mode | Flake History (e2e-runs.jsonl) | Initial Verdict | Notes |
|------|-----------|--------------|--------------------------------|-----------------|-------|
| web/e2e/auth-owner.setup.ts | authenticate as owner | `locator('#loginName, input[name=\'loginName\'], ...').toBeVisible()` timeout 30s | n/a (setup project) | investigate-env | ZITADEL v4 login UI locator drift OR E2E users not bootstrapped |
| web/e2e/auth-admin.setup.ts | authenticate as admin | same | n/a | investigate-env | same |
| web/e2e/auth-manager.setup.ts | authenticate as manager | same | n/a | investigate-env | same |
| web/e2e/auth-viewer.setup.ts | authenticate as viewer | same | n/a | investigate-env | same |
| web/e2e/auth-volunteer.setup.ts | authenticate as volunteer | same | n/a | investigate-env | same |

### 391 did-not-run tests

Cannot enumerate individual failing E2E tests because the auth gate blocks everything downstream. Baseline for Playwright per-spec failure modes will only be possible once auth setup is fixed — this is the second environmental blocker (after the pytest host-port issue).

**Recommended next step:** Wave-0.5 "unblock E2E auth" (rebootstrap ZITADEL E2E users via `scripts/create-e2e-users.py`, verify locator resolution against ZITADEL v4 UI, possibly update `web/e2e/auth-flow.ts` selectors). Then re-capture the Playwright portion of this baseline. Per D-09 this is an allowable minimal infra fix because it unblocks the entire suite.

### D-11 known-skip audit

| File | Line | Marker | Adjacent justification comment? | Verdict |
|------|------|--------|---------------------------------|---------|
| web/e2e/rbac.admin.spec.ts | 100 | `test.skip("campaign settings > danger zone: Transfer Ownership and Delete Campaign NOT visible (owner-only)", ...)` | **No** | D-10 violation → needs justification or delete |
| web/e2e/rbac.manager.spec.ts | 138 | `test.skip("campaign settings: Members nav link is visible but members content is NOT accessible", ...)` | **No** | D-10 violation |
| web/e2e/rbac.manager.spec.ts | 151 | `test.skip("campaign settings danger zone: Transfer and Delete NOT visible", ...)` | **No** | D-10 violation |
| web/e2e/rbac.viewer.spec.ts | 36  | `test.skip("voter detail: Edit button is NOT visible", ...)` | **No** | D-10 violation |
| web/e2e/rbac.viewer.spec.ts | 50  | `test.skip("voter detail: Add Interaction button IS visible for viewer", ...)` | **No** | D-10 violation |
| web/e2e/rbac.viewer.spec.ts | 131 | `test.skip("campaign settings: Members nav link IS visible but members content is gated", ...)` | **No** | D-10 violation |
| web/e2e/voter-crud.spec.ts | 518 | `test.skip(true, "Only ${N} non-test voters found via API — skipping VCRUD-03")` | **Yes** (runtime-conditional with inline explanation) | justify-skip |
| web/e2e/table-sort.spec.ts | 125 | `test.describe.skip("Sort buttons visible but non-functional (BUG) — skipped: documents known bugs, not regression tests", ...)` | **Yes** (description doubles as rationale) | justify-skip or delete — documents bug not regression |
| web/e2e/phase21-integration-polish.spec.ts | 409 | `test.skip(...)` (multi-line) | needs inspection | needs-review |
| web/e2e/cross-cutting.spec.ts | 344 | `test.skip(...)` (multi-line) | needs inspection | needs-review |
| web/e2e/cross-cutting.spec.ts | 517 | `test.skip(true, "Invalid campaign ID renders empty main — investigate ky/TanStack Query retry interaction")` | **Yes** (inline rationale) | justify-skip |

**Summary:** 6 of the 11 skip markers have no adjacent justification comment (all 3 rbac.* files). Per D-10 each must be fixed-to-run or deleted in triage. 5 have inline rationale and are D-10-compliant.

### Historical flake hit list cross-reference

Baseline could not enumerate these (suite blocked at auth). Once E2E auth is unblocked, re-capture and populate:

- shifts.spec.ts (59 historical) — did not run
- surveys.spec.ts (39) — did not run
- voter-tags.spec.ts (37) — did not run
- voter-filters.spec.ts (31) — did not run
- voter-contacts.spec.ts (25) — did not run
- volunteer-tags-availability.spec.ts (19) — did not run
- cross-cutting.spec.ts (15) — did not run; also D-11 known-skip file
- campaign-settings.spec.ts (14) — did not run
- voter-crud.spec.ts (12) — did not run; also D-11 known-skip file
- voter-lists.spec.ts (12) — did not run
- voter-notes.spec.ts (12) — did not run

## Cross-reference with phases 107-110 (pitfall 5)

Any failing test matching these patterns should be DELETED with a commit-body reference to the downstream phase, not fixed:

- `canvassing-*`, auto-advance, skip house → Phase 107 (CANV-01/02/03)
  - **Candidate hits in this baseline:** `src/hooks/useCanvassing.test.ts` (vitest, whole file failing)
- house tap / active state → Phase 108 (SELECT-01/02/03)
  - Cannot evaluate Playwright candidates until suite unblocks
- leaflet / map marker / list overlay → Phase 109 (MAP-01/02/03)
  - Cannot evaluate
- offline / sync / connectivity → Phase 110 (OFFLINE-01/02/03)
  - Cannot evaluate

## Scope Explosion Analysis (Risk 1)

The plan Task 3 checkpoint fires at **> 50 total failing tests**. This baseline records:

- **77 hard fails** across pytest (12) + vitest (65), not counting the 92 env-blocked pytest errors and not counting any Playwright tests (suite aborted)
- **+ 92 pytest errors** with a single root cause (postgres host port drift) — arguably one fix clears all 92
- **+ 5 Playwright fails + 391 did-not-run**, also with a likely single root cause (auth bootstrap)
- **+ 6 D-10-violating E2E skip markers** to audit per the decision log

**Total currently enumerable scope: 77 individual hard fails + 92 env-blocked collections + 5 suite-blocking auth fails + 6 skip-audit items = 180 items.**

This is **well beyond** the 50-fail scope threshold, but the composition matters:
- ~97 items (92 + 5) may collapse to **two environmental fixes** (host port, auth bootstrap)
- Remaining 77 + 6 = 83 items are genuine per-test triage

Even in the optimistic "env fixes everything env-blocked" scenario, 83 items × 15 min/test = **~21 hours of triage work** for D-01's time-boxed approach, far exceeding typical phase appetite for a "trustworthiness" phase.

**This baseline forces the Task 3 scope-explosion checkpoint.**

---

*Generated by phase 106-01 baseline capture. Raw suite output is in `artifacts/*-baseline.txt` (gitignored).*
