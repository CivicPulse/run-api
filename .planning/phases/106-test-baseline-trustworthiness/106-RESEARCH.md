# Phase 106: Test Baseline Trustworthiness - Research

**Researched:** 2026-04-10
**Domain:** Test-suite triage across pytest (async FastAPI), vitest (React/happy-dom), Playwright (E2E against Docker stack)
**Confidence:** HIGH on mechanics and local signal; MEDIUM on per-test failure-mode predictions (must be confirmed at baseline capture).

## Summary

This phase is a triage-and-execute job, not a research job. All of the important design decisions are already locked in `106-CONTEXT.md` (time box, 3x rerun rule, per-suite commits, deletion-in-commit-message trail, 106-BASELINE.md as scope fence). The job of this research document is to translate those decisions into exact commands the planner can paste into tasks and to pre-identify the specs that historical `e2e-runs.jsonl` data flags as most likely to burn time.

Two findings change how the plan should be written:

1. `web/scripts/run-e2e.sh` has a `--loop` flag but **no** `--repeat-each`. The 3x rerun rule (D-04) is operationalized by shell looping (`for i in 1 2 3; do ./scripts/run-e2e.sh <spec>; done`) or a single call to Playwright's native `--repeat-each=3`. The loop flag is not the right tool — it adds a 120s sleep between runs. The plan must not instruct agents to use `--loop` for flake reproduction.
2. `web/e2e-runs.jsonl` (725 runs, 581 with failures) gives a **ranked flake hit list** before baseline capture even runs — specs like `shifts.spec.ts` (59 failing runs), `surveys.spec.ts` (39), `voter-tags.spec.ts` (37), and `voter-filters.spec.ts` (31) are the high-risk triage targets. This lets the planner pre-weight task budgets instead of discovering the hot spots mid-phase.

**Primary recommendation:** Structure the plan as one Wave-0 baseline task → one triage task per suite (pytest, vitest, Playwright) → one exit-gate verification task. Each triage task commits incrementally per batch (not per suite). The Playwright task needs an explicit subtask for the top-10 historical-flake hit list from `e2e-runs.jsonl` before broad-brush fixing.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** 15-minute time-boxed fix attempts per failing test. Mechanical fix (selector, wait, assertion, fixture) → fix. Removed behavior, redesign needed, or time-box exceeded → delete with justification.
- **D-02** Deletions documented in commit message bodies only, one line of justification per deleted file. No separate deletion-log artifact.
- **D-03** Flaky tests count as broken and are in scope.
- **D-04** **3x reproduction rule** for Playwright: re-run the failing spec 3x consecutively via `web/scripts/run-e2e.sh`. If 3/3 pass, treat as flake and still triage. **Do NOT add `retries: 2` to Playwright config as a band-aid. No quarantine tag.**
- **D-05** First task of the phase runs all three suites once and writes `106-BASELINE.md`. That file IS the scope — later regressions are out of scope.
- **D-06** Baseline records, per suite: file, test name, failure mode (hard fail / flaky / unjustified skip), with a summary counts block at the top.
- **D-07** No new test coverage in this phase. TEST-01/02/03 belong to phases 107-110.
- **D-08** No fixing product bugs revealed by failing tests. Record the bug as a follow-up and delete or skip-with-justification the test.
- **D-09** Test infra refactoring (fixtures, conftest, utils, CI) allowed only when minimal and necessary to unblock a specific in-scope test. No rewrites.
- **D-10** Every surviving `.skip` / `.fixme` / `pytest.mark.skip` / `pytest.mark.xfail` after this phase must have an adjacent justification comment.
- **D-11** Known-skip audit targets: `web/e2e/rbac.admin.spec.ts`, `rbac.manager.spec.ts`, `rbac.viewer.spec.ts`, `voter-crud.spec.ts`, `table-sort.spec.ts`, `phase21-integration-polish.spec.ts`, `cross-cutting.spec.ts`. [VERIFIED: grep shows 11 `.skip/.fixme/.only` markers across exactly these 7 files.]
- **D-12** "Clean" exit gate = `uv run pytest` exits 0 (no unjustified skips/xfails) + vitest exits 0 (no unjustified `.skip`/`.fixme`) + `run-e2e.sh` full suite exits 0 with the **last two consecutive runs both green**.
- **D-13** Use `web/scripts/run-e2e.sh` for every Playwright invocation (no direct `npx playwright test` for exit-gate runs — results must land in `e2e-runs.jsonl`).
- **D-14** Incremental per-suite / per-batch commits, not one end-of-phase commit.

### Claude's Discretion

