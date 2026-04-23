# Phase 112: SEED-002 Continuous Verification Infrastructure — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Milestone:** v1.20 Native Auth Rebuild & Invite Onboarding

> **Supersedes:** `.planning/phases/112-schema-migration-legacy-invite-handling/112-CONTEXT.md` (stale v1.19 pre-pivot artifact; left in place for historical reference but not load-bearing).

---

## Phase Boundary

Phase 112 stands up the three-layer continuous-verification safety net **before** the cross-cutting auth rewrite begins in Phase 113. SEED-002 is a hard prerequisite: without it, the rewrite replays v1.18 Phase 106's 219-silent-failure drift at larger scale (TI5, PITFALLS.md).

**In scope:**
- `.pre-commit-config.yaml` at repo root — ruff check+format, prettier on staged files, `uv lock --check`, `vitest related` on staged TS. Lean <5s budget.
- `.github/workflows/nightly.yml` — full pytest + vitest + Playwright on `main`, scheduled at ~02:00 UTC, invokes trend analyzer, auto-opens a GitHub issue on regression.
- `.github/workflows/pr.yml` modified — add `push:` trigger running a quick lint+unit subset for feature branches without open PRs.
- `web/scripts/analyze-e2e-trend.sh` — reads `web/e2e-runs.jsonl` tail-100 and tail-20, exits non-zero when tail-20 pass-rate drops ≥5pp below tail-100.
- `scripts/doctor.sh` — env-drift healthcheck (coverage locked below), called as last step of `bootstrap-dev.sh` and first step of every CI workflow. Prints one-line remediation hints on failure.
- `scripts/seed002-gate-check.sh` — canonical "are we safe to proceed" script. Reads CI run history + tail of `e2e-runs.jsonl`; exits 0 when the last two runs of pytest, vitest, and Playwright are all green. Callable from future plan-phase workflows.
- Husky + lint-staged wiring in `web/` (dev dependency; hooks install automatically via `bootstrap-dev.sh`).
- `scripts/bootstrap-dev.sh` modified — runs `pre-commit install`, `cd web && npm install` (which triggers husky install), and `scripts/doctor.sh` as final steps.
- CI workflows for SEED-002 infrastructure itself (every new script has a smoke test — self-coverage is success-criterion #5).

**Out of scope (deferred to later phases):**
- fastapi-users migration, access_token table, cookie transport (Phase 113).
- CSRF middleware (Phase 114).
- Frontend auth rewire (Phase 115).
- Invite flow, password reset, ZITADEL teardown, session lifecycle (116–119).
- Slack / PagerDuty integration for alerts (explicitly deferred — see decisions).
- `@smoke` tag curation or stratified E2E runs (explicitly deferred).
- Hard-blocking `/gsd-plan-phase 113` on the gate script (advisory only).
- Banning `--no-verify` via server-side push check (not chosen — relies on short hook runtime as the prevention).

---

## Decisions (locked)

### D1. Pre-commit hook scope — **Lean <5s budget**

Runs on every `git commit`:

- `uv run ruff check --fix` + `uv run ruff format` (includes DTZ ruleset for the naive-datetime ban — SEC-05 invariant).
- `prettier --check` on staged TS/TSX/JSON/MD files.
- `uv lock --check` (fails if `pyproject.toml` and `uv.lock` have drifted).
- `cd web && npx vitest related --run` on staged web TS files (via lint-staged).

**Explicitly NOT in pre-commit:**
- `pytest --lf -x` → moved to push-CI (kept hook under 5s to prevent `--no-verify` muscle memory, CV3).
- `detect-secrets` / `gitleaks` → moved to push-CI (same reason; real-but-costly scan).
- Full `pytest` or full `vitest` → nightly only.

**Why:** PITFALLS CV3 (severity 3) — hooks over ~10s breed `--no-verify` habit, which eliminates the entire safety layer. A strict <5s budget is the prevention.

**How to apply:** The `.pre-commit-config.yaml` entries must each measurably stay under 5s on a 2-file diff. If any hook regresses past 5s in practice, move it to push-CI rather than accepting the friction.

### D2. Regression alert channel — **GitHub issue only**

- **Nightly regressions** → `gh issue create` auto-opens a tracking issue, auto-assigned to the last committer (`github.event.head_commit.author.email` → `gh api users lookup`). Title format: `[nightly-regression] YYYY-MM-DD — tail-20 at X%, tail-100 at Y%`. Body includes links to the failing run, failing spec names, and a remediation checklist.
- **Push-CI failures** → rely on GitHub's native red-X on the commit + default email notifications. No additional routing.
- **Explicitly NOT:** Slack DMs, `#engineering` channel broadcasts, PagerDuty. Adding these can happen post-v1.20 without rework; nothing in Phase 112 commits us to *not* doing it later.

**Why:** PITFALLS CV4 (severity 3) — broadcast channels produce alert fatigue on intermittent flakes, the team mutes, real regressions sail through. GitHub issues are durable, triaged, and auto-assigned. Also: solo/small-team operator — Slack DM adds infra without new signal.

**How to apply:** The nightly workflow's regression-path step uses `gh issue create --assignee "$AUTHOR_HANDLE" --label "nightly-regression,auth-milestone" --title "..." --body-file "$SUMMARY_FILE"`. Do not add Slack webhook secrets in this phase.

### D3. Nightly E2E strategy — **Full every night, 5pp regression threshold**

- Nightly workflow runs the **full** pytest + vitest + Playwright suite on `main` at ~02:00 UTC via `web/scripts/run-e2e.sh` (which already logs to `web/e2e-runs.jsonl`).
- `web/scripts/analyze-e2e-trend.sh` reads JSONL, computes pass-rate for tail-20 and tail-100 runs. If `tail20_pass_rate < tail100_pass_rate - 5pp`, exits non-zero.
- No `@smoke` tag curation. No stratified weekly-full / nightly-smoke split.

**Why:** The cross-cutting auth rewrite (113–118) will touch every route and every fixture. Maintaining a `@smoke` subset through that churn is a second moving part that will rot. Full-every-night is operationally simpler; 30-40min runtime is acceptable overnight.

**How to apply:** The analyzer threshold lives in `web/scripts/analyze-e2e-trend.sh` as a single constant (`REGRESSION_THRESHOLD_PP=5`) so it can be tuned without rewriting the script. When Phase 113+ adds new specs, re-baseline by letting tail-100 accumulate for ≥20 runs before treating the trend signal as authoritative.

### D4. Phase-exit gate enforcement — **Gate script, advisory**

- `scripts/seed002-gate-check.sh` is the canonical "are we safe to proceed" script. It:
  1. Runs `gh run list --branch main --workflow nightly.yml --limit 2 --json conclusion,createdAt` — requires both runs `conclusion == "success"`.
  2. Runs `gh run list --branch main --workflow pr.yml --limit 2 --json conclusion` (full-on-main path) — requires both green.
  3. Reads `web/e2e-runs.jsonl` tail-2 — requires both `status == "pass"` with zero skips outside a curated quarantine allowlist (empty at Phase 112 exit).
  4. On success: exits 0 with a summary.
  5. On failure: exits non-zero, printing each failing gate with links.
- `/gsd-plan-phase 113` (and every subsequent auth-milestone phase) invokes this script as part of its pre-planning checks and cites the output in PLAN.md. **Advisory only** — the operator can override with a justification comment in PLAN.md if they choose. No hard block wired into the plan-phase workflow itself in this phase.

**Why:** Hard-blocking the plan-phase workflow requires modifying the GSD plan-phase skill, which is out-of-scope (GSD framework change, not a project change). The operational discipline of "plan-phase cites the gate output" preserves the intent without the cross-repo edit. The script itself is the durable artifact — future phases can wire it into plan-phase if we want harder enforcement later.

**How to apply:** Phase 113's PLAN.md must include a `## SEED-002 Gate` section with the script's output pasted verbatim. If gate is red, PLAN.md must include a justification paragraph; absence of this section is a plan-check failure (gsd-plan-checker enforces).

---

## Locked by research defaults (not discussed, not re-openable without explicit request)

- **Three-layer architecture:** pre-commit + push-CI + nightly (ARCHITECTURE.md Q8). No fourth layer, no collapsing into two.
- **Toolchain versions:** `pre-commit>=4.6.0,<5`, `husky ^9.1.7`, `lint-staged ^16.4.0`, `prettier ^3.8.3` (STACK.md). Pinned minors; no auto-upgrade in Phase 112.
- **`scripts/doctor.sh` drift coverage:** DB port in `.env` matches `docker compose port db 5432`, E2E users present in the DB, `pyproject.toml` ↔ image dep skew, migration head matches `alembic heads`. Exits non-zero with a one-line remediation for each failure. Called by `bootstrap-dev.sh` last-step and as first step of every CI workflow (ARCHITECTURE.md Q8 + Roadmap success criterion #4).
- **Bootstrap auto-install UX:** `bootstrap-dev.sh` runs `pre-commit install` and `npm install` (triggering husky install) **silently** as part of its normal output. No prompt, no opt-in — this is the safety net, not a feature flag.
- **`--no-verify` policy:** Permitted (no server-side block). Prevention is the <5s hook budget (D1), not policy enforcement. Reopen only if we observe `--no-verify` commits in the log during v1.20.
- **`web/scripts/run-e2e.sh`:** Already exists, already logs JSONL. Do NOT rewrite it — only add sibling `analyze-e2e-trend.sh` that consumes the JSONL it produces.
- **Datetime-naive AST backstop:** Already implied by the DTZ ruleset in ruff + the unit test `tests/unit/test_no_naive_datetime.py`. Ships in this phase as a CI invariant because SEC-05 is inherited by every subsequent auth phase.

---

## Downstream guidance

### For gsd-phase-researcher
Research targets for plan-phase:
1. **Exact pre-commit hook invocation for `uv lock --check`** — does `uv lock --locked` exist as a subcommand, or must we script it? (Context7 on uv >=0.5 docs.)
2. **Husky v9 + lint-staged v16 interaction with `cd web`** — husky hooks live at repo root but lint-staged config is in `web/package.json`. Verify the hook can `cd web && npx lint-staged` cleanly.
3. **GitHub Actions `push:` trigger on feature branches** — confirm billable-minute impact for the subset workflow and whether we want `paths-ignore` for doc-only changes.
4. **`gh run list` filtering by workflow file path vs. name** — for `seed002-gate-check.sh` to be robust across workflow renames.
5. **Playwright nightly stability baseline** — sample the last ~50 `web/e2e-runs.jsonl` entries on main to understand current pass-rate; if it's already <95%, the 5pp threshold will trigger immediately and needs seasoning.

### For gsd-planner
Plan breakdown expectations (≥3 plans, atomic):
- **Plan A — Pre-commit + husky + bootstrap wiring** (D1): `.pre-commit-config.yaml`, husky/lint-staged in `web/package.json`, `bootstrap-dev.sh` edits, self-smoke test.
- **Plan B — CI workflows: push trigger + nightly** (D2, D3 partial): `.github/workflows/pr.yml` modification for `push:`, new `nightly.yml`, issue-creation step. Depends on Plan A for doctor.sh availability.
- **Plan C — `analyze-e2e-trend.sh`** (D3): the analyzer script + integration into `nightly.yml`. Independent of A/B for implementation; wires into B for invocation.
- **Plan D — `scripts/doctor.sh`** (research-default drift coverage): the script + `bootstrap-dev.sh` integration + CI first-step invocation. Parallelizable with A/B/C.
- **Plan E — `scripts/seed002-gate-check.sh`** (D4): the gate script + a unit test that exercises it against mocked `gh` output. Depends on B (needs nightly workflow to exist for the script to query). Plan-phase for 113 will invoke this script — Plan E is the deliverable that makes 113 callable.
- **Plan F — Self-coverage smoke tests** (success-criterion #5): CI job that exercises each new script with mocked failures to confirm they exit non-zero and produce the documented output.
- **Datetime-naive AST backstop**: can live inside Plan A (ruff DTZ + unit test together) or split out — planner's call.

Parallelization: A, D can run in parallel (no shared files). B depends on D for first-step invocation. C and E depend on B. F is final.

---

## Deferred Ideas (do not act on in this phase)

- **Slack webhook for push-CI failures** — captured as a future enhancement. Wire-up cost is minimal; deferred because (a) GitHub email already reaches kerry@, (b) webhook secret adds surface, (c) alert-fatigue risk is real during an auth rewrite. Revisit post-v1.20.
- **Stratified smoke-nightly / full-weekly E2E** — revisit if full nightly runtime regresses past 60 minutes or GitHub Actions billable-minute cost becomes load-bearing.
- **Hard-block `/gsd-plan-phase` on red gate** — revisit if any phase in v1.20 advances with a red gate despite the advisory cite; at that point the operational discipline has failed and we need structural enforcement.
- **`--no-verify` server-side block** — revisit only if hook-bypass commits appear in the log during v1.20. Not preemptive.
- **`@smoke` tag maintenance** — revisit alongside the stratified-nightly question.
- **Quarantine allowlist** — deliberately empty at Phase 112 exit. Growing it is the exact CV5 anti-pattern (PITFALLS); a future phase may need a formal quarantine-promotion policy if flaky specs appear during 113–118.

---

## Success Criteria recap (from ROADMAP.md)

1. Pre-commit hook rejects ruff/prettier drift in <5s with file+rule citation; installed by `bootstrap-dev.sh` on fresh clone. *(D1 + bootstrap-dev.sh default.)*
2. Push that breaks pytest/vitest produces a red GitHub Actions check within 10 min of push, not only on PR open. *(D2 + push: trigger on pr.yml subset.)*
3. Monday-morning regression appears in Tuesday-morning nightly summary (tail-delta appended to `web/e2e-runs.jsonl`), attributable to the introducing commit. *(D3 + nightly.yml + analyze-e2e-trend.sh.)*
4. `scripts/doctor.sh` exits non-zero on known env drift with one-line remediation; CI first-step. *(Research default.)*
5. Phase-exit gate: pytest + vitest + Playwright green on two consecutive runs; SEED-002 infra itself has CI coverage. *(D4 via seed002-gate-check.sh + Plan F self-coverage.)*
