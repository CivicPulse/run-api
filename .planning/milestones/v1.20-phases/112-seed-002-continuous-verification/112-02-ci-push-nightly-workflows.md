---
plan_id: 112-02
phase: 112-seed-002-continuous-verification
plan: 02
type: infra
wave: 2
depends_on: [112-03, 112-04]
requirements: [TEST-02, TEST-03]
files_modified:
  - .github/workflows/pr.yml
  - .github/workflows/nightly.yml
  - .github/workflows/README.md
estimated_lines: 190
autonomous: true
must_haves:
  truths:
    - "Pushing a commit that breaks pytest or vitest to any feature branch produces a red GitHub Actions check within 10 min, independent of PR state."
    - "A scheduled workflow runs pytest + vitest + full Playwright on `main` at ~02:00 UTC nightly."
    - "On nightly regression (non-zero exit from analyzer OR test failures), a GitHub issue is auto-created and auto-assigned to the last committer."
    - "Every CI workflow invokes scripts/doctor.sh as its first step and fails fast on env drift."
  artifacts:
    - path: ".github/workflows/pr.yml"
      provides: "push trigger for feature branches + pull_request trigger; lint + unit subset"
      contains: "on:"
    - path: ".github/workflows/nightly.yml"
      provides: "scheduled nightly full suite + regression-issue creation via gh"
      contains: "schedule:"
    - path: ".github/workflows/README.md"
      provides: "operator doc for workflow layout, triggers, alert routing"
  key_links:
    - from: ".github/workflows/pr.yml"
      to: "scripts/doctor.sh"
      via: "first step in every job"
      pattern: "scripts/doctor.sh"
    - from: ".github/workflows/nightly.yml"
      to: "web/scripts/run-e2e.sh"
      via: "nightly E2E invocation (JSONL-logging wrapper)"
      pattern: "run-e2e.sh"
    - from: ".github/workflows/nightly.yml"
      to: "web/scripts/analyze-e2e-trend.sh"
      via: "post-E2E regression trend step (Plan 03 deliverable)"
      pattern: "analyze-e2e-trend.sh"
    - from: ".github/workflows/nightly.yml"
      to: "gh issue create"
      via: "regression alert routing (D2: GitHub issue only, no Slack)"
      pattern: "gh issue create"
---

<objective>
Build layer-2 (push CI) and layer-3 (nightly) of the continuous-verification stack. Modify `.github/workflows/pr.yml` to also trigger on `push:` for feature branches (not just PR events) so regressions surface within 10 min (TEST-02). Create `.github/workflows/nightly.yml` that runs the full pytest + vitest + Playwright (via `web/scripts/run-e2e.sh`) on `main` at 02:00 UTC, invokes the trend analyzer (Plan 03), and auto-opens a GitHub issue on regression (D2). Both workflows invoke `scripts/doctor.sh` (Plan 04) as their first step (ARCHITECTURE.md Q8).