- Order the three suites are tackled (research recommends: **pytest → vitest → Playwright**, ascending noise).
- How to mechanically detect flakes during baseline capture (research recommends: pre-weight with `e2e-runs.jsonl` hit list + 3x rerun of any spec that fails the single baseline pass).
- Format of `106-BASELINE.md` (no prior example exists in `.planning/phases/**`, so propose a fresh structure below).
- Whether to surface unresolved product bugs as `.planning/todos/pending/` entries or inline commit notes.

### Deferred Ideas (OUT OF SCOPE)

- `retries: 2` on Playwright as baseline (rejected D-04)
- Quarantine tag for flaky specs
- GitHub Actions CI green-bar as exit gate (local is sufficient)
- Linked GitHub issue per skipped test
- Fixing product bugs revealed by failing tests

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-04 | All pre-existing broken or consistently failing tests across backend (pytest) and frontend (vitest + Playwright) are either fixed or deleted with justification so only valid regressions fail. | Every section below: baseline capture commands, triage patterns, flake detection via `e2e-runs.jsonl`, exit gate operationalization. |

## Project Constraints (from CLAUDE.md)

- **Python:** `uv run …` always. Never `python` or `python3`. `uv add` / `uv remove` for dependency changes. [VERIFIED: CLAUDE.md]
- **Lint:** `uv run ruff check .` and `uv run ruff format .` required before any git commit touching Python. [VERIFIED: CLAUDE.md]
- **Backend tests:** `uv run pytest` (asyncio_mode=auto, markers `integration` and `e2e`). [VERIFIED: pyproject.toml lines 59-67]
- **Playwright:** Always via `web/scripts/run-e2e.sh` — logs to `web/e2e-runs.jsonl`. Never `npx playwright test` directly for phase-level runs. [VERIFIED: CLAUDE.md + D-13]
- **Commits:** Conventional Commits; commit after each task; branches (not main) unless told otherwise; never push unless asked. [VERIFIED: user global CLAUDE.md]
- **Dev server:** Runs in docker compose, not bare vite. Restart via `docker compose restart web`. [VERIFIED: user memory `feedback_dev_server_docker.md`]

These directives are load-bearing for the plan. Any task action that touches Python must be scoped through `uv run`; any Playwright invocation must go through the wrapper.

## Standard Stack

This phase does not add dependencies. It uses what's already installed.

### Core test frameworks (verified from `pyproject.toml`, `web/vitest.config.ts`, `web/playwright.config.ts`)

| Library | Version (pyproject/package) | Purpose | Config file |
|---------|-----------------------------|---------|-------------|
| pytest | `>=9.0.2` | Backend test runner | `pyproject.toml [tool.pytest.ini_options]` |
| pytest-asyncio | `>=1.3.0` | Async test support (`asyncio_mode = "auto"`) | same |
| pytest-timeout | `>=2.4.0` | Per-test timeouts — useful for freezing tests | same |
| pytest-cov | `>=7.1.0` | Coverage reporting | same |
| vitest | (web `package.json`) | Frontend unit/component tests | `web/vitest.config.ts` |
| happy-dom | (web) | DOM simulation for vitest | same |
| @playwright/test | (web) | E2E tests | `web/playwright.config.ts` |

[VERIFIED: read directly from `pyproject.toml` lines 37-40, 59-67; `web/vitest.config.ts`; `web/playwright.config.ts`]

### Current Playwright config highlights (load-bearing for planning)

- `testDir: "./e2e"`, `fullyParallel: true`, `workers: CI ? 2 : 16`, `timeout: 60_000`, `actionTimeout: 30_000`
- `retries: process.env.CI ? 2 : 0` — **local = zero retries**, which is correct for D-04's 3x rerun rule. Do not change this.
- 5 projects: `chromium` (owner auth), `admin`, `manager`, `volunteer`, `viewer`. Role projects match `*.{admin|manager|volunteer|viewer}.spec.ts` filename patterns. Default `chromium` excludes those via regex.
- Auth state files in `web/playwright/.auth/*.json` cached 7 days. `PLAYWRIGHT_FORCE_AUTH_SETUP=1` to force refresh.
- Web server auto-detect: Vite dev (`:5173`) if running, else build+preview (`:4173`). Phase 106 should run against dev server (faster rebuilds).

### run-e2e.sh capabilities (critical for planning the 3x rule)

| Flag | Purpose | Use in Phase 106 |
|------|---------|-------------------|
| `--workers N` | Override worker count | Leave default (16) for full-suite; drop to `--workers 1` for serial debugging of a flake suspect |
| `--grep PATTERN` | Playwright grep filter | Use to target a single test within a spec |
| `--loop` | **NOT for flake rerun** — runs continuously with 120s sleep between runs | Do NOT use for D-04 |
| `--loop-sleep N` | Adjust loop sleep | Not used in this phase |
| `<spec-file>` | Positional: run one spec | Primary pattern for spec-level triage |

