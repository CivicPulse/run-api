---
plan_id: 112-06
phase: 112-seed-002-continuous-verification
plan: 06
type: test
wave: 4
depends_on: [112-01, 112-02, 112-03, 112-04, 112-05]
requirements: [TEST-04]
files_modified:
  - .github/workflows/seed002-self-coverage.yml
  - scripts/test/run-all-smokes.sh
  - .planning/phases/112-seed-002-continuous-verification/112-SUMMARY.md
estimated_lines: 140
autonomous: true
must_haves:
  truths:
    - "A CI workflow `seed002-self-coverage.yml` runs the full bats suite for doctor.sh, analyze-e2e-trend.sh, seed002-gate-check.sh, and the precommit config pytest on every push touching `scripts/**`, `.pre-commit-config.yaml`, or `.github/workflows/**`."
    - "The workflow intentionally introduces a known drift for each script (via env override or fixture path) and asserts the script exits non-zero — proving the 'fail' path is wired and not just 'pass'."
    - "Running `scripts/test/run-all-smokes.sh` locally executes the same suite as CI, giving the operator a single command to verify SEED-002 infra health."
  artifacts:
    - path: ".github/workflows/seed002-self-coverage.yml"
      provides: "CI coverage of the SEED-002 scripts themselves (success criterion 5)"
      contains: "bats"
    - path: "scripts/test/run-all-smokes.sh"
      provides: "one-command local runner for every SEED-002 smoke"
  key_links:
    - from: ".github/workflows/seed002-self-coverage.yml"
      to: "scripts/test/run-all-smokes.sh"
      via: "workflow step invokes the runner"
      pattern: "run-all-smokes.sh"
    - from: "scripts/test/run-all-smokes.sh"
      to: "scripts/test/doctor.bats"
      via: "bats invocation"
      pattern: "doctor.bats"
    - from: "scripts/test/run-all-smokes.sh"
      to: "web/scripts/test/analyze-e2e-trend.bats"
      via: "bats invocation"
      pattern: "analyze-e2e-trend.bats"
    - from: "scripts/test/run-all-smokes.sh"
      to: "scripts/test/seed002-gate-check.bats"
      via: "bats invocation"
      pattern: "seed002-gate-check.bats"
---

<objective>
Close ROADMAP success criterion 5: SEED-002 infrastructure itself has CI coverage. Create a local runner + dedicated GitHub Actions workflow that exercise every script in this phase against known-failure fixtures, asserting non-zero exits and documented remediation output. Produce the phase-level `112-SUMMARY.md` wrapping up deliverables and handing off the gate script for Phase 113 pre-planning.

Purpose: Without self-coverage the safety net is unverified — PITFALLS CV5 ("untested safety nets rot silently") applies to SEED-002 itself as much as to application specs.
Output: `seed002-self-coverage.yml` workflow, `scripts/test/run-all-smokes.sh` runner, phase SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/112-seed-002-continuous-verification/112-CONTEXT.md
@.planning/phases/112-seed-002-continuous-verification/112-01-precommit-husky-bootstrap.md
@.planning/phases/112-seed-002-continuous-verification/112-02-ci-push-nightly-workflows.md
@.planning/phases/112-seed-002-continuous-verification/112-03-analyze-e2e-trend.md
@.planning/phases/112-seed-002-continuous-verification/112-04-doctor-env-drift.md
@.planning/phases/112-seed-002-continuous-verification/112-05-seed002-gate-check.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Local runner scripts/test/run-all-smokes.sh</name>
  <files>scripts/test/run-all-smokes.sh</files>
  <action>
    Author `scripts/test/run-all-smokes.sh`:
      - `set -euo pipefail`.
      - Runs in order:
        1. `uv run pytest tests/unit/test_precommit_config.py -x` (Plan 01).
        2. `cd scripts/test && PATH="$PWD/stubs:$PATH" bats doctor.bats` (Plan 04).
        3. `cd web/scripts/test && bats analyze-e2e-trend.bats` (Plan 03).
        4. `cd scripts/test && PATH="$PWD/stubs:$PATH" bats seed002-gate-check.bats` (Plan 05).
      - Accumulates failures (does NOT short-circuit) so operator sees every broken smoke in one pass.
      - Final line: `▸ Self-coverage: N/4 passed` + exit code = number of failures.
      - Make executable.
  </action>
  <verify>
    <automated>scripts/test/run-all-smokes.sh</automated>
  </verify>
  <done>
    Runner exists, executable, runs all four smoke suites. Exit 0 when every suite green.
  </done>
