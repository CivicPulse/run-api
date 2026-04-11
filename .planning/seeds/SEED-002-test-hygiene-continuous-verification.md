---
id: SEED-002
status: dormant
planted: 2026-04-10
planted_during: v1.18 Field UX Polish — Phase 106 (Test Baseline Trustworthiness)
trigger_when: Start of next milestone (v1.19+) during scoping, OR any time the user mentions "tests are broken", "CI gaps", "catch drift earlier", or proposes a new test-cleanup phase
scope: Medium
---

# SEED-002: Continuous Test Verification Infrastructure

## Why This Matters

Phase 106 of v1.18 discovered **219+ pre-existing test failures** that had
silently accumulated on `main`. The baseline capture revealed the real shape:

- **488 of 565 failures were environmental drift** that would have been caught
  within 24 hours by a scheduled test run:
  - Postgres host-port drift between `.env` (`:5433`) and the running docker
    stack (`:49374` after a compose recreate)
  - ZITADEL v4 upgrade broke auth-setup selectors in
    `web/e2e/auth-flow.ts` and silently invalidated the E2E user bootstrap
  - Missing `twilio>=9.10.4` dep in the pre-built API docker image
- **The remaining 77 were API/mock shape drift** — tests that rotted because
  mocks weren't updated when product code changed response shapes. E.g., a
  single `signups.map is not a function` bug masked 34 vitest failures in the
  shifts route.
- The **historical flake hit list** (725 logged run-e2e.sh runs with 581
  failures) looked like chronic test brittleness but was actually a symptom
  of the two env drifts masking as per-test rot.

**User feedback** (2026-04-10): *"I'm just surprised that there was this much
test failures without anyone noticing. We should be doing testing more often
to catch stuff like this before it causes issues later like this."*

Cleanup phases are **expensive** compared to continuous verification.
Phase 106 burned ~1.5-2 hours of active triage plus a scope-explosion
checkpoint that required user adjudication. A daily scheduled run would have
caught every one of these failures within their first day of existence, when
the author still had context.

## When to Surface

**Trigger:** Start of next milestone (v1.19) during scoping.

This seed should be presented during `/gsd-new-milestone` when:
- Starting v1.19 or any subsequent milestone — to evaluate whether this
  belongs in the scope
- The user mentions "tests are broken" or proposes another test-cleanup
  phase (meta-signal: cleanup phase #2 means the first one didn't address
  root cause)
- Planning CI/infra work of any kind
- The phase-verify cluster deferred from phase 106
  (see `.planning/todos/pending/106-phase-verify-cluster-triage.md`) comes
  up for triage — that cluster is itself evidence of the same problem

## Scope Estimate

**Medium** — a phase or two, not a full milestone. Rough breakdown:

1. **Pre-commit hooks** (~2-4 hrs)
   - Add `lint-staged` / `pre-commit` config
   - `uv run pytest --lf -x` (last-failed, fail-fast) on staged `.py` files
   - `cd web && npx vitest related --run` on staged `.ts`/`.tsx` files
   - `uv run ruff check --fix` + `uv run ruff format` already mandated
     (CLAUDE.md) but likely not enforced via hook

2. **CI push trigger** (~2-4 hrs)
   - Current `.github/workflows/pr.yml` runs unit + integration + Playwright
     but ONLY on `pull_request:` — not on direct pushes to feature branches
   - Add `push:` trigger or a lighter unit-only push workflow so branches
     without open PRs still get signal
   - Document the tradeoff between push-spam and coverage

3. **Scheduled nightly run** (~3-6 hrs)
   - New workflow: full suite on `main` nightly, maybe weekly for
     feature branches
   - On regression (delta vs. previous night), open a GitHub issue
     automatically with the failing tests list
   - Integrate with `web/e2e-runs.jsonl` logging so the trend data becomes
     actionable instead of archaeological

4. **Env-drift healthcheck** (~2-4 hrs)
   - Extend `scripts/bootstrap-dev.sh` or add a `scripts/doctor.sh` that
     validates:
     - `.env` DB port matches `docker compose port db 5432`
     - ZITADEL E2E users exist and auth-setup spec passes a smoke run
     - API docker image has all pyproject deps (heuristic: `pip freeze`
       inside container vs. `uv export`)
     - `web/.env.local` is in sync with `.zitadel-data/env.zitadel`
   - Run this healthcheck as the first step of any CI workflow and fail fast
     with a human-readable error