**[VERIFIED: full read of `web/scripts/run-e2e.sh`]**

`run-e2e.sh` also auto-ensures ZITADEL E2E users exist and verifies the no-MFA org policy before every run — a silent flake source if the docker stack was recreated. Any pytest/vitest triage that doesn't touch docker won't notice this, but every Playwright invocation will.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shell `for` loop for 3x rerun | `npx playwright test --repeat-each=3 <spec>` | Faster (single-process), BUT bypasses `run-e2e.sh`, so it doesn't log to `e2e-runs.jsonl`, violating D-13. **Use the shell loop via `run-e2e.sh` for the exit gate; use `--repeat-each` only for in-task iteration that isn't part of the exit gate record.** |
| `pytest -x` (fail-fast) | `pytest` (collect all fails) | Fail-fast is wrong for baseline capture (D-05) — you need the full list on one run. Use `pytest --tb=no -q` for minimal output, then `pytest -x` for per-failure iteration. |

## Architecture Patterns

### Recommended Phase Structure

```
Wave 0: 106-BASELINE.md capture (blocks everything else)
  └─ Task 0.1: Run all three suites once, write baseline file, commit

Wave 1: Triage (sequential — pytest first, lowest noise)
  ├─ Task 1.1: pytest triage (batch commits by test module)
  ├─ Task 1.2: vitest triage (batch commits by component area)
  └─ Task 1.3: Playwright triage
      ├─ 1.3a: Audit the 7 known-skip files (D-11) — justify or remove
      ├─ 1.3b: Historical-flake hit list (shifts, surveys, voter-tags, voter-filters, voter-contacts, cross-cutting)
      └─ 1.3c: Remaining failing specs from baseline

Wave 2: Exit gate verification
  └─ Task 2.1: Run pytest → vitest → run-e2e.sh twice consecutively, confirm green bar, commit empty tombstone or update state
```

**Why sequential, not parallel:** Shared test utilities (conftest.py, `web/src/test/setup.ts`) could cause one fix to ripple into another agent's triage and masquerade as new breakage. The 15-minute time box means sequential isn't meaningfully slower than parallel.

**Why pytest first:** Backend has 127 test files with **0 skip/xfail markers** [VERIFIED: grep]. Failures are hard fails, not silent skips. Lowest triage ambiguity → fastest to clear → builds momentum before the noisier Playwright pass.

**Why vitest second:** Self-contained (happy-dom, no docker), no external-service flake. Clearing it before Playwright means any later Playwright failure is cleanly attributable to browser/server/timing, not stale frontend unit state.

### Pattern 1: Baseline Capture Command Sequence

```bash
# Pytest — capture full fail list, quiet output, no traceback noise
uv run pytest --tb=no -q 2>&1 | tee .planning/phases/106-test-baseline-trustworthiness/artifacts/pytest-baseline.txt
# Extract failures:
grep -E '^FAILED|^ERROR' .planning/phases/106-test-baseline-trustworthiness/artifacts/pytest-baseline.txt

# Vitest — JSON reporter for greppable output
cd web && npx vitest run --reporter=verbose 2>&1 | tee ../.planning/phases/106-test-baseline-trustworthiness/artifacts/vitest-baseline.txt
# (vitest also supports --reporter=json for structured parse if needed)

# Playwright — single pass through the wrapper (logs to e2e-runs.jsonl automatically)
cd web && ./scripts/run-e2e.sh 2>&1 | tee ../.planning/phases/106-test-baseline-trustworthiness/artifacts/playwright-baseline.txt
# Failing specs also land in e2e-runs.jsonl with timestamp, pass/fail counts, exit code.
```

The `artifacts/` directory is gitignored via `.planning/` convention (or should be — the planner should include a `.gitignore` entry task if not already set). `106-BASELINE.md` is the human-readable distillation; the raw logs are disposable.

### Pattern 2: 3x Rerun for Flake Detection (D-04 operationalized)

```bash
# Serial, via the wrapper, so every run hits e2e-runs.jsonl
cd web
for i in 1 2 3; do
  echo "=== Run $i/3 ==="
  ./scripts/run-e2e.sh surveys.spec.ts || echo "FAILED on run $i"
done
# Verdict:
# 3 passes → investigate root cause briefly, then fix or delete per D-04
# 1-2 passes → definitely flaky, fix or delete
# 0 passes → hard fail, fix or delete
```

