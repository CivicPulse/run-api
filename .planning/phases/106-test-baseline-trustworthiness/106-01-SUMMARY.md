---
phase: 106-test-baseline-trustworthiness
plan: 01
subsystem: testing
tags: [pytest, vitest, playwright, zitadel, docker-compose, asyncpg, conftest, e2e-baseline]

requires:
  - phase: 106-test-baseline-trustworthiness
    provides: "phase scope fence and D-01..D-14 decisions from CONTEXT"
provides:
  - "106-BASELINE.md — frozen scope fence listing every IN-scope failing/flaky/deferred test across pytest, vitest, Playwright"
  - "D-15 scope decision locked into CONTEXT.md — Option D hybrid clustering"
  - "Env-unblock: integration tests now auto-resolve DB port from docker .env (no more host-port drift)"
  - "Env-unblock: Playwright E2E_DEV_SERVER_URL override for running against an existing docker web container"
  - "Defer backlog entry .planning/todos/pending/106-phase-verify-cluster-triage.md for v1.19"
affects: [106-02, 106-03, 106-04, 106-05, 107, 108, 109, 110, v1.19]

tech-stack:
  added: []
  patterns:
    - "Integration-test DB port resolution: TEST_DB_PORT → PG_HOST_PORT → 5433, loaded from repo-root .env via python-dotenv in conftest"
    - "Playwright external dev-server URL override via E2E_DEV_SERVER_URL env var — skips built-in webServer when running against docker web"
    - "Phase scope decisions recorded as additional D-NN items in CONTEXT.md <decisions> after baseline capture, not before"

key-files:
  created:
    - .planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md
    - .planning/phases/106-test-baseline-trustworthiness/artifacts/.gitkeep
    - .planning/todos/pending/106-phase-verify-cluster-triage.md
    - .planning/phases/106-test-baseline-trustworthiness/106-01-SUMMARY.md
  modified:
    - .gitignore
    - tests/integration/conftest.py
    - web/playwright.config.ts
    - .planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md

key-decisions:
  - "D-15: Option D hybrid scope — IN: pytest (2), vitest shifts cluster + remainder (65), Playwright rbac cluster (44), pitfall-5 deletes (~11), D-10 audit (6). OUT: phase-verify cluster (~51) + misc (~29-40) deferred to v1.19."
  - "Env drift is IN scope (D-09 minimal infra fixes) because it blocks the entire integration and E2E suites from producing trustworthy signal. Three unblock commits were applied before baseline re-capture."
  - "D-12 exit gate for 106-05 adjusted: Playwright green-bar covers IN-scope specs only; deferred specs carry D-10-compliant justified skips so they don't break the green bar."
  - "RESEARCH.md historical flake hit list is STALE — top-11 specs that had 12-59 historical failing runs now show 1 fail each. Triage plans 106-03/04 should re-weight toward rbac.* and phase*-verify clusters, not the historical hit list."

patterns-established:
  - "Baseline-first scope fence: run all three suites once, freeze results in a committed BASELINE.md, block triage on a human scope-explosion gate if total > 50 fails"
  - "Env-unblock-before-triage: when baseline reveals >90% env pollution, fix env under D-09 and re-capture BEFORE triaging individual tests"
  - "Cluster collapse analysis: compute 'how many fixes does N failing tests actually represent' before deciding scope — 219 fails → ~10-15h best case via rbac shared-helper fix + vitest shifts cluster fix + 3 pitfall-5 delete commits"

requirements-completed: []  # TEST-04 remains in-flight until phase 106-05 exit gate

# Metrics
duration: 55 min
completed: 2026-04-10
---

# Phase 106 Plan 01: Test Baseline Trustworthiness — Baseline Capture Summary

