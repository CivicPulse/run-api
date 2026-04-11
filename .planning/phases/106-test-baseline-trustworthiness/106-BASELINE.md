# Phase 106 Baseline — Test Suite Failures

**Captured:** 2026-04-10 19:36 EDT (initial) / 2026-04-10 19:58 EDT (Playwright re-capture post env-unblock)
**Captured against:** 4d01c90cd9332c4586f4737e26e3c9d4c6135fa2 → 2e830c6 (branch `gsd/v1.18-field-ux-polish`)
**Docker stack state:** all services Up after full recreate + API image rebuild; alembic at `039_volunteer_applications (head)`
**Per D-05 this file is the phase scope fence. Any failure not listed here is a NEW regression and out-of-scope.**

> **Environment unblock log (post-initial-capture fixes, all D-09-compliant minimal infra):**
> The initial 2026-04-10 19:36 capture was heavily distorted by three compounding pre-existing env drift issues. The user approved an "env-unblock first" path at the Task 3 scope gate. Three fix commits followed:
>
> 1. **Commit `ae63e34`** — `fix(106-01): align integration test DB port with docker compose .env`. Integration conftest was hardcoded to `TEST_DB_PORT=5433`, but `.env` uses a 493xx host-port scheme (`PG_HOST_PORT=49374`). Result before: 92 pytest errors with `Connect call failed (127.0.0.1, 5433)`. Result after: 1113 passed, **2 hard fails, 0 errors**. Net: 102 pytest items cleared.
> 2. **Commit `2e830c6`** — `fix(106-01): support external dev server URL for E2E against docker web`. Playwright was auto-spawning a separate preview webserver because it couldn't reach `localhost:5173` (web container publishes on 49372). Added `E2E_DEV_SERVER_URL` override that skips the built-in webServer and uses the running docker web directly. Also re-synced stale `web/.env.local` (pre-v4 ZITADEL IDs) and rebuilt the docker API image (was missing `twilio` dep added to pyproject.toml). Auth setup went from 30s timeout to 1.7s pass.
> 3. After those three fixes the **real** Playwright baseline was captured (2026-04-10 19:58): 93 pass, **152 fail**, 15 skip, 136 did-not-run (cascade).
>
> **Material takeaway for triage planning:** the original "169 fail + 92 error + 5 blocked" count was 97 items of env pollution and 2+65+152 = **219 real hard fails** underneath. That's still a scope explosion (>50), but a different composition: the real hot spots are rbac.* and phase*-verify specs, NOT the historical flake hit list from RESEARCH.md.

## Summary (post env-unblock)

| Suite      | Pass | Fail  | Flaky-suspect | Unjustified Skip | Total runnable |
|------------|------|-------|---------------|------------------|----------------|
| pytest     | 1113 | **2** | 0 (single run) | 0 (1 skipif is justified) | 1115 |
| vitest     | 614  | **65** | 0 (single run) | 0                | 686 (+24 todo, 7 skipped via .todo) |
| Playwright | 93   | **152** (+136 did-not-run cascade) | unknown — needs 3x reruns in triage | 6 D-10-violating (unjustified) + 5 compliant + 2 needs-review out of 11 total markers | 396 |
| **TOTAL real hard fails** | — | **2 + 65 + 152 = 219** | — | 6 | — |

### Initial-capture Summary (historical, left in place for audit trail)

| Suite      | Pass | Fail  | Notes |
|------------|------|-------|-------|
| pytest     | 1011 | 12 + 92 errors | 92 errors were all `Connect call failed :5433` → single env root cause |
| vitest     | 614  | 65 | unchanged between runs |
| Playwright | 0    | 5 (+391 did-not-run) | All 5 were auth setup blocked; cleared by env unblock |

**Scope fence implication:** Both the original AND the post-unblock baselines exceed the 50-fail scope-explosion threshold. After env unblock the real count is **219 hard fails** (2 pytest + 65 vitest + 152 Playwright). See the "Scope Explosion Analysis" section at the bottom for the re-evaluation.

## Pytest (backend) — post env-unblock

**Post-unblock result:** 1113 passed, **2 failed**, 0 errors, 1 warning in 71.81s. Captured via `uv run pytest --tb=no -q` after commit `ae63e34`. Raw log: `artifacts/pytest-post-unblock.txt`.

### 2 hard failures (FAILED)

