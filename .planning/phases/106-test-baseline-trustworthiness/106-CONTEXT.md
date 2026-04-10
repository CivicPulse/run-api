# Phase 106: Test Baseline Trustworthiness - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix or delete pre-existing broken and flaky tests across all three suites
(backend `pytest`, frontend `vitest`, Playwright E2E) so that any red test in
the remaining v1.18 work (phases 107–110) is a trustworthy signal of a real
regression. Scope is the *existing* test set only — no new coverage, no test
infrastructure rewrites, no product bug fixes.

Requirement satisfied: **TEST-04**.

</domain>

<decisions>
## Implementation Decisions

### Triage Policy (fix vs delete)
- **D-01:** Every failing test gets a **time-boxed fix attempt of ~15 minutes**.
  If the test covers current, intended behavior and the fix is mechanical
  (selector, wait, assertion update, fixture data) → fix it. If the test covers
  removed/changed behavior, or the fix requires re-designing the test, or the
  time box is exceeded → delete with justification.
- **D-02:** Deletions are documented **in commit message bodies**, one line of
  justification per deleted file. No separate deletion-log artifact. This
  satisfies success criterion #4 (`Any tests deleted during this phase are
  recorded with a short justification in the phase commit messages`) literally
  and keeps the audit trail in git.

### Flaky Test Handling
- **D-03:** Flaky tests count as broken. A test that sometimes passes and
  sometimes fails destroys signal as much as one that always fails. In scope.
- **D-04:** **3x reproduction rule** — a failing Playwright spec is re-run 3x
  consecutively via `web/scripts/run-e2e.sh`. If it passes 3/3 on re-run, treat
  as flake: investigate the root cause briefly (race, selector, timing, state
  leak) and either fix it or delete. **Do not add `retries: 2` to Playwright
  config as a band-aid.** No quarantine tag — everything triaged now.

### Baseline & Scope Fence
- **D-05:** First task of the phase is to run all three suites once, capture
  the exact list of failing and flaky tests into **`106-BASELINE.md`**, and
  commit it. That list *is* the scope of the phase. Any test failure introduced
  after baseline commit is a new regression and not in-scope — it must be
  handled by the phase that introduced it.
- **D-06:** Baseline snapshot must include, per suite: the test file, test
  name, and the observed failure mode (hard fail / flaky / skipped without
  justification). Cursor-based counts go in a summary block at the top.

### Out of Scope (hard fence)
- **D-07:** No adding new test coverage in this phase. TEST-01/02/03 cover new
  coverage obligations in phases 107–110.
- **D-08:** No fixing product bugs revealed by the tests. If a test fails due
  to a real product bug, record the bug as a follow-up (note in commit or
  `.planning/todos/pending/`) and **delete or skip-with-justification** the
  test for now. The goal is trustworthy signal, not bug-fixing.
- **D-09:** Test infrastructure refactoring (fixtures, conftest, test utils,
  CI config) is allowed *only when minimal and necessary* to fix a specific
  test in scope. No wholesale rewrites. Prefer touching the broken test over
  touching shared infra.

### Skipped/xfail Audit Rule
- **D-10:** Every surviving `.skip`, `.fixme`, `pytest.mark.skip`, and
  `pytest.mark.xfail` after this phase MUST have a justification comment
  adjacent to it explaining *why* it's skipped (e.g., "waits on external
  service X", "covers removed feature — pending delete in Phase Y", "known
  flake under investigation with repro steps in …"). No justification = the
  skip is removed: either fix the test so it runs, or delete it.
- **D-11:** Known-skip files from the scout: `web/e2e/rbac.admin.spec.ts`,
  `web/e2e/rbac.manager.spec.ts`, `web/e2e/rbac.viewer.spec.ts`,
  `web/e2e/voter-crud.spec.ts`, `web/e2e/table-sort.spec.ts`,
  `web/e2e/phase21-integration-polish.spec.ts`, `web/e2e/cross-cutting.spec.ts`.
  Each must be audited against D-10.

### Exit Gate (green-bar definition)
- **D-12:** "Clean" means, for each of the three suites:
  - `uv run pytest` exits 0 with no unjustified skips/xfails.
  - Frontend `vitest` run exits 0 with no unjustified `.skip`/`.fixme`.
  - `web/scripts/run-e2e.sh` (full Playwright suite) exits 0, and the last
    **two consecutive runs** are both green (flake check).
- **D-13:** Use `web/scripts/run-e2e.sh` for every Playwright invocation so
  results land in `web/e2e-runs.jsonl` (per project CLAUDE.md and user
  memory). No direct `npx playwright test` for the exit gate runs.
- **D-14:** Phase commits should happen incrementally per-suite or
  per-triage-batch, not one giant commit at the end. This matches the
  project's "commit after each task" norm and keeps delete justifications
  aligned with the code changes.

### Claude's Discretion
- Exact order the three suites are tackled (suggest pytest → vitest →
  Playwright, since pytest is likely lowest-noise).
- How to mechanically detect flaky tests during baseline capture (multi-run
  of suspicious specs vs single-run + intuition).
- Formatting of `106-BASELINE.md` — can mirror the structure of other
  `.planning/phases/**/*-BASELINE.md` files if any exist, otherwise use a
  simple per-suite section with a table of (file, test name, failure mode,
  initial verdict).
- Whether to surface unresolved product bugs as todos in
  `.planning/todos/pending/` or via inline PR comments — executor's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions
- `CLAUDE.md` — mandates `web/scripts/run-e2e.sh` wrapper for Playwright and
  `uv run pytest` for backend. Ruff linting rules and Python conventions.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §TEST — TEST-01..TEST-04. Phase 106 addresses
  TEST-04 (line 55). Out-of-scope items line 69–76.
- `.planning/ROADMAP.md` §Phase 106 (line 215) — goal, success criteria,
  dependencies (none — first phase of milestone).

### Test suite entry points
- `web/scripts/run-e2e.sh` — Playwright wrapper that logs to
  `web/e2e-runs.jsonl`. Use for ALL e2e runs in this phase.
- `web/e2e-runs.jsonl` — historical pass/fail/skip data. Useful signal for
  identifying flaky specs (grep for runs with `"fail": [1-9]`).
- `pytest.ini` / `pyproject.toml` — backend test config (asyncio_mode=auto,
  markers: integration, e2e).

_No ADRs or specs exist for this phase — the decisions above are
self-contained. Downstream agents do not need to fetch external docs._

</canonical_refs>

<code_context>
## Existing Code Insights

### Test Suite Inventory (from scout)
- **Backend:** 133 files under `tests/`. No `@pytest.mark.skip` or `xfail`
  markers found — the broken tests (if any) fail hard rather than being
  silently skipped. This means pytest triage is primarily "fix or delete
  failing tests," not "audit skip justifications."
- **Frontend unit:** 79 `*.test.ts(x)` / `*.spec.ts(x)` files under `web/src`
  (excluding `web/e2e`).
- **Playwright E2E:** 60 spec files under `web/e2e/`. 7 of them contain
  `.skip` / `.fixme` markers (see D-11). History in `e2e-runs.jsonl` shows
  mixed pass/fail runs (725 total runs logged) with occasional bursts of 10+
  failures — strong flaky-or-broken signal.

### Established Patterns
- Python package management: `uv` only, never `pip` or system python.
- Lint: `uv run ruff check .` / `uv run ruff format .` before any commit.
- E2E runs always via `web/scripts/run-e2e.sh`, which appends to
  `e2e-runs.jsonl` with pass/fail/skip counts, duration, and command. This
  phase will *heavily* rely on that log for flake detection and exit-gate
  verification.
- Docker Compose dev environment — backend and frontend both run in
  containers. Tests should be runnable in that environment.

### Integration Points
- No product code changes expected in this phase — scope is test files,
  possibly minimal shared test utilities (fixtures, mocks). Any product code
  diff should trigger a "is this scope creep?" check by the executor.

</code_context>

<specifics>
## Specific Ideas

- Success criterion #4 (deletions recorded in commit messages) is the
  load-bearing audit trail. Planner must design the task breakdown so that
  deletions are batched into commits with legible, greppable justification
  bodies — not a single end-of-phase squash.
- User's CLAUDE.md memory explicitly calls out `run-e2e.sh` logging as a
  health-tracking signal over time. This phase should *improve* that log's
  signal-to-noise, not degrade it.
- 3x reproduction rule (D-04) is the single most important guardrail against
  burning the phase budget on mis-identified flakes.

</specifics>

<deferred>
## Deferred Ideas

- **Playwright `retries` config as baseline** — rejected as a band-aid (see
  D-04). If, after this phase, flakes still recur, a future milestone could
  revisit this as an infrastructure decision, not a per-test fix.
- **Quarantine tag for flaky specs** — rejected in favor of triage now
  (D-04). If the phase reveals that certain specs are flaky due to external
  dependencies (ZITADEL, MinIO, Postgres race conditions) that can't be
  fixed in ~15 min, those become candidates for a future "test infra
  hardening" phase.
- **GitHub Actions CI green-bar as exit gate** — rejected for this phase
  (local green is sufficient per D-12). CI-specific failures, if any, become
  a follow-up.
- **Linked GitHub issue per skipped test** — rejected in favor of inline
  justification comments (D-10). Lower overhead, kept in-source.
- **Product bug fixes revealed by failing tests** — explicitly deferred
  (D-08). Recorded as follow-ups; the relevant feature phase (107–110)
  should pick them up.

</deferred>

---

*Phase: 106-test-baseline-trustworthiness*
*Context gathered: 2026-04-10*
