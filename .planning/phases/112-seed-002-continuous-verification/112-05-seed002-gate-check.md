---
plan_id: 112-05
phase: 112-seed-002-continuous-verification
plan: 05
type: infra
wave: 3
depends_on: [112-02]
requirements: [TEST-04]
files_modified:
  - scripts/seed002-gate-check.sh
  - scripts/test/seed002-gate-check.bats
  - scripts/test/fixtures/gh-run-list.both-green.json
  - scripts/test/fixtures/gh-run-list.nightly-red.json
  - scripts/test/fixtures/gh-run-list.pr-red.json
  - scripts/test/fixtures/e2e-runs.gate-green.jsonl
  - scripts/test/fixtures/e2e-runs.gate-red.jsonl
estimated_lines: 160
autonomous: true
must_haves:
  truths:
    - "`scripts/seed002-gate-check.sh` exits 0 only when the last two runs of nightly.yml AND the last two runs of pr.yml on main are both `success` AND the last two `web/e2e-runs.jsonl` entries are both `pass` with zero unquarantined skips."
    - "On any failing gate, the script exits non-zero and prints the specific gate that failed plus a link to the failing run."
    - "Quarantine allowlist is an empty set at Phase 112 exit (per CONTEXT.md Deferred Ideas)."
    - "The script can be invoked by future `/gsd-plan-phase` pre-planning checks (D4 advisory)."
  artifacts:
    - path: "scripts/seed002-gate-check.sh"
      provides: "canonical are-we-safe-to-proceed gate script"
      min_lines: 70
    - path: "scripts/test/seed002-gate-check.bats"
      provides: "bats suite exercising all-green, nightly-red, pr-red, jsonl-red cases"
  key_links:
    - from: "scripts/seed002-gate-check.sh"
      to: "gh run list"
      via: "queries workflow conclusions via gh CLI"
      pattern: "gh run list"
    - from: "scripts/seed002-gate-check.sh"
      to: "web/e2e-runs.jsonl"
      via: "reads tail-2 entries to confirm E2E green"
      pattern: "e2e-runs.jsonl"
---

<objective>
Ship the canonical phase-exit gate script per D4. `scripts/seed002-gate-check.sh` answers "are we safe to begin Phase 113?" by checking (a) last two nightly.yml runs on main are green, (b) last two pr.yml runs on main are green, (c) last two `web/e2e-runs.jsonl` entries are `pass` with zero unquarantined skips. Advisory-only: operator override is explicit, not implicit (no hard block, per D4). Every subsequent v1.20 `/gsd-plan-phase` invocation cites this script's output verbatim in PLAN.md.