**Alternative (in-task iteration only, NOT for exit gate):**
```bash
cd web && npx playwright test --repeat-each=3 surveys.spec.ts
```
Faster but bypasses the wrapper's JSONL log. Use only for within-task tight-loop debugging; the exit-gate two-consecutive-green runs MUST go through `run-e2e.sh`.

### Pattern 3: Exit Gate Command Sequence (D-12)

```bash
# 1. Backend green
uv run ruff check .
uv run ruff format --check .
uv run pytest                       # exit 0 required

# 2. Frontend unit green
cd web && npx vitest run             # exit 0 required

# 3. E2E — two consecutive full-suite greens via the wrapper
cd web
./scripts/run-e2e.sh                 # run 1
./scripts/run-e2e.sh                 # run 2
# Both must exit 0. Verify in e2e-runs.jsonl:
tail -2 e2e-runs.jsonl | jq '.exit_code'
# Expected: 0, 0
```

### Anti-Patterns to Avoid

- **`retries: 2` in playwright.config.ts** — explicitly rejected by D-04. If an agent proposes it, reject.
- **`pytest.mark.skip` without a comment** — D-10 violation. Any new skip must be accompanied by a rationale comment.
- **Squash-merge of all deletions into one commit** — D-02 + D-14 both require per-batch deletion attribution in commit bodies. The audit trail dies in a mass squash.
- **Bulk `git rm tests/broken/*.py`** — loses the 15-min fix-attempt discipline. Every deletion is per-file, per-decision, per-justification.
- **Running `npx playwright test` directly for the exit gate** — D-13. The exit-gate runs MUST append to `e2e-runs.jsonl`.
- **Fixing a product bug to make a test pass** — D-08. Delete/skip the test, log the bug as a follow-up, move on.
- **Parallel triage agents on the same suite** — shared fixtures mean one agent's mutation breaks another's run. Keep triage sequential within a suite.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flake detection | Custom per-run retry wrapper in Python | `for` loop in shell through `run-e2e.sh`, or `playwright --repeat-each=3` for in-task iteration | Wrapper already exists and logs to JSONL; Playwright has native repeat |
| Baseline parser | Custom JSON transform of vitest/pytest output | Plain `tee` + `grep` + hand-curation into `106-BASELINE.md` | 15-minute time box doesn't leave room to build tooling; the output lists are small (tens to hundreds of entries) |
| Deletion audit log | Separate `.planning/deletion-log.md` | Commit message bodies (D-02) | Explicit decision, git is the audit trail |
| Skip justification tracker | Spreadsheet, json, markdown table | Inline source comments adjacent to the skip (D-10) | Kept in source = never drifts |
| ZITADEL user seeding for tests | Anything custom | `run-e2e.sh` already calls `create-e2e-users.py` automatically on every invocation | Verified in script lines 44-77 |

**Key insight:** This phase is surgical, not infrastructural. Every time an agent reaches for a new script or library, that's a signal they've drifted into D-09 territory (test-infra rewrite) and should stop.

## Common Pitfalls

### Pitfall 1: ZITADEL token staleness after docker recreate
**What goes wrong:** Mass 401 "Invalid or expired token" failures on Playwright auth setup.
**Why it happens:** ZITADEL rotates signing keys on container recreate. `web/playwright/.auth/*.json` file mtimes are still fresh so the freshness check passes, but the tokens are invalid.
**How to avoid:** Before baseline capture and before exit-gate runs, run `rm web/playwright/.auth/*.json && ./scripts/run-e2e.sh` — the wrapper will run the 5 setup projects to re-auth. Documented in `run-e2e.sh` header comments.
**Warning signs:** Baseline shows ~20+ failures concentrated in auth setup projects or a massive fail count (100+) in the first 30 seconds.

### Pitfall 2: Playwright worker over-subscription on this box
**What goes wrong:** Tests flake at `--workers 16` (current default) but pass at `--workers 4-6` because PostgreSQL or ZITADEL can't handle the concurrency.
**Why it happens:** Dev Postgres at `:5433` has default connection limits; ZITADEL also has rate limits. Heavily parallel auth flows overwhelm the test backend.
**How to avoid:** If baseline capture at default workers produces a suspiciously large fail list, re-run at `--workers 4` before triaging individual specs. Compare fail lists — anything that passes at `--workers 4` but fails at `--workers 16` is a concurrency flake, not a real test bug. Historical JSONL shows runs at `--workers 6`, `--workers 12`, `--workers 16` — the top failing-spec counts are from `--workers 6` runs, suggesting concurrency was being actively tuned mid-triage historically. [VERIFIED: `e2e-runs.jsonl` grouping]
**Warning signs:** Same spec passes solo and fails in the full suite.