| File | Test Name | Failure Mode | Initial Verdict | Notes |
|------|-----------|--------------|-----------------|-------|
| tests/integration/test_canvassing_rls.py | TestCanvassingRLSIsolation::test_door_knock_persists_survey_responses_for_authoritative_readback | hard fail | **delete-per-pitfall-5** | Canvassing domain — phase 107 CANV-01 rewrites door-knock flow; fix is likely wasted |
| tests/integration/test_import_parallel_processing.py | test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list | hard fail | investigate | Parallel chunk dispatch; timing-sensitive — needs pytest 3x rerun to confirm flake vs hard |

**Initial-capture pytest list (pre env-unblock, left for audit trail):**

The initial capture (commit `9199a81`) showed 12 FAILED + 92 ERRORS. 10 of those 12 "failures" and all 92 of those errors were ENVIRONMENT pollution (postgres host-port drift), not real test bugs. After commit `ae63e34` aligned the conftest port resolution with `PG_HOST_PORT`, the real count collapsed to the 2 tests above. The 10 now-passing tests from the original list were:

- test_canvassing_rls::test_voter_geom_column_exists ✅ passes
- test_data_integrity::test_shift_signup_race_no_overflow ✅ passes
- test_data_integrity::test_dnc_concurrent_import ✅ passes
- test_data_integrity::test_voter_interactions_indexes_exist ✅ passes
- test_data_integrity::test_reinvite_after_accept_allowed ✅ passes
- test_data_integrity::test_duplicate_pending_invite_blocked ✅ passes
- test_data_integrity::test_voter_email_unique_violation ✅ passes
- test_data_integrity::test_volunteer_tag_unique_violation ✅ passes
- test_data_integrity::test_dnc_has_unique_constraint ✅ passes
- test_rls_hardening::test_migration_reversible ✅ passes
- test_spatial::TestSpatialOperations::test_postgis_extension_active ✅ passes

(11 shown because test_canvassing_rls::test_voter_geom_column_exists was originally counted as failing under the old fixture behavior but now passes cleanly.)

**The 92 pre-unblock ERRORs are all gone.** They were all `OSError: Connect call failed ('127.0.0.1', 5433)` — single root cause, single fix.

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

> **Re-captured 2026-04-10 19:58 EDT after env unblock (commits 4d01c90, ae63e34, 2e830c6).** Original capture was blocked at auth setup due to three compounding env issues: stale docker API image (missing `twilio` dep), stale `web/.env.local` (pre-v4 ZITADEL IDs), and Playwright auto-spawning its own preview webserver on a conflicting port. All three were resolved as D-09-compliant minimal infra fixes. The per-suite pytest and vitest sections above are unchanged; only this Playwright section reflects the post-unblock run.

**Result:** 93 passed, **152 failed**, 15 skipped, 136 did-not-run, 396 total. Duration 69.6s, workers 16. Exit code 1.

Run landed in `web/e2e-runs.jsonl` per D-13 (entry `2026-04-10T23:58:58Z`, command `npx playwright test --reporter=list --workers 16`, mode `preview` — the wrapper logs "preview" because the auto-detect still probes `localhost:5173`, but the actual base URL was `https://kudzu.tailb56d83.ts.net:49372` via `E2E_DEV_SERVER_URL`).

### Failing spec distribution (152 tests across ~55 specs)

Top failing-spec clusters (uniq -c sorted):