Purpose: Make TEST-04 ("pytest + vitest + Playwright green on two consecutive runs") a single callable check rather than an ad-hoc reading of CI dashboards.
Output: Bash script + bats suite + fixture JSON/JSONL files mocking gh and run-e2e output.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/112-seed-002-continuous-verification/112-CONTEXT.md
@.planning/research/SUMMARY.md
@.github/workflows/nightly.yml
@.github/workflows/pr.yml
@web/scripts/run-e2e.sh
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixtures + failing bats tests (RED)</name>
  <files>scripts/test/seed002-gate-check.bats, scripts/test/fixtures/gh-run-list.both-green.json, scripts/test/fixtures/gh-run-list.nightly-red.json, scripts/test/fixtures/gh-run-list.pr-red.json, scripts/test/fixtures/e2e-runs.gate-green.jsonl, scripts/test/fixtures/e2e-runs.gate-red.jsonl</files>
  <behavior>
    - both-green.json: array of 2 entries, each `{"conclusion":"success", "createdAt":"...", "url":"..."}`.
    - nightly-red.json: last nightly run `conclusion: "failure"`.
    - pr-red.json: last pr.yml run `conclusion: "failure"`.
    - gate-green.jsonl: 2 entries with pass >0, fail=0, skip=0, exit_code=0.
    - gate-red.jsonl: second-to-last entry has fail=3.
    - bats cases assert all four permutations exit accordingly.
  </behavior>
  <action>
    Build fixture JSON (matches `gh run list --json conclusion,createdAt,url` shape). Build fixture JSONL (matches run-e2e.sh's line schema — see Plan 03 interfaces).
    Create `scripts/test/seed002-gate-check.bats` with cases:
      - all-green → exit 0, output contains `GATE: GREEN`
      - nightly-red → exit non-zero, output cites `nightly.yml` and the failing run URL
      - pr-red → exit non-zero, output cites `pr.yml`
      - jsonl-red → exit non-zero, output cites `e2e-runs.jsonl`
      - quarantine allowlist is empty at Phase 112 (grep asserts the `QUARANTINE_ALLOWLIST=()` line in the script)
    Use PATH stubs for `gh` that `cat` the relevant fixture and accept arbitrary args. `--jsonl PATH` override for the JSONL input path.
    Tests MUST fail because the script doesn't exist yet.
  </action>
  <verify>
    <automated>cd scripts/test && PATH="$PWD/stubs:$PATH" bats seed002-gate-check.bats; test $? -ne 0</automated>
  </verify>
  <done>
    Five fixtures exist; bats suite fails because `scripts/seed002-gate-check.sh` is absent.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement seed002-gate-check.sh (GREEN)</name>
  <files>scripts/seed002-gate-check.sh</files>
  <behavior>
    - `set -euo pipefail`; defines `QUARANTINE_ALLOWLIST=()` (empty, per CONTEXT.md).
    - Accepts `--jsonl PATH` override; default `web/e2e-runs.jsonl`.
    - Gate 1: `gh run list --branch main --workflow nightly.yml --limit 2 --json conclusion,url` → parse via jq; require both `.conclusion == "success"`.
    - Gate 2: `gh run list --branch main --workflow pr.yml --limit 2 --json conclusion,url` → same check.
    - Gate 3: `tail -n 2 $JSONL | jq -s '.'` → require each entry's `fail == 0`, `exit_code == 0`, and `skip == 0` OR every skipped spec name is in `QUARANTINE_ALLOWLIST` (empty at this phase exit).
    - Prints section headers `=== Gate 1: nightly.yml ===` etc. with PASS/FAIL per gate.
    - Final line: `GATE: GREEN` + exit 0, or `GATE: RED` + list of failing gates + exit 1.
  </behavior>
  <action>
    Author `scripts/seed002-gate-check.sh`. Use jq for parsing both JSON and JSONL. Print URL of any failing run for operator click-through. Make executable. Re-run bats — all cases must pass.
    Add a top-of-file usage comment documenting advisory use: "Invoked by `/gsd-plan-phase N` for N >= 113. Operator may override by adding a justification paragraph to PLAN.md (D4)."
  </action>
  <verify>
    <automated>cd scripts/test && PATH="$PWD/stubs:$PATH" bats seed002-gate-check.bats</automated>
  </verify>
  <done>
    Script exists, executable, passes all bats cases; real invocation `./scripts/seed002-gate-check.sh` runs against live `gh` + JSONL without error (result may be red if nightly hasn't run yet — that's correct behavior).
  </done>
</task>

</tasks>

<verification>
  - `chmod +x scripts/seed002-gate-check.sh`.
  - `cd scripts/test && PATH="$PWD/stubs:$PATH" bats seed002-gate-check.bats` → all green.
  - Manual run with real `gh` (after first nightly completes) produces a sensible GREEN/RED verdict.
  - Plan 06 self-coverage exercises the script as part of its mocked-failure smokes.
</verification>

<success_criteria>
  ROADMAP success criterion 5 / TEST-04: phase-exit gate callable as a single script; future phases cite its output in PLAN.md. Quarantine allowlist remains empty at phase exit (Deferred Idea).
</success_criteria>

<output>
  After completion, create `.planning/phases/112-seed-002-continuous-verification/112-05-SUMMARY.md`.
</output>