**Frozen three-suite baseline + env-unblock (pytest host-port drift, Playwright auth blocked, stale docker API image) + locked-in Option D hybrid scope decision deferring the phase-verify cluster to v1.19.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-04-10T23:33Z
- **Completed:** 2026-04-11T00:28Z (UTC — local 2026-04-10 20:28 EDT)
- **Tasks:** 2 planned + 4 user-authorized (Tasks 3a/3b/3c + scope-decision closeout)
- **Files modified:** 4 code/config, 4 docs/planning
- **Commits:** 6

## Accomplishments

- **106-BASELINE.md committed** with concrete per-suite fail counts across three suites, verdicts assigned to every cluster, D-11 skip-marker audit, historical hit-list cross-reference, pitfall-5 candidates identified.
- **Three env-unblock fixes applied under D-09** (minimal infra, not test code):
  1. `tests/integration/conftest.py` now loads repo-root `.env` via python-dotenv and resolves DB port as `TEST_DB_PORT → PG_HOST_PORT → 5433`. Result: 92 integration-test ERRORs collapsed to 0, pytest dropped from 12 fails + 92 errors to 2 fails + 0 errors.
  2. `web/playwright.config.ts` adds `E2E_DEV_SERVER_URL` override that points Playwright at an already-running external dev server and skips its built-in webServer. Result: auth setup went from 30s timeout on all 5 projects to 1.7s pass.
  3. Docker API image rebuilt (was missing `twilio` dep added to `pyproject.toml` in recent work) — non-committed state fix but documented here. Before: `/api/v1/config/public` → HTTP 500 (uvicorn crash-looping on ModuleNotFoundError). After: HTTP 200 with fresh ZITADEL client IDs.
- **Real per-suite baselines captured** post-unblock: pytest **2 fail / 1113 pass**, vitest **65 fail / 614 pass**, Playwright **152 fail / 93 pass / 15 skip / 136 did-not-run-cascade / 396 total**. Raw logs in `artifacts/` (gitignored).
- **Scope-explosion gate fired TWICE** and both hits returned structured checkpoints to the user: once pre-unblock (169 + env pollution), once post-unblock (219 real hard fails).
- **User scope decision (Option D) locked in as D-15** in `106-CONTEXT.md`, with a concrete IN/OUT list and a D-12 exit-gate adjustment for 106-05.
- **Phase-verify defer backlog created** at `.planning/todos/pending/106-phase-verify-cluster-triage.md` enumerating ~91 deferred tests across ~29 spec files, with the D-10-compliant skip marker template for downstream plans to apply.
- **Surprise finding:** the RESEARCH.md historical flake hit list is stale. Top-11 historically-flaky specs (shifts 59, surveys 39, voter-tags 37, etc.) now show 1 fail each. Real hot spots are new clusters — rbac.* (44 fails) and phase*-verify (~43 fails) — neither in the historical top 10. Triage budget for 106-03/04 should re-weight accordingly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Environment sanity + prep workspace** — `4d01c90` (chore)
   - Added `artifacts/.gitkeep`, updated `.gitignore` to ignore `.planning/phases/**/artifacts/*` contents, cleared stale `web/playwright/.auth/*.json` per pitfall 1.
2. **Task 2: Capture baseline for all three suites (initial)** — `9199a81` (docs)
   - Ran `uv run pytest --tb=no -q`, `cd web && npx vitest run --reporter=verbose`, `cd web && ./scripts/run-e2e.sh`. Wrote `106-BASELINE.md` v1 with the env-polluted counts (Playwright suite-blocked). Triggered first scope-explosion checkpoint (169 items + 97 env-blocked).
3. **Task 3a: Fix postgres host-port drift** — `ae63e34` (fix)
   - `tests/integration/conftest.py` — load repo-root `.env` via python-dotenv, resolve `_DB_PORT = TEST_DB_PORT || PG_HOST_PORT || "5433"`. Verified: 92 ERRORs cleared, suite now 2 fail / 1113 pass.