| Count | Spec | Notes |
|-------|------|-------|
| 11 | e2e/phase13-voter-verify.spec.ts | Voter verification (likely schema/UI drift) |
| 10 | e2e/rbac.volunteer.spec.ts | Volunteer role gates |
| 10 | e2e/rbac.viewer.spec.ts | Viewer role gates (also has 3 D-11 unjustified `test.skip`) |
| 10 | e2e/rbac.manager.spec.ts | Manager role gates (also has 2 D-11 unjustified `test.skip`) |
| 10 | e2e/phase12-settings-verify.spec.ts | Campaign settings verification |
| 8  | e2e/rbac.admin.spec.ts | Admin role gates (also has 1 D-11 unjustified `test.skip`) |
| 6  | e2e/rbac.spec.ts | Cross-role baseline |
| 6  | e2e/phase29-verify.spec.ts | Phase 29 feature verification |
| 6  | e2e/phase21-integration-polish.spec.ts | Phase 21 polish (also has 1 D-11 known-skip) |
| 5  | e2e/uat-tooltip-popovers.spec.ts | Tooltip/popover UAT |
| 5  | e2e/phase27-filter-wiring.spec.ts | Voter filter wiring |
| 5  | e2e/phase14-import-verify.spec.ts | Import verification |
| 5  | e2e/field-mode.volunteer.spec.ts | **Pitfall 5 candidate** (field mode → phase 107 CANV) |
| 5  | e2e/cross-cutting.spec.ts | Cross-cutting (also D-11 known-skip) |
| 4  | e2e/phase32-verify.spec.ts | Phone banking field mode |
| 4  | e2e/map-interactions.spec.ts | **Pitfall 5 candidate** (map → phase 109 MAP) |
| 3  | e2e/voter-isolation.spec.ts | Voter tenant isolation |
| 3  | e2e/volunteer-signup.spec.ts | Volunteer signup flow |
| 3  | e2e/phase20-caller-picker-verify.spec.ts | Caller picker |
| 2  | e2e/table-sort.spec.ts | Table sort (D-11 known-skip) |
| 2  | e2e/campaign-settings.spec.ts | Campaign settings CRUD |
| 2  | e2e/auth-guard-redirect.spec.ts | Auth-guard redirects |
| 1  | e2e/walk-lists.spec.ts | Walk lists (**Pitfall 5 candidate** → phase 107) |
| 1  | e2e/voter-tags.spec.ts | (historical hit list rank 3) |
| 1  | e2e/voter-notes.spec.ts | (historical hit list rank 11) |
| 1  | e2e/voter-lists.spec.ts | (historical hit list rank 10) |
| 1  | e2e/voter-import.spec.ts | |
| 1  | e2e/voter-filters.spec.ts | (historical hit list rank 4) |
| 1  | e2e/voter-crud.spec.ts | (historical hit list rank 9, D-11 known-skip) |
| 1  | e2e/voter-contacts.spec.ts | (historical hit list rank 5) |
| 1  | e2e/volunteer-tags-availability.spec.ts | (historical hit list rank 6) |
| 1  | e2e/volunteers.spec.ts | |
| 1  | e2e/uat-volunteer-manager.spec.ts | |
| 1  | e2e/uat-overlap-highlight.spec.ts | |
| 1  | e2e/turfs.spec.ts | |
| 1  | e2e/surveys.spec.ts | (historical hit list rank 2) |
| 1  | e2e/shifts.spec.ts | (historical hit list rank 1 — 59 historical fails, now 1) |
| 1  | e2e/role-gated.volunteer.spec.ts | |
| 1  | e2e/phone-banking.spec.ts | |
| 1  | e2e/phase35-touch-targets.spec.ts | |

(Plus several more with 1 failure each. Full raw list in `artifacts/playwright-baseline-v2.txt`.)

### Verdict assignment by cluster

| Cluster | Tests | Verdict | Rationale |
|---------|-------|---------|-----------|
| rbac.{admin,manager,viewer,volunteer,spec}.ts | 44 | investigate | Role-gate test suite likely needs selector or route updates after ZITADEL v4 + recent UI churn; cluster fix is probably one or two shared helpers |
| phase12/13/14/20/21/27/29/32/35.*.verify.spec.ts | ~43 | investigate | "Phase verify" specs that assert behaviors from older milestones; may be outdated or share a fixture break |
| field-mode.volunteer / map-interactions / walk-lists | 10 | **delete-per-pitfall-5** | Phase 107 CANV and phase 109 MAP will rewrite these — fix-attempts are wasted work per D-08 |
| cross-cutting.spec.ts | 5 | investigate OR delete | Already D-11 known-skip; 5 hard fails today. Candidates for delete with reference to new targeted specs |
| uat-*.spec.ts | 7 | investigate | UAT specs from recent milestones; probably mechanical |
| Historical hit-list specs (shifts/surveys/voter-*) | 11 | fix | These had 12-59 historical failing runs. With only 1 fail each today they look largely fixed already — mechanical selector/wait cleanup likely |
| auth-guard-redirect / call-lists-dnc / call-page-checkin / etc. | ~32 | investigate | Mixed; needs per-spec triage |

### 136 did-not-run tests