### Pitfall 3: Shared conftest.py mutation ripple
**What goes wrong:** Fixing one test by editing `tests/conftest.py` silently breaks 10 other tests.
**Why it happens:** Backend has 3 conftest files (root, `unit/`, `integration/`) — changes ripple widely.
**How to avoid:** D-09 says touch the broken test, not the shared fixture, whenever possible. If the fixture change is unavoidable, re-run the **full** pytest suite after the change, not just the targeted test.
**Warning signs:** Git diff shows changes to `tests/conftest.py`, `tests/unit/conftest.py`, or `tests/integration/conftest.py`.

### Pitfall 4: Schema drift from unapplied migrations
**What goes wrong:** Integration tests fail with `UndefinedColumn` or `UndefinedTable`.
**Why it happens:** Agent didn't run `alembic upgrade head` against the test database before triage. Known issue: `alembic_version` column was ALTERed to VARCHAR(128) in some environments but fresh bootstraps still use VARCHAR(32). [VERIFIED: user memory `reference_alembic_version_column_width.md`]
**How to avoid:** Baseline task must verify migrations are current before running pytest. `docker compose exec api alembic current` should match `alembic heads`.
**Warning signs:** First few pytest errors are database-schema errors, not assertion errors.

### Pitfall 5: Auto-advance / active-state tests that the v1.18 feature work will change
**What goes wrong:** Phase 106 spends 15 minutes fixing a canvassing auto-advance test; phase 107 then rewrites it because the underlying behavior changes.
**Why it happens:** Phase 106 isn't aware of phase 107's scope boundary.
**How to avoid:** If a failing test covers any of: auto-advance, skip house, house-tap, map tap, leaflet icons, offline sync — **delete with justification referencing the phase that owns the rewrite**. The commit body should say e.g. `delete canvassing auto-advance e2e spec — behavior rewritten in phase 107 CANV-01`. This is the cleanest application of D-08 for this milestone.
**Warning signs:** Failing test file matches `canvassing-*`, `walk-list-*`, `field-mode.volunteer.*`, `offline-*`, or map/leaflet specs.

### Pitfall 6: `run-e2e.sh` wrapper policy verification failure
**What goes wrong:** Every Playwright invocation fails before Playwright even starts, with "Strict policy verification failed: org login policy drift detected."
**Why it happens:** ZITADEL org-level no-MFA policy has drifted. The wrapper's strict verification exits with code 1.
**How to avoid:** The wrapper prints the exact remediation command. Run it. Do not bypass the wrapper; the strict policy check is load-bearing for deterministic auth tests.
**Warning signs:** All Playwright runs die in <10s with the strict-policy error before any test runs.

## Code Examples

### Example 1: Parse pytest failures into the baseline table

```bash
# Gives: path::ClassOrFile::test_name on each line
uv run pytest --tb=no -q 2>&1 \
  | grep -E '^FAILED' \
  | sed 's/^FAILED //' \
  | sed 's/ - .*//'
```

### Example 2: Parse Playwright failures from the JSONL log

```bash
# The most recent run's fail count
jq -s '.[-1] | {ts: .timestamp, fail, exit_code, log_file}' web/e2e-runs.jsonl

# Top-10 historically failing full-suite targets
jq -s '[.[] | select(.fail > 0)] | group_by(.command) | map({cmd: .[0].command, fails: length}) | sort_by(-.fails) | .[0:10]' web/e2e-runs.jsonl
```
[VERIFIED: both commands run and produce correct output during research.]

### Example 3: Audit a .skip marker for D-10 compliance

```bash
# Find every Playwright .skip without an adjacent comment
grep -rn -B1 '\.skip\|\.fixme' web/e2e/ | grep -v '//' | grep '\.skip\|\.fixme'
# Then manually inspect each hit; if no justification comment, either add one, fix the test, or delete it.
```

### Example 4: Per-suite commit with deletion justification

```bash
git add web/e2e/voter-tags.spec.ts web/e2e/voter-filters.spec.ts
git rm web/e2e/cross-cutting.spec.ts

git commit -m "test(e2e): triage voter-tags/voter-filters and drop cross-cutting

- voter-tags.spec.ts: fixed stale selector for tag chip after shadcn upgrade
- voter-filters.spec.ts: replaced timing-sensitive waitFor with expect.toBeVisible
- cross-cutting.spec.ts: DELETED — 15 historical failures, fixture covered
  behaviors replaced by turfs/walk-lists/phone-banks specs; 15min fix-attempt
  confirmed rewrite-required, out of scope per D-08

Refs: phase 106 TEST-04"
```