4. **Task 3b: Support external dev server URL for E2E against docker web** — `2e830c6` (fix)
   - `web/playwright.config.ts` — new `E2E_DEV_SERVER_URL` env override that bypasses built-in webServer. Non-committed state fixes recorded in commit body: `web/.env.local` resync (pre-v4 ZITADEL IDs stale), docker API image rebuild for `twilio`, `scripts/create-e2e-users.py` re-run against the post-v4-upgrade ZITADEL. Verified: auth setup 30s timeout → 1.7s pass.
5. **Task 3c: Re-capture Playwright baseline after env unblock** — `0df3298` (docs)
   - Full Playwright suite ran via `./scripts/run-e2e.sh` (wrapper used per D-13, landed in `e2e-runs.jsonl` at `2026-04-10T23:58:58Z`). Rewrote the Playwright section of `106-BASELINE.md` with real per-spec data. Rewrote the Scope Explosion Analysis with post-unblock composition analysis and 3 user-facing options. Triggered second scope-explosion checkpoint (219 real hard fails).
6. **Task 3 closeout (scope decision D-15 + defer backlog)** — `c7559c8` (docs)
   - `106-CONTEXT.md` §D-15 added under `<decisions>` block with full IN/OUT scope, exit-gate adjustment, and handoff note. `106-BASELINE.md` scope-decision footer appended. `.planning/todos/pending/106-phase-verify-cluster-triage.md` created with 51-test phase-verify cluster + ~29-test misc cluster + D-10 skip-marker template for deferred tests.

**Plan metadata commit:** TBD at end of this closeout.

## Files Created/Modified