Most are downstream cascades from a failing earlier test in the same `test.describe.serial` block. They will run automatically once the upstream fail is triaged; they are NOT a separate scope item.

### D-11 known-skip audit (unchanged from initial capture)

| File | Line | Marker | Adjacent justification comment? | Verdict |
|------|------|--------|---------------------------------|---------|
| web/e2e/rbac.admin.spec.ts | 100 | `test.skip("campaign settings > danger zone: Transfer Ownership and Delete Campaign NOT visible (owner-only)", ...)` | **No** | D-10 violation → needs justification or delete |
| web/e2e/rbac.manager.spec.ts | 138 | `test.skip("campaign settings: Members nav link is visible but members content is NOT accessible", ...)` | **No** | D-10 violation |
| web/e2e/rbac.manager.spec.ts | 151 | `test.skip("campaign settings danger zone: Transfer and Delete NOT visible", ...)` | **No** | D-10 violation |
| web/e2e/rbac.viewer.spec.ts | 36  | `test.skip("voter detail: Edit button is NOT visible", ...)` | **No** | D-10 violation |
| web/e2e/rbac.viewer.spec.ts | 50  | `test.skip("voter detail: Add Interaction button IS visible for viewer", ...)` | **No** | D-10 violation |
| web/e2e/rbac.viewer.spec.ts | 131 | `test.skip("campaign settings: Members nav link IS visible but members content is gated", ...)` | **No** | D-10 violation |
| web/e2e/voter-crud.spec.ts | 518 | `test.skip(true, "Only ${N} non-test voters found via API — skipping VCRUD-03")` | **Yes** | justify-skip — compliant |
| web/e2e/table-sort.spec.ts | 125 | `test.describe.skip("Sort buttons visible but non-functional (BUG) — skipped: documents known bugs, not regression tests", ...)` | **Yes** | justify-skip or delete — documents bug not regression |
| web/e2e/phase21-integration-polish.spec.ts | 409 | `test.skip(...)` | needs inspection | needs-review |
| web/e2e/cross-cutting.spec.ts | 344 | `test.skip(...)` | needs inspection | needs-review |
| web/e2e/cross-cutting.spec.ts | 517 | `test.skip(true, "Invalid campaign ID renders empty main — investigate ky/TanStack Query retry interaction")` | **Yes** | justify-skip — compliant |

**Summary:** 6 D-10 violations (all in rbac.*); 5 compliant; 2 need inspection. Unchanged from initial capture.

### Historical flake hit list cross-reference (now enumerable)

Per RESEARCH.md, these specs had the highest historical failing-run counts. Today's baseline is **much tamer** than history suggested:

| Rank | Spec | Historical fails | This baseline |
|------|------|------------------|---------------|
| 1 | shifts.spec.ts | 59 | **1** — one failing test, not a cluster |
| 2 | surveys.spec.ts | 39 | **1** |
| 3 | voter-tags.spec.ts | 37 | **1** |
| 4 | voter-filters.spec.ts | 31 | **1** |
| 5 | voter-contacts.spec.ts | 25 | **1** |
| 6 | volunteer-tags-availability.spec.ts | 19 | **1** |
| 7 | cross-cutting.spec.ts | 15 | **5** (also D-11 known-skip) |
| 8 | campaign-settings.spec.ts | 14 | **2** |
| 9 | voter-crud.spec.ts | 12 | **1** (also D-11 known-skip) |
| 10 | voter-lists.spec.ts | 12 | **1** |
| 11 | voter-notes.spec.ts | 12 | **1** |

