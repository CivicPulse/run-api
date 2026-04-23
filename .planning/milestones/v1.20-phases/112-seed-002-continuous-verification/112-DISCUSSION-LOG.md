# Phase 112 Discussion Log

**Date:** 2026-04-23
**Mode:** discuss
**Phase:** 112 — SEED-002 Continuous Verification Infrastructure (v1.20)

## Context loaded

- `.planning/ROADMAP.md` (v1.20, 2026-04-23)
- `.planning/STATE.md` (milestone v1.20, roadmap defined)
- `.planning/research/SUMMARY.md`, `ARCHITECTURE.md` Q8, `PITFALLS.md` (TI5, CV1-CV5)
- Noted stale `.planning/phases/112-schema-migration-legacy-invite-handling/` from pre-pivot v1.19; superseded, not re-used.

## Gray areas surfaced (7) → user selected 4

1. Pre-commit scope & speed ✅
2. Regression alert channel ✅
3. Nightly E2E scope & threshold ✅
4. Phase-exit gate enforcement ✅
5. `scripts/doctor.sh` drift coverage — **locked to research default** (DB port, E2E users, pyproject/image skew, migration head)
6. `--no-verify` policy — **locked: permitted; prevention is <5s hook budget, not policy**
7. Bootstrap auto-install UX — **locked: silent install in `bootstrap-dev.sh`**

## Decisions (one question per gray area, one at a time)

### D1. Pre-commit scope & speed → **Lean <5s (Recommended)**
- ruff check+format (incl. DTZ), prettier on staged, `uv lock --check`, `vitest related` on staged TS.
- `pytest --lf -x`, `detect-secrets`, `gitleaks` moved to push-CI.
- **Reason cited:** CV3 severity-3 — slow hooks breed `--no-verify` habit. <5s is the structural prevention.

### D2. Regression alert channel → **GitHub issue only (Recommended)**
- Nightly regression auto-opens issue, auto-assigned to last committer; push-CI uses GitHub-native red-X + email.
- No Slack, no `#engineering` broadcast.
- **Reason cited:** CV4 severity-3 — broadcast channels produce alert fatigue, team mutes, real regressions sail through. Solo-operator context reinforces the choice. Reversible in future.

### D3. Nightly E2E scope & threshold → **Full every night, 5pp threshold (Recommended)**
- Full pytest + vitest + Playwright on main at ~02:00 UTC via existing `web/scripts/run-e2e.sh` JSONL logger.
- Regression trigger: tail-20 pass-rate drops ≥5pp vs tail-100.
- No `@smoke` stratification — curation debt during cross-cutting auth rewrite rejected.

### D4. Phase-exit gate enforcement → **Gate script, advisory (Recommended)**
- `scripts/seed002-gate-check.sh` ships in this phase; checks CI run history + `e2e-runs.jsonl` tail-2.
- `/gsd-plan-phase 113+` invokes and cites output in PLAN.md; operator override permitted with justification.
- Hard-block rejected (out-of-scope GSD-framework edit); manual signoff rejected (reopens Phase 106 failure mode).

## Scope-creep redirects
- None during this session. Gray area 5 (`doctor.sh` coverage) was available but user did not select it; research default stood without user expanding scope.

## Next step
- `/gsd-plan-phase 112` — planner breaks CONTEXT into Plans A–F (pre-commit/husky, CI workflows, trend analyzer, doctor, gate script, self-coverage).