</task>

<task type="auto">
  <name>Task 2: CI workflow seed002-self-coverage.yml + phase SUMMARY</name>
  <files>.github/workflows/seed002-self-coverage.yml, .planning/phases/112-seed-002-continuous-verification/112-SUMMARY.md</files>
  <action>
    Create `.github/workflows/seed002-self-coverage.yml`:
      - Triggers: `push:` with `paths: ['scripts/**', '.pre-commit-config.yaml', '.github/workflows/**', 'web/scripts/**']` + `pull_request:` same paths + `workflow_dispatch:`.
      - Single job `self-coverage` on `ubuntu-latest`, `timeout-minutes: 15`.
      - Steps:
        1. `checkout`.
        2. Env-drift doctor (`./scripts/doctor.sh`) — must pass on CI runner; if not, the self-coverage workflow itself is compromised.
        3. Install bats-core (`sudo npm install -g bats` or apt package).
        4. uv sync.
        5. `./scripts/test/run-all-smokes.sh`.
      - Explicit negative-path assertion step: `./scripts/doctor.sh --env-file scripts/test/fixtures/env.drift-db-port.env && exit 1 || echo "doctor correctly rejected drift"` — proves the fail-path wiring.
      - Analogous negative-path step for `analyze-e2e-trend.sh` against `e2e-runs.trend-regression.jsonl` (must exit non-zero).
      - Analogous for `seed002-gate-check.sh` with the nightly-red fixture + stubbed `gh`.

    Author `.planning/phases/112-seed-002-continuous-verification/112-SUMMARY.md` (phase-level wrap-up, distinct from per-plan SUMMARYs):
      - List all six plans + their deliverables.
      - Cite `scripts/seed002-gate-check.sh --help` invocation for Phase 113 pre-planning.
      - Record quarantine allowlist = `[]` at phase exit.
      - Document post-phase operator checklist: "run `scripts/test/run-all-smokes.sh` to verify every gate before closing the phase."
  </action>
  <verify>
    <automated>uv run python -c "import yaml; w=yaml.safe_load(open('.github/workflows/seed002-self-coverage.yml')); steps=[s.get('name','') for s in w['jobs']['self-coverage']['steps']]; assert any('run-all-smokes' in s.lower() for s in steps); assert any('doctor' in s.lower() and 'drift' in s.lower() for s in steps)"</automated>
  </verify>
  <done>
    Workflow exists, parses, executes run-all-smokes.sh plus explicit negative-path assertions for each script. Phase SUMMARY lands at `112-SUMMARY.md` and records the gate handoff.
  </done>
</task>

</tasks>

<verification>
  - `scripts/test/run-all-smokes.sh` → exit 0 locally.
  - `gh workflow run seed002-self-coverage.yml` → green on a healthy main.
  - Negative-path steps exit non-zero on the known-drift fixtures, confirming the fail-path is wired (not cosmetic).
  - Phase 113's `/gsd-plan-phase` will successfully invoke `scripts/seed002-gate-check.sh` and cite the output.
</verification>

<success_criteria>
  ROADMAP success criterion 5: SEED-002 infrastructure has CI coverage — pytest + vitest + Playwright green on two consecutive runs is verifiable via a single gate script, and the scripts making that verification possible are themselves self-tested on every change. Phase handoff to 113 is clean: the gate script is callable, the quarantine allowlist is empty, and a local one-command runner exists.
</success_criteria>

<output>
  After completion, create `.planning/phases/112-seed-002-continuous-verification/112-06-SUMMARY.md` (per-plan) AND ensure `112-SUMMARY.md` (phase-level) landed via Task 2.
</output>