**Surprise:** The historical hit list is almost entirely stale — most of those specs stabilized between the last full-suite run in early April and now. The real hot spots in this baseline are the rbac.* suite (44 fails) and the phase12/13/14/*-verify.spec.ts suite (~43 fails), neither of which was in the historical top 10.

**Implication for triage planning:** RESEARCH.md's pre-weighting is wrong for the current state. Triage plans 106-02/03/04 should re-weight toward rbac.* and phase*-verify.spec.ts instead.

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

## Scope Explosion Analysis (Risk 1) — post env-unblock

The plan Task 3 checkpoint fires at **> 50 total failing tests**. After the env-unblock work, the real baseline records:

- **2 pytest hard fails** (down from 12 + 92 env-blocked) — 90% collapse
- **65 vitest hard fails** (unchanged — real test bugs, not env)
- **152 Playwright hard fails** (now enumerable; originally the suite was 100% blocked)
- **+ 136 Playwright did-not-run** from downstream cascades in `test.describe.serial` blocks (not new scope — will re-run when the upstream fail is fixed)
- **+ 6 D-10-violating E2E `test.skip` markers** (all in rbac.{admin,manager,viewer}.spec.ts)

**Total real hard fails: 2 + 65 + 152 = 219 tests.**
**Plus 6 skip-audit items = 225 triage items.**

### Composition after env unblock

| Category | Count | Time budget @15 min/test (D-01) |
|----------|-------|--------------------------------|
| Pytest — real per-test triage | 2 | 30 min |
| Vitest — 1 mechanical cluster fix (shifts/$shiftId, 34 tests from 1 `signups.map` bug) | "1 fix" | ~30 min (1 fix clears 34) |
| Vitest — 31 other tests across 6 files | 31 | ~7.75h |
| Playwright — rbac.* cluster (44 tests, likely shared helper fix) | "1-2 fixes" | ~1h |
| Playwright — phase*-verify.spec.ts cluster (~43 tests) | variable | ~5-10h depending on how shared |
| Playwright — pitfall-5 delete-with-reference (field-mode.volunteer, map-interactions, walk-lists = 10 tests) | "3 delete commits" | ~15 min |
| Playwright — historical hit-list (11 tests, 1 each) | 11 | ~2.75h |
| Playwright — other scattered (~44 tests) | 44 | ~11h |
| D-11 skip-audit | 6 | ~1h |
| **TOTAL BEST CASE (aggressive clustering)** | — | **~10-15h** |
| **TOTAL WORST CASE (no clustering)** | — | **~25-30h** |

### Why 219 is more tractable than it looks

1. **Vitest**: 34 of 65 failures are in ONE file with ONE root cause (`signups.map is not a function`). A single mechanical mock/component fix likely clears all 34. The remaining 31 are across 6 other files — plausibly another 2-3 cluster fixes.
2. **Playwright rbac cluster (44 tests)**: All 5 rbac specs failing in parallel strongly suggests a shared helper or baseline-state issue, not 44 independent bugs. Probably 1-2 fixes clear the cluster.
3. **Playwright phase*-verify cluster (~43 tests)**: These are older "verification" specs from phases 12-35. Many test behaviors that have since evolved. Some are pitfall-5 candidates (phase32-verify.spec.ts touches phone banking field mode which phase 107 may touch). Expected verdict mix: ~50% delete-with-reference, ~50% fix.
4. **Playwright pitfall-5 10 tests**: 3 delete commits per D-08, not 10 individual fixes.
5. **Historical hit-list is stale**: The top-11 historical flakes are down from 12-59 fails each to 1 fail each — most are already mechanically fixed.

### Scope recommendation (for the re-evaluated checkpoint)

Still exceeds the strict 50 threshold, but with much cleaner composition. **Options for the user:**

- **A. Accept current scope and proceed with clustered triage** — aggressive-clustering best case is ~10-15h of work spread across plans 106-02 (pytest+vitest), 106-03 (Playwright rbac+phase-verify), and 106-04 (remaining Playwright + D-11 skip audit + exit gate). Fits within an expanded v1.18 phase 106 appetite.
- **B. Narrow to pytest + vitest only** — pytest is 2 tests (30 min), vitest is ~8-10h. Defer all 152 Playwright fails to a follow-up "phase 106.1 E2E triage" in the next milestone. Avoids the rbac/phase-verify rabbit hole this milestone.
- **C. Narrow to "make the suite runnable" only** — delete all D-10 violations + delete pitfall-5 candidates + fix the vitest shifts cluster, accept everything else as pre-existing for v1.19. Minimal scope, maximum speed, but leaves 90% of the trustworthiness problem unsolved.

**The decision is the user's — but this is a soft re-trigger of the Task 3 scope-explosion gate.** Per the user's previous directive ("if post-unblock hard-fail count > 50, STOP AGAIN"): 219 > 50, so this plan does NOT auto-write SUMMARY.md and return PLAN COMPLETE. A second checkpoint is required.

---

*Generated by phase 106-01 baseline capture. Raw suite output is in `artifacts/*-baseline.txt` (gitignored). Env-unblock fixes tracked in commits `ae63e34` and `2e830c6`.*