This format satisfies D-02 (justification in commit body) and D-14 (incremental, per-batch, not end-of-phase).

## Historical Flake Hit List (VERIFIED from e2e-runs.jsonl)

**This is the pre-baseline triage pre-weighting — tasks should budget extra time for these specs.** Data from 725 total runs logged in `web/e2e-runs.jsonl`, of which 581 had at least one failure.

| Rank | Spec | Historical failing-run count | Notes |
|------|------|------------------------------|-------|
| 1 | `shifts.spec.ts` | 59 | Volunteer shifts; likely state/time race |
| 2 | `surveys.spec.ts` | 39 | Survey widget; mentioned in WS6 work |
| 3 | `voter-tags.spec.ts` | 37 | Tag chip UI churn |
| 4 | `voter-filters.spec.ts` | 31 | Filter state race |
| 5 | `voter-contacts.spec.ts` | 25 | Contact tab; complex fixture chain |
| 6 | `volunteer-tags-availability.spec.ts` | 19 | Volunteer tags + availability grid |
| 7 | `cross-cutting.spec.ts` | 15 | **Already in D-11 known-skip audit list** |
| 8 | `campaign-settings.spec.ts` | 14 | Settings drawer; auth-adjacent |
| 9 | `voter-crud.spec.ts` | 12 | **Already in D-11 known-skip audit list** |
| 10 | `voter-lists.spec.ts` | 12 | Voter list CRUD |
| 11 | `voter-notes.spec.ts` | 12 | Notes tab |

Recent (late March to April 1) full-suite runs were ~360 tests, 0-5 failing, 13-18 skipped — the baseline expected magnitude, not an explosion. Full-suite runs dropped off in `e2e-runs.jsonl` after 2026-04-01, replaced by spec-targeted invocations, meaning the actual current full-suite health is **unknown** and will be revealed by the baseline task. Plan appetite should assume 5-20 fails, not 100+; if it's 100+, see "Scope Explosion Risk" below.

## State of the Art

Not applicable — this phase uses existing tooling as-is. No framework upgrades in scope per D-09.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Baseline full-suite fail count will be in the 5-20 range consistent with late-March history | Scope | If actual is 100+, scope explosion — triggers the risk-mitigation path below |
| A2 | The historical flake hit list predicts Phase 106's actual problem specs | Historical Flake Hit List | If the list is stale (e.g., the specs were already fixed post-2026-04-01), budget shifts elsewhere. Low consequence: baseline pass reveals truth in ~15 min. |
| A3 | `create-e2e-users.py` is still current and runs cleanly against the present ZITADEL state | Pitfall 6 | If not, baseline capture is blocked until E2E user seed is fixed — that fix is in-scope per D-09 if minimal |
| A4 | vitest unit tests don't touch docker/ZITADEL and run cleanly in isolation | Architecture Patterns | Low — vitest uses happy-dom per `vitest.config.ts` verified. |
| A5 | The phase 107-110 work will *rewrite* (not just *touch*) canvassing/map/offline specs, making fix-attempts on those pre-existing specs wasted work | Pitfall 5 | Medium — if the v1.18 phases only extend behavior instead of rewriting, then 106 should fix (not delete) those specs. Planner should confirm by reading 107-110 scopes before the triage task runs. |

**None of the verified items (test framework versions, config file contents, `run-e2e.sh` capabilities, `.skip` marker locations, historical failure data) are assumptions.**

## Open Questions (RESOLVED)

1. **Where does `106-BASELINE.md` live and does it commit?**
   - Recommendation: `.planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md`, committed alongside the Wave-0 task. Raw log artifacts (pytest/vitest/playwright tee outputs) land in `artifacts/` subdirectory and are NOT committed.
2. **Does the exit-gate require the full v1.18 milestone branch to be green, or just the phase 106 branch?**
   - Recommendation: phase 106 branch only. Milestone-level green comes at phase 110 per TEST-01/02/03 anchoring.
3. **Who runs the exit gate — the final triage task or a dedicated verification task?**
   - Recommendation: dedicated Wave-2 task, so the two consecutive Playwright runs are cleanly attributable in the commit log and `e2e-runs.jsonl` has two back-to-back all-green entries with the phase-106 timestamp.
4. **What happens if the final triage task cleans the Playwright suite but the FIRST of the two-consecutive verification runs fails due to a new flake?**
   - Recommendation: treat as a real flake — enter the 3x rerun loop on the failing spec, triage per D-04, then re-attempt the two consecutive runs. Do not tick the exit gate until two consecutive runs are actually green.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | pytest invocation | presumed ✓ | — | none; blocking per CLAUDE.md |
