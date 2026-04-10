# Phase 106: Test Baseline Trustworthiness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 106-test-baseline-trustworthiness
**Areas discussed:** Triage policy, Flaky test handling, Baseline & scope fence, Skips + exit gate

---

## Triage Policy (fix vs delete)

### Q1: How should a failing test be triaged into fix vs delete?

| Option | Description | Selected |
|--------|-------------|----------|
| Time-boxed fix attempt | ~15min effort per test. Fix if covers current intended behavior; delete if covers removed/changed behavior or fix requires re-designing the test. | ✓ |
| Behavior-first rule | If behavior still exists and is correct → must fix (no time box). Stricter, slower, higher coverage. | |
| Delete-first, re-add later | Delete any red test immediately; phases 107–110 re-add coverage via TEST-01/02/03. Fastest, loses history. | |

**User's choice:** Time-boxed fix attempt (Recommended)
**Notes:** Mature-team approach — prevents rabbit-holing on tests covering removed features.

### Q2: How should deletions be documented to satisfy success criterion #4?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-commit in message body | Each deletion commit lists files + one-line justification per file in the body. No separate artifact. | ✓ |
| Running log in 106-DELETIONS.md | Append to a phase-level doc as deletions happen. More auditable, extra file. | |
| Both | Log file AND commit detail. Max traceability, most overhead. | |

**User's choice:** Per-commit in message body (Recommended)
**Notes:** Matches criterion #4 literally; keeps audit trail in git.

---

## Flaky Test Handling

### Q3: How should intermittent/flaky Playwright specs be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Reproduce 3x, then fix or delete | Run failing specs 3x consecutively. If passes 3/3 on re-run, flake — investigate briefly, fix or delete. No retries band-aid. | ✓ |
| Enable Playwright retries=1 baseline | Accept 1 auto-retry project-wide. Tests failing twice are broken. Hides real races. | |
| Quarantine tag for known-flaky | Add @flaky tag, exclude from baseline. Preserves tests, creates parking lot. | |

**User's choice:** Reproduce 3x, then fix or delete (Recommended)

### Q4: Does a flaky test count as "broken" for this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — flaky = broken | Whole point is signal trust. Sometimes-fails destroys signal as much as always-fails. In scope. | ✓ |
| No — only consistent failures in scope | Tighter scope, weaker signal. | |

**User's choice:** Yes — flaky = broken (Recommended)

---

## Baseline Definition & Scope Fence

### Q5: How do we establish the "pre-existing broken" baseline?

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot run committed as 106-BASELINE.md | First task: run all 3 suites once, capture failing/flaky list, commit. That list IS the scope. | ✓ |
| Use git history / last known state | Trust existing e2e-runs.jsonl and current HEAD. Faster, ambiguous. | |
| No baseline — iterate until green | Iteratively fix/delete until clean. Simple but scope balloons. | |

**User's choice:** Snapshot run committed as 106-BASELINE.md (Recommended)

### Q6: What is explicitly OUT of scope? (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Adding NEW test coverage | TEST-01/02/03 handle that in 107–110. 106 only fixes/deletes existing. | ✓ |
| Refactoring test infrastructure | No rewriting fixtures/utils/CI config. Only touch the broken tests. | |
| Fixing product bugs revealed by tests | Record as follow-up; do not fix product in this phase. | ✓ |

**User's choice:** Adding NEW test coverage + Fixing product bugs revealed by tests
**Notes:** Test infra refactoring NOT excluded — allowed when minimal and necessary to fix a specific in-scope test (captured as D-09).

---

## Skips + Exit Gate

### Q7: What rule applies to surviving skipped/xfail tests?

| Option | Description | Selected |
|--------|-------------|----------|
| Justification comment + reason code | Every remaining .skip/.fixme/pytest.mark.skip must have an inline comment explaining why. No justification = delete or fix. | ✓ |
| Zero skips allowed | All skips removed — fix or delete. Strictest. | |
| Linked issue required | Every skip links to a GitHub issue. Higher overhead, tracked backlog. | |

**User's choice:** Justification comment + reason code (Recommended)

### Q8: What does "clean" mean for the exit gate (criteria 1–3)?

| Option | Description | Selected |
|--------|-------------|----------|
| Zero unjustified fails, zero unjustified skips | All 3 suites exit 0. Remaining skips have justification comments. Two consecutive clean Playwright runs required. | ✓ |
| Single clean run per suite | One green run is enough. Faster, less confidence. | |
| Clean in CI, not just locally | Must be green in GitHub Actions. Highest bar. | |

**User's choice:** Zero unjustified fails, zero unjustified skips (Recommended)

---

## Claude's Discretion

- Order of suite triage (suggested: pytest → vitest → Playwright).
- Mechanical flake detection during baseline capture.
- `106-BASELINE.md` exact format.
- Whether unresolved product bugs become `.planning/todos/pending/` entries or inline notes.

## Deferred Ideas

- Playwright `retries` config as project baseline.
- Quarantine tag for flaky specs.
- CI-level green-bar as exit gate.
- GitHub-issue-per-skip tracking.
- Product bug fixes surfaced by failing tests (→ phases 107–110).