Purpose: Layer-2 and layer-3 of the three-layer net — catches drift the pre-commit hook cannot (full suites, long-running E2E).
Output: Modified `pr.yml`, new `nightly.yml`, workflow README documenting triggers + alert routing.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/112-seed-002-continuous-verification/112-CONTEXT.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/research/SUMMARY.md
@.github/workflows/pr.yml
@web/scripts/run-e2e.sh
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add push trigger to pr.yml + doctor-first-step to all jobs</name>
  <files>.github/workflows/pr.yml</files>
  <behavior>
    - Test: `on:` block contains both `pull_request:` and `push:` keys.
    - Test: `push:` lists branches `['**']` with `paths-ignore` for `['**.md', 'docs/**', '.planning/**']` (doc-only changes skip).
    - Test: every job's `steps[0]` is `name: "Env-drift doctor"` running `./scripts/doctor.sh`.
    - Test: pytest job uses `uv run pytest` (never bare `python`/`pytest`) per project convention.
  </behavior>
  <action>
    Edit existing `.github/workflows/pr.yml`:
      - Merge a `push:` trigger alongside the current `pull_request:` trigger. Use `branches: ['**']` with `paths-ignore: ['**.md', 'docs/**', '.planning/**']` so pure-docs commits don't consume billable minutes.
      - Inject `- name: Env-drift doctor\n  run: ./scripts/doctor.sh` as the FIRST step of every job (after `checkout` + setup). Doctor.sh ships in Plan 04; fail-fast is the intent.
      - Confirm pytest step uses `uv run pytest` and vitest step uses `cd web && npm run test -- --run`.
      - Keep the workflow lean: lint (ruff + prettier --check), unit pytest, vitest. NO Playwright here — that lives in nightly.yml (D3).
  </action>
  <verify>
    <automated>uv run python -c "import yaml; w=yaml.safe_load(open('.github/workflows/pr.yml')); assert 'push' in w['on'] and 'pull_request' in w['on']; assert all(j['steps'][0]['name']=='Env-drift doctor' for j in w['jobs'].values())"</automated>
  </verify>
  <done>
    `pr.yml` triggers on both push and PR; doctor.sh is step 1 of every job; doc-only pushes are skipped via paths-ignore.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create nightly.yml — full suite + Playwright + regression-issue alert</name>
  <files>.github/workflows/nightly.yml, .github/workflows/README.md</files>
  <behavior>
    - Test: `on.schedule[0].cron` equals `"0 2 * * *"` (02:00 UTC) and `on.workflow_dispatch:` is present for manual triggers.
    - Test: job runs on `ubuntu-latest`, checks out `main` explicitly (`ref: main`).
    - Test: steps include in order: doctor.sh → `uv run pytest` → `cd web && npm run test -- --run` → `web/scripts/run-e2e.sh` → `web/scripts/analyze-e2e-trend.sh`.
    - Test: regression step runs `if: failure()` and uses `gh issue create --assignee "${{ github.event.head_commit.author.username || github.actor }}" --label "nightly-regression,auth-milestone"` with title format `[nightly-regression] YYYY-MM-DD — ...` (D2).
    - Test: analyzer step uploads `web/e2e-runs.jsonl` as a workflow artifact (for commit-attribution, TEST-03).
  </behavior>
  <action>
    Create `.github/workflows/nightly.yml`. Structure:
      - Triggers: `schedule: - cron: '0 2 * * *'` + `workflow_dispatch:`.
      - Single `nightly` job on `ubuntu-latest`, `timeout-minutes: 90` (30-40 min runtime expected per D3, with buffer).
      - Steps:
        1. `checkout` (ref: main, fetch-depth: 0 — trend analyzer needs history).
        2. Env-drift doctor — `./scripts/doctor.sh` (fail-fast).
        3. Python/uv setup (use standard action; run `uv sync`).
        4. Node setup (use actions/setup-node@v4, cache npm; `cd web && npm ci`).
        5. `uv run pytest` — full suite.
        6. `cd web && npm run test -- --run` — vitest full.
        7. Docker compose up for E2E deps (matching run-e2e.sh expectations).
        8. `cd web && ./scripts/run-e2e.sh` — full Playwright (logs to e2e-runs.jsonl).
        9. `./web/scripts/analyze-e2e-trend.sh` — regression trend check (Plan 03).
        10. `if: always()` — upload `web/e2e-runs.jsonl` as artifact.
        11. `if: failure()` — `gh issue create` with body-file summary (title, labels, assignee per D2). Use `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
      - NO Slack/PagerDuty wiring — D2 explicitly defers these.

    Create `.github/workflows/README.md` (≤60 lines) documenting:
      - pr.yml: push + PR triggers, lint + unit subset, ~5 min budget, layer-2 drift catcher.
      - nightly.yml: scheduled 02:00 UTC on main, full suite incl. Playwright, ~30-40 min, regression → GitHub issue (no Slack per D2).
      - Cross-link to `scripts/doctor.sh` (first step) and `web/scripts/run-e2e.sh` (JSONL logger).
  </action>
  <verify>
    <automated>uv run python -c "import yaml; w=yaml.safe_load(open('.github/workflows/nightly.yml')); assert w['on']['schedule'][0]['cron']=='0 2 * * *'; steps=[s.get('name','') for s in w['jobs']['nightly']['steps']]; assert any('doctor' in s.lower() for s in steps); assert any('run-e2e' in s.lower() or 'e2e' in s.lower() for s in steps); assert any('analyze-e2e-trend' in s.lower() for s in steps)"</automated>
  </verify>
  <done>
    `nightly.yml` scheduled at 02:00 UTC, executes doctor → pytest → vitest → run-e2e.sh → analyze-e2e-trend.sh; regression opens GitHub issue (no Slack); README.md documents workflow layout.
  </done>
</task>

</tasks>

<verification>
  - `uv run python -m yaml .github/workflows/pr.yml .github/workflows/nightly.yml` parses both (via the inline python checks above).
  - `gh workflow list` (locally) shows both workflows after push.
  - Manual `gh workflow run nightly.yml` succeeds on a clean main.
  - Regression path tested in Plan 06 (self-coverage) with mocked failures.
</verification>

<success_criteria>
  ROADMAP success criteria 2 + 3: push breaks pytest/vitest → red check <10 min; Monday regression surfaces in Tuesday nightly summary appended to `web/e2e-runs.jsonl`, attributable to the introducing commit via nightly workflow artifact.
</success_criteria>

<output>
  After completion, create `.planning/phases/112-seed-002-continuous-verification/112-02-SUMMARY.md`.
</output>