| `ruff` (via uv) | pre-commit lint gate | ✓ | bundled via uv | none |
| `docker compose` stack | Playwright integration, ZITADEL, Postgres | presumed ✓ | — | none; phase blocks without full stack |
| `node`/`npm` | vitest + Playwright | presumed ✓ | — | none |
| `jq` | Parsing `e2e-runs.jsonl` in tasks | ✓ | (used inside run-e2e.sh already) | Fall back to grep if missing |
| `web/scripts/run-e2e.sh` | Every Playwright invocation | ✓ | — | None — mandated by D-13 |
| ZITADEL E2E users (owner1@localhost etc.) | Playwright auth | auto-created by wrapper | — | Wrapper self-heals via `create-e2e-users.py` |
| Alembic migrations at head | pytest integration | must verify in Wave 0 | — | `docker compose exec api alembic upgrade head` if drift detected |

**Missing dependencies with no fallback:** none known. All blockers are either auto-healing (E2E users) or self-verifying (alembic, docker).

**Verification task for Wave 0:** Before baseline capture, the task should run `docker compose ps` to confirm all services up, `docker compose exec api alembic current` to confirm migration head, and `curl -sk https://localhost:5173/` to confirm Vite dev.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | pytest 9.0.2+ with pytest-asyncio 1.3.0+ (asyncio_mode=auto) |
| Framework (frontend unit) | vitest + happy-dom |
| Framework (E2E) | @playwright/test via `web/scripts/run-e2e.sh` wrapper |
| Config files | `pyproject.toml [tool.pytest.ini_options]`, `web/vitest.config.ts`, `web/playwright.config.ts` |
| Quick run command | `uv run pytest tests/path/test_file.py::test_name -x` / `cd web && npx vitest run src/path/File.test.tsx` / `cd web && ./scripts/run-e2e.sh single.spec.ts` |
| Full suite command | `uv run pytest` / `cd web && npx vitest run` / `cd web && ./scripts/run-e2e.sh` |

### Phase Requirements → Test Map

This phase IS the test layer. The "validation" is the exit gate itself (D-12), not new tests.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-04 | Pytest exits 0 | suite | `uv run pytest` | ✅ |
| TEST-04 | Vitest exits 0 | suite | `cd web && npx vitest run` | ✅ |
| TEST-04 | Playwright two consecutive greens via wrapper | suite×2 | `cd web && ./scripts/run-e2e.sh && ./scripts/run-e2e.sh` | ✅ |
| TEST-04 | No unjustified `.skip`/`.xfail`/`.fixme` | static | `grep -rn '\.skip\|\.fixme\|xfail' tests/ web/src/ web/e2e/` manually reviewed | ✅ |

### Sampling Rate
- **Per task commit (pytest batch):** `uv run pytest tests/<affected_module>/` (<30s where possible)
- **Per task commit (vitest batch):** `cd web && npx vitest run <affected_glob>` (<30s)
- **Per task commit (Playwright batch):** `cd web && ./scripts/run-e2e.sh <affected_spec.ts>` (runs through wrapper to log to JSONL)
- **Per wave merge:** full suite of whichever framework the wave touched
- **Phase gate:** D-12 exit gate — pytest + vitest + 2×run-e2e.sh, all exit 0

### Wave 0 Gaps
- [x] pytest config — exists (`pyproject.toml`)
- [x] vitest config — exists (`web/vitest.config.ts`)
- [x] Playwright config — exists (`web/playwright.config.ts`)
- [x] run-e2e.sh wrapper — exists and verified
- [x] E2E auth seed — auto-handled by wrapper
- [ ] `106-BASELINE.md` — does not exist; Wave-0 task creates it
- [ ] `.planning/phases/106-test-baseline-trustworthiness/artifacts/` — does not exist; Wave-0 task creates it
- [ ] Verification that alembic is at head — Wave-0 task should probe

*No test framework installs or config files need creation. The entire Wave-0 "gap" list is one markdown file, one directory, and a verification step.*

## Risks to Planning

### Risk 1: Scope explosion (>50 failing tests)
**What:** Baseline reveals 50-200 failures, vastly exceeding the implicit budget in D-01's 15-min-per-test time box.
**Probability:** MEDIUM (historical runs show 0-10 fails, but the last full-suite run is 9 days old — could have rotted).
**Mitigation:**
- If baseline fails >50: **pause the phase**, return to user with the baseline file, and request a scope confirmation or extended budget before proceeding.
- Planner should include an explicit "baseline review gate" in the Wave-0 task: after `106-BASELINE.md` is written, check the count; if above threshold, stop and ask.
- Suggested threshold: 50 total failing tests across all three suites.