5. **Optional: regression alerting on run-e2e.sh** (~2-3 hrs)
   - Script that parses `web/e2e-runs.jsonl`, compares tail-20 vs. tail-100,
     and emits a Slack/Discord/email notification on deterioration

**Total estimate:** 11-21 hrs active work → 1 phase if prioritized, 2 smaller
phases if split between "local tooling" and "CI/scheduling."

## Breadcrumbs

Related code and decisions found in the current codebase:

- `.github/workflows/pr.yml` — existing CI workflow, PR-trigger only. Runs
  `uv run pytest -m "not integration and not e2e"`, integration suite,
  and Playwright shards. No `push:` or `schedule:` triggers.
- `.github/workflows/publish.yml` — image publish workflow, not test-related
- `scripts/bootstrap-dev.sh` — dev environment bootstrapper, prime location
  for env-drift healthcheck integration
- `web/scripts/run-e2e.sh` — Playwright wrapper that logs to
  `web/e2e-runs.jsonl`. The logging exists; the alerting/analysis doesn't.
- `web/e2e-runs.jsonl` — 725+ runs logged historically. The raw material
  for a "regression alerting" feature.
- `.planning/phases/106-test-baseline-trustworthiness/106-BASELINE.md` —
  the full scope breakdown of what a missing CI caught. Read this if
  scoping the work, it's the strongest evidence for the seed.
- `.planning/phases/106-test-baseline-trustworthiness/106-CONTEXT.md` §D-15 —
  the scope-decision record from the Option D hybrid triage.
- `.planning/todos/pending/106-phase-verify-cluster-triage.md` — the
  ~43 specs deferred from phase 106, evidence that another cleanup phase
  will eventually be needed if this seed isn't promoted first.
- `CLAUDE.md` — already mandates `web/scripts/run-e2e.sh` and `uv run`
  patterns. Any new automation must honor those conventions.

## Hard Constraints

**Dev/test env is docker-compose-only.** Any implementation of this seed
MUST honor the project invariant: the entire local stack runs via
`docker compose up -d`. No standalone `vite`, `npm run dev`,
`uv run uvicorn`, or `python` commands to start dev servers.

Concrete implications for each deliverable above:

- **Pre-commit hooks** — can run `pytest --lf` and `vitest related` against
  already-up docker services, but must NOT spin up anything new. If
  compose isn't already up, the hook should fail fast with
  "run `docker compose up -d` first" rather than silently start a
  background process.
- **Push-trigger CI** — every test job starts with
  `docker compose up -d --wait` (or equivalent healthcheck wait). Never
  `uv run uvicorn &` or `npm run dev &` as a background step.
- **Scheduled nightly run** — same compose-up-first pattern. The full
  suite runs against compose-hosted services.
- **Env-drift healthcheck** — should *additionally* validate that no
  services are running **outside** the compose stack (e.g., no rogue
  vite or uvicorn processes bound to the dev ports).
- **E2E targeting** — `E2E_DEV_SERVER_URL` points at the docker `web`
  service URL, not a local vite instance. The override added in
  phase 106 exists for this exact purpose.
- **Seed data for tests** — scripts hit the running compose stack
  (e.g., `scripts/seed.py`, `scripts/create-e2e-users.py`), never a
  separately-spun backend.

This constraint is load-bearing: phase 106 proved that 488 of 565 silent
failures were env drift, and much of that drift would be impossible under
strict compose-only discipline. Solving the symptom (continuous tests)
without solving the cause (env-parity) just accelerates the drift
detection without preventing the drift itself.

## Notes

- This seed is **prerequisite** to any future milestone that touches
  test-heavy areas. If v1.19 starts with more field UX work without
  addressing continuous verification first, the same drift will accumulate
  and another cleanup phase will be needed.
- User explicitly called out that `run-e2e.sh` logging exists for the
  purpose of health tracking but currently has no alerting layer — that's
  the highest-leverage single fix (item 5 above).
- Option D hybrid triage in phase 106 explicitly accepted that 43 specs
  would be deferred. That defer is only safe if continuous verification
  is in place before those specs become load-bearing again.
- Related memory: `feedback_test_hygiene.md` in user auto-memory captures
  the same preference and will inform any future test-related suggestions.