### Created
- `.planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md` — **the phase scope fence** (335 lines). Frontmatter: capture timestamp, git HEAD, docker stack state, alembic revision. Sections: env-unblock log, Summary tables (both initial and post-unblock), Pytest (backend), Vitest (frontend unit), Playwright (E2E), D-11 known-skip audit, historical flake hit-list cross-reference, phase 107-110 pitfall-5 cross-reference, Scope Explosion Analysis (with 3 options), Scope Decision footer.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/.gitkeep` — directory marker so the raw-logs dir persists in tree.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/pytest-baseline.txt` — initial capture raw log, **gitignored**.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/pytest-post-unblock.txt` — post-env-unblock raw log, **gitignored**.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/vitest-baseline.txt` — raw log, **gitignored**.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/playwright-baseline.txt` — initial capture (suite-blocked), **gitignored**.
- `.planning/phases/106-test-baseline-trustworthiness/artifacts/playwright-baseline-v2.txt` — post-unblock capture with 152 real fails, **gitignored**.
- `.planning/todos/pending/106-phase-verify-cluster-triage.md` — defer backlog entry for v1.19.
- `.planning/phases/106-test-baseline-trustworthiness/106-01-SUMMARY.md` — this file.

### Modified
- `.gitignore` — added `.planning/phases/**/artifacts/*` ignore rule with `.gitkeep` exception.
- `tests/integration/conftest.py` — env-aware DB port resolution via python-dotenv (15 lines added).
- `web/playwright.config.ts` — `E2E_DEV_SERVER_URL` override (29 insertions, 16 deletions).
- `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` — appended D-15 scope decision (63 new lines under `<decisions>`).

### Non-committed (state/env fixes surfaced during Task 3b)
- `web/.env.local` — resynced `VITE_ZITADEL_CLIENT_ID` and `VITE_ZITADEL_PROJECT_ID` from `.zitadel-data/env.zitadel`. This file is gitignored per the "instance-specific, regenerated by bootstrap" convention. Documented in commit `2e830c6` body.
- `run-api-api` docker image — rebuilt via `docker compose build api` to pick up `twilio>=9.10.4` from `pyproject.toml`. No file changes; the image drift was solely from an old build missing a newer dependency. Documented in commit `2e830c6` body.
- `scripts/create-e2e-users.py` — re-run idempotently against the post-v4-upgrade ZITADEL instance. Confirmed all 15 E2E role users present. No file changes, no commit needed. Documented in commit `2e830c6` body.

## Decisions Made

Two substantive decisions reached during this plan:

1. **D-15 scope decision (user-approved 2026-04-10):** Option D hybrid — IN scope for plans 106-02/03/04/05 is pytest (2), vitest shifts cluster (34-for-1) + remainder (~31), Playwright rbac cluster (44), pitfall-5 deletes (~11), D-10 skip-marker audit (6). OUT of scope is phase-verify cluster (~51) + misc scattered (~29-40), deferred to v1.19 via `.planning/todos/pending/106-phase-verify-cluster-triage.md`. Full locked-in text in `106-CONTEXT.md` §D-15.

2. **D-12 exit-gate adjustment (consequence of D-15):** Phase 106-05 exit gate was "Playwright full suite exit 0 + last two runs consecutive green". Post-D-15 it becomes "Playwright IN-scope specs pass on 2 consecutive `run-e2e.sh` runs; deferred specs carry D-10-compliant justified skips referencing the defer todo." This preserves the trustworthiness intent of the phase for the surface that matters to v1.18 Field UX Polish while avoiding a 25-30h absorption burden from the phase-verify cluster.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Brought the full docker compose stack up before baseline capture**
- **Found during:** Task 1 (Environment sanity + prep)
- **Issue:** `docker compose ps` initially showed `minio`, `zitadel`, `zitadel-db`, and `zitadel-bootstrap` in `Exited (0)` state (stack had been partially down for 3 days). The `api` container was crash-looping because of missing minio. No baseline capture possible against a half-dead stack.
- **Fix:** Ran `docker compose up -d` to bring all services up. The recreate pulled ZITADEL v4.10.1 (up from v2.71.6), which knocked on to two additional env drift issues surfaced later (Rule 3 entries #2 and #3 below).
- **Files modified:** none (state-only fix)
- **Verification:** `docker compose ps` showed all services Up and healthy; `alembic current` matched `alembic heads` at `039_volunteer_applications`.
- **Committed in:** N/A (state fix, no file changes)

**2. [Rule 3 - Blocking] Fixed pytest integration-test postgres host-port drift**
- **Found during:** Task 2 (pytest baseline capture) → surfaced at Task 3a after checkpoint 1
- **Issue:** 92 of 104 pytest "failures" were `OSError: Connect call failed ('127.0.0.1', 5433)`. Root cause: `tests/integration/conftest.py` hardcoded `TEST_DB_PORT` default to `5433`, but the repo's docker compose `.env` uses a deliberate 493xx host-port scheme (`PG_HOST_PORT=49374`). The `TEST_DB_PORT` default was chosen long before the port-scheme change, and pytest doesn't auto-load `.env` without a plugin.
- **Fix:** Added `load_dotenv(repo_root / ".env", override=False)` at conftest import time (python-dotenv was already installed, no new dep). Added a fallback chain: `TEST_DB_PORT → PG_HOST_PORT → 5433`.
- **Files modified:** `tests/integration/conftest.py` (+15 lines, -2 lines)
- **Verification:** `uv run pytest tests/integration/ --tb=no -q` went from `12 failed + 92 errors` to `2 failed + 0 errors + 118 passed`. Full suite: `2 failed + 1113 passed` in 71.81s.
- **Committed in:** `ae63e34`

**3. [Rule 3 - Blocking] Docker API image missing twilio dependency**
- **Found during:** Task 3b (E2E smoke test) → surfaced when `/api/v1/config/public` returned HTTP 500
- **Issue:** `uvicorn` in the `run-api-api` container was crash-looping with `ModuleNotFoundError: No module named 'twilio'`. The `twilio>=9.10.4` dependency was added to `pyproject.toml` line 31 in recent work, but the docker image was built before that and was never rebuilt. Container was listed as `Up` because the entrypoint's `exec bash` loop masks uvicorn exits — the API was dead but the container was "running".
- **Fix:** `docker compose build api && docker compose up -d api`.
- **Files modified:** none (state-only fix)
- **Verification:** API logs show clean startup (`==> Loading ZITADEL config from zitadel-data volume... ==> Running Alembic migrations...`). `curl -skL https://.../api/v1/config/public` returns HTTP 200 with the new ZITADEL client IDs.
- **Committed in:** Documented in `2e830c6` body (no files to commit for an image rebuild).

**4. [Rule 3 - Blocking] Stale `web/.env.local` ZITADEL client IDs**
- **Found during:** Task 3b (E2E smoke test) → surfaced after API was fixed but Playwright auth still timed out at the app's "Loading..." screen
- **Issue:** `web/.env.local` had `VITE_ZITADEL_CLIENT_ID=366863219375013893` and `VITE_ZITADEL_PROJECT_ID=366863219072958469` — both pre-v4-bootstrap IDs. The post-v4 bootstrap wrote new IDs to `.zitadel-data/env.zitadel` (`366864787759497221` / `366864787423887365`) but did not sync to `web/.env.local`. This is the known pain documented in user memory `feedback_zitadel_env_sync.md`.
- **Fix:** Rewrote `web/.env.local` with the three values from `.zitadel-data/env.zitadel` (ISSUER + CLIENT_ID + PROJECT_ID). Restarted the web container so Vite picked up the new env.
- **Files modified:** `web/.env.local` (not committed — gitignored per convention as "instance-specific, regenerated by bootstrap")
- **Verification:** Trace showed the app successfully calling `/api/v1/config/public` with new IDs; subsequent Playwright auth-owner smoke passed in 1.7s.
- **Committed in:** Documented in `2e830c6` body (no files to commit for a gitignored state fix).

**5. [Rule 3 - Blocking] Playwright spawning its own preview webserver instead of using the docker web container**
- **Found during:** Task 3b (E2E smoke test) → surfaced after everything else was fixed but the run summary still showed `mode: preview`
- **Issue:** Playwright's auto-detect (in both `playwright.config.ts` and `run-e2e.sh`) probes `localhost:5173` for a running Vite dev server. The repo's docker compose publishes the web container on `WEB_HOST_PORT=49372` (per the 493xx scheme), so localhost:5173 is empty and Playwright falls back to spawning its own `npm run preview` on `:4173`. That preview build used a separate Vite setup and was the source of flow weirdness.
- **Fix:** Added `E2E_DEV_SERVER_URL` env override to `web/playwright.config.ts`. When set, `baseURL` uses that URL directly and `webServer: undefined` is set so Playwright does NOT try to spawn its own. Usage: `E2E_DEV_SERVER_URL="https://kudzu.tailb56d83.ts.net:49372" ./scripts/run-e2e.sh`.
- **Files modified:** `web/playwright.config.ts` (+29 lines, -16 lines)
- **Verification:** Auth-owner setup project passed in 1.7s (was timing out at 30s). Full baseline run hit the real backend and produced 152 legitimate failures instead of 5 env-blocked ones.
- **Committed in:** `2e830c6`

**6. [Rule 3 - Blocking] Wrapper's strict-policy check requires fresh E2E users after ZITADEL upgrade**
- **Found during:** Task 3b (running `scripts/create-e2e-users.py`)
- **Issue:** The bootstrap container ran at stack-up but only updates `env.zitadel`, not `pat.txt`. The old `pat.txt` from Apr 2 was still present in `.zitadel-data/`. Script default is `/zitadel-data/pat.txt` but api container mounts it at `/home/app/zitadel-data/pat.txt`. Also the `scripts/create-e2e-users.py` needed an explicit `PAT_PATH` override to find it.
- **Fix:** Ran `docker compose exec -T api bash -c 'PAT_PATH=/home/app/zitadel-data/pat.txt PYTHONPATH=/home/app python /home/app/scripts/create-e2e-users.py'`. The script ran idempotently and confirmed all 15 E2E role users exist. Turns out the old PAT was still valid against the v4 instance (instance state persisted across v2→v4 upgrade).
- **Files modified:** none (idempotent script run)
- **Verification:** Script output showed `E2E users created successfully!` with all 15 users listed. `run-e2e.sh` wrapper's own strict-policy verification passed on all subsequent runs.
- **Committed in:** Documented in `2e830c6` body.

---

**Total deviations:** 6 auto-fixed (all Rule 3 - Blocking). No Rule 1 (bug), no Rule 2 (missing critical), no Rule 4 (architectural-escalation).

**Impact on plan:** Every deviation was an environment unblock that was mandatory for the plan to produce trustworthy baseline data. The user explicitly authorized the env-unblock path at the first Task 3 scope-explosion checkpoint ("env-unblock first"), so these fixes were approved work even though they extended the plan beyond its original 3 tasks. Tasks 3a, 3b, 3c were formally added under user direction and are reflected in the commits but not the original PLAN.md task list. Per D-09 (test-infra refactoring allowed when minimal and necessary to unblock specific in-scope tests), these fixes are well within scope.

No scope creep into test code. Zero test files modified in this plan.

## Issues Encountered

1. **jq parse failure on `e2e-runs.jsonl` (cosmetic):** The plan's automated verify command expects `tail -1 web/e2e-runs.jsonl | jq`, but the wrapper writes pretty-printed JSON (multi-line per entry). `tail -1` gives the last line, not the last entry. **Resolution:** Used `jq -s '.[-1]'` (slurp mode) instead. Confirmed the latest entry for the post-unblock run landed correctly at `2026-04-10T23:58:58Z` with `pass: 93, fail: 152, exit_code: 1`. This is a paper-cut in the plan's verify command, not a test or infrastructure issue. Downstream plans can fix the command in their own verify blocks.

2. **Two scope-explosion checkpoints instead of one:** The plan's Task 3 was a single checkpoint, but the first checkpoint (env-polluted baseline) and the second checkpoint (post-unblock real baseline) each forced a distinct user decision. The first decided to unblock the env; the second decided the triage scope (Option D). This is documented in full in commits `9199a81` → `c7559c8` and the two checkpoint messages in the executor transcript. No rework was needed — each checkpoint advanced the plan.

3. **Baseline counts changed mid-plan:** The `106-BASELINE.md` was committed once with env-polluted numbers (`9199a81`), then rewritten with real post-unblock numbers (`0df3298`), then got a scope-decision footer (`c7559c8`). Future readers should use the post-unblock numbers (see the top `## Summary (post env-unblock)` table) as the scope fence; the initial-capture table is retained for audit trail only. The cluster analysis and verdicts are all post-unblock.

## User Setup Required

None. All env fixes in this plan were automated (conftest + playwright.config.ts edits + state-only docker/env rehydrations). No secrets, no dashboard clicks, no credentials. The `web/.env.local` resync from `.zitadel-data/env.zitadel` is the kind of thing CLAUDE.md user memory calls out but the script already knows how to do.

## Next Phase Readiness

**Ready:** Plans 106-02, 106-03, 106-04, 106-05 can now proceed under the locked-in Option D scope. The full list of work is:

- **106-02 (pytest + vitest triage):** 2 pytest fails + 65 vitest fails. Target one cluster fix for the 34-test shifts cluster early; remaining ~31 vitest fails are per-file. Apply 3x-rerun rule to `test_capped_rolling_window_chunk_dispatch_advances_full_chunk_list` to decide flake vs hard. Delete `test_door_knock_persists_survey_responses_for_authoritative_readback` with PHASE-106-DELETE ref to phase 107 CANV-01.
- **106-03 (Playwright rbac cluster):** 44 fails across 5 specs. Investigate shared helper in `web/e2e/` — all 5 specs failing in parallel strongly suggests a role-setup or baseline-state bug. Handle the 6 D-10 `test.skip` violations as part of the cluster.
- **106-04 (Playwright pitfall-5 deletes + D-10 audit residual):** 3 delete commits for `field-mode.volunteer.spec.ts`, `map-interactions.spec.ts`, `walk-lists.spec.ts`. Delete `src/hooks/useCanvassing.test.ts` too. Inspect the 2 "needs-review" D-11 markers (phase21 line 409, cross-cutting line 344) and either justify them or fold them into the delete set. THEN apply `test.skip` justified-defer markers to every phase-verify and misc-deferred failing test per `.planning/todos/pending/106-phase-verify-cluster-triage.md`.
- **106-05 (exit gate):** `uv run pytest` exit 0, vitest exit 0, Playwright IN-scope specs pass on 2 consecutive `run-e2e.sh` runs. Verify `e2e-runs.jsonl` last two entries show `exit_code: 0`. Mark TEST-04 complete only at this step.

**Blockers / concerns:**

- **Env reproducibility for other developers:** the `tests/integration/conftest.py` port-resolution fix depends on `.env` being at repo root. That's the current layout, but any dev who copies `.env` elsewhere or uses a different container-orchestration workflow may still hit the old drift. Low risk for now, but worth noting for future onboarding docs.
- **D-13 wrapper logging blind spot:** the `run-e2e.sh` wrapper's JSONL `command` field doesn't capture the `E2E_DEV_SERVER_URL` env var that the Task 3c baseline run used. Future auditors looking at the JSONL won't know which baseURL the run actually targeted. Not in scope here — recommend filing a paper-cut follow-up todo for the wrapper to log `E2E_*` env vars alongside the command.
- **Docker api image drift:** the `twilio` rebuild suggests devs may forget to rebuild the api image after `pyproject.toml` changes. Recommend a pre-commit or CI check that diffs `uv.lock` against the baked-in venv in the image. Out of scope for phase 106, but worth capturing as a v1.19 or later hardening item.

**Handoff:** Plans 106-02/03/04/05 MUST read `106-CONTEXT.md` §D-15 and the `106-BASELINE.md` Scope Decision footer before starting. The phase appetite changed from the original "triage everything" framing — the executor needs to internalize the narrowed scope or they'll burn time on phase-verify clusters that are deliberately deferred.

## Self-Check

- [x] `.planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md` exists and is committed (`0df3298`, footer `c7559c8`)
- [x] `.planning/phases/106-test-baseline-trustworthiness/artifacts/.gitkeep` exists and is committed (`4d01c90`)
- [x] `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` contains D-15 (`c7559c8`)
- [x] `.planning/todos/pending/106-phase-verify-cluster-triage.md` exists and is committed (`c7559c8`)
- [x] `.gitignore` has `.planning/phases/**/artifacts/*` rule with `.gitkeep` exception (`4d01c90`)
- [x] `tests/integration/conftest.py` env-aware port resolution (`ae63e34`)
- [x] `web/playwright.config.ts` `E2E_DEV_SERVER_URL` override (`2e830c6`)
- [x] `git log --oneline --grep='106-01'` returns all 5 task commits (`4d01c90`, `9199a81`, `ae63e34`, `2e830c6`, `0df3298`) plus scope-decision commit (`c7559c8`)
- [x] `uv run pytest` runs clean against the post-unblock env (1113 pass / 2 fail / 0 errors) — verified at end of Task 3a
- [x] Playwright wrapper verified used per D-13 — entry at `web/e2e-runs.jsonl` timestamp `2026-04-10T23:58:58Z` confirmed via `jq -s '.[-1]'`

## Self-Check: PASSED

---

*Phase: 106-test-baseline-trustworthiness*
*Plan: 01 (baseline capture)*
*Completed: 2026-04-10*