### Risk 2: Docker Compose startup itself flakes
**What:** ZITADEL, Postgres, or MinIO intermittently fail to start, causing baseline capture to conflate service flake with test flake.
**Probability:** LOW-MEDIUM (known pain point per user memory and CLAUDE.md TLS notes).
**Mitigation:**
- Wave-0 task must verify all services healthy via `docker compose ps` + a curl probe to Vite + a `docker compose exec api alembic current` check BEFORE running any test suite.
- If service flake is detected mid-triage, treat it as NOT a test bug. Restart services and resume the triage batch — do not count it against D-01.

### Risk 3: Shared test-util fix ripples
**What:** Fixing one test by modifying `tests/conftest.py`, `web/src/test/setup.ts`, or `web/e2e/` shared helpers breaks other tests invisibly, and the breakage is discovered only at the Wave-2 exit gate.
**Probability:** MEDIUM.
**Mitigation:**
- Every touch of a shared fixture/util file must be followed immediately by a FULL suite run of that framework (not just the targeted test).
- If the full run introduces new failures, revert the shared fix and take a per-test alternative.
- Per-batch commits (D-14) make bisection cheap if a ripple is found later.

### Risk 4: v1.18-imminent test rewrite wasted work
**What:** Agent fixes a canvassing / map / offline test in phase 106 that phase 107-110 is about to rewrite.
**Probability:** MEDIUM.
**Mitigation:** See Pitfall 5 — prefer delete-with-justification-referencing-downstream-phase over fix for any test in the canvassing/map/offline domain. Planner should cross-reference the failing test list against phases 107-110 requirement IDs during triage.

### Risk 5: Worker-count-dependent flakes (Pitfall 2)
**What:** Baseline at `--workers 16` shows flakes that disappear at `--workers 4`, making the fix an infrastructure change rather than a test change, which might cross D-09 ("no infra rewrites").
**Probability:** LOW-MEDIUM (historical data suggests concurrency tuning was attempted).
**Mitigation:** Lowering the *default* workers is an infra change → out of scope per D-09. But documenting the concurrency sensitivity in `106-BASELINE.md` and either deleting the flaky spec OR fixing its internal synchronization (awaits, locators) is in-scope. Do not edit `playwright.config.ts` `workers:` value.

## Security Domain

This phase modifies tests only, not product code or auth flows. The only security-adjacent surface is the ZITADEL E2E user seeding (handled by `run-e2e.sh` automatically) and the no-MFA policy verification (strict-mode check in the wrapper). No V2-V6 ASVS categories apply to this phase's work product. Skipping a detailed ASVS table is appropriate.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` — all locked decisions
- `.planning/REQUIREMENTS.md` §TEST — TEST-04 definition (line 55)
- `.planning/ROADMAP.md` Phase 106 (line 215) — success criteria
- `CLAUDE.md` (project root) — run-e2e.sh mandate, uv/ruff rules
- `pyproject.toml` lines 37-40, 59-67 — pytest framework versions and config
- `web/vitest.config.ts` — vitest/happy-dom config
- `web/playwright.config.ts` — Playwright projects, workers, retries, auth state model
- `web/scripts/run-e2e.sh` — full script read, verified `--loop` vs 3x-rerun mechanics, verified E2E user seeding behavior
- `web/e2e-runs.jsonl` — 725 runs, 581 with failures, grouped historical-flake hit list produced via verified `jq` pipeline
- user global `CLAUDE.md` — uv/ruff/commit discipline
- user memory (`feedback_e2e_run_logging.md`, `feedback_dev_server_docker.md`, `reference_alembic_version_column_width.md`) — troubleshooting context for Pitfalls 1, 3, 4

### Secondary (MEDIUM confidence)
- Grep of `web/e2e/*.spec.ts` for `.skip/.fixme/.only` — 11 occurrences across the exact 7 files listed in D-11 (cross-validation that the scout report is current)

### Tertiary (LOW confidence)
- None used. Nothing in this research relies on training-data-only assertions about library behavior.

## Metadata

**Confidence breakdown:**
- Baseline/triage mechanics: HIGH — every command verified from actual config files or scripts
- Historical flake list: HIGH as historical data, MEDIUM as a predictor of current state (data is ~9 days old)
- Exit-gate commands: HIGH — derived directly from run-e2e.sh read and D-12/D-13 text
- Risk estimates: MEDIUM — probabilities are judgment calls but grounded in specific evidence

**Research date:** 2026-04-10
**Valid until:** 2026-04-17 (7 days — the historical JSONL data ages fast during active development)

**Ready for planning:** Yes. Planner can proceed directly to task breakdown using the phase structure above.
