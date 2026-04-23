---
plan_id: 112-01
phase: 112-seed-002-continuous-verification
plan: 01
type: infra
wave: 1
depends_on: []
requirements: [TEST-01]
files_modified:
  - .pre-commit-config.yaml
  - web/package.json
  - web/package-lock.json
  - scripts/bootstrap-dev.sh
  - pyproject.toml
  - tests/unit/test_precommit_config.py
estimated_lines: 180
autonomous: true
must_haves:
  truths:
    - "Running `git commit` on a branch introducing a ruff violation exits non-zero in <5s citing file and rule."
    - "Running `git commit` with staged TS/TSX/JSON/MD drift from prettier exits non-zero citing the file."
    - "A fresh clone that runs `scripts/bootstrap-dev.sh` has pre-commit hooks and husky installed without operator intervention."
    - "A naive-datetime use (`datetime.utcnow()`, `datetime.now()` without tz) is rejected by ruff DTZ rules at commit time."
  artifacts:
    - path: ".pre-commit-config.yaml"
      provides: "pre-commit hook definitions (ruff, prettier, uv lock --check, lint-staged entry)"
      contains: "ruff"
    - path: "web/package.json"
      provides: "husky ^9.1.7 + lint-staged ^16.4.0 dev deps + lint-staged config"
      contains: "husky"
    - path: "scripts/bootstrap-dev.sh"
      provides: "appends pre-commit install + npm install + doctor.sh invocation"
      contains: "pre-commit install"
    - path: "tests/unit/test_precommit_config.py"
      provides: "unit test asserting config contents + smoke test deliberately introducing a ruff violation and asserting hook exit"
  key_links:
    - from: ".pre-commit-config.yaml"
      to: "pyproject.toml"
      via: "ruff select rules include DTZ"
      pattern: "DTZ"
    - from: "web/package.json"
      to: ".husky/pre-commit"
      via: "husky install on npm install triggers hook file creation"
      pattern: "husky"
    - from: "scripts/bootstrap-dev.sh"
      to: ".pre-commit-config.yaml"
      via: "runs `pre-commit install` after the compose stack is up"
      pattern: "pre-commit install"
---

<objective>
Wire the pre-commit safety net (layer 1 of three — ARCHITECTURE.md Q8) so every `git commit` runs ruff (with DTZ for SEC-05 naive-datetime invariant), prettier on staged web files, `uv lock --check`, and `lint-staged`-driven `vitest related --run` on staged TS, under a strict <5s budget. Install the hooks automatically from `bootstrap-dev.sh` so fresh clones inherit the safety net without opt-in (PITFALLS CV3).

Purpose: Layer-1 drift catcher per D1; prevents the v1.18 Phase 106 219-silent-failure pattern from repeating during the v1.20 auth rewrite.
Output: Repo-root `.pre-commit-config.yaml`, husky + lint-staged wiring in `web/`, bootstrap-dev.sh augmented with hook install + doctor.sh call, unit-test smoke asserting hook rejects a deliberate ruff violation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/112-seed-002-continuous-verification/112-CONTEXT.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/research/SUMMARY.md
@scripts/bootstrap-dev.sh
@pyproject.toml
@web/package.json
@tests/unit/test_no_naive_datetime.py
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author .pre-commit-config.yaml + extend ruff DTZ in pyproject</name>
  <files>.pre-commit-config.yaml, pyproject.toml</files>
  <behavior>
    - Test: config file parses as valid YAML.
    - Test: declares hooks for ruff (check+format), prettier (TS/TSX/JSON/MD), `uv lock --check`, and a `lint-staged` local hook invoking `cd web && npx lint-staged`.
    - Test: ruff `select` set in pyproject includes `DTZ` (per D1 and SEC-05).
    - Test: each hook has explicit `files:` / `types_or:` scoping so diffs stay small (<5s budget).
  </behavior>
  <action>
    Create `.pre-commit-config.yaml` at repo root using pre-commit >=4.6.0 schema. Include:
      (a) `ruff-pre-commit` v0.8.x pinned minor — `ruff-check --fix` + `ruff-format`.
      (b) `mirrors-prettier` v3.8.x — `prettier --check` on `^web/.*\.(ts|tsx|json|md)$`.
      (c) local hook `uv-lock-check` running `uv lock --check` (per STACK.md; use `uv lock --locked` fallback if `--check` unavailable).
      (d) local hook `lint-staged` running `bash -c 'cd web && npx lint-staged'`, `stages: [commit]`.
    Extend `pyproject.toml` `[tool.ruff.lint] select` to include `DTZ` (keep existing E, F, I, N, UP, B, SIM, ASYNC, ignore B008). Line-length stays 88.
    Keep every hook's scope narrow — prefer `types_or` to avoid scanning the full tree; target <5s on a 2-file diff (CV3).
  </action>
  <verify>
    <automated>uv run pre-commit run --all-files --config .pre-commit-config.yaml</automated>
  </verify>
  <done>
    `.pre-commit-config.yaml` exists and parses; `pyproject.toml` ruff lint select contains `DTZ`; `uv run ruff check .` still passes on the current tree (or produces only DTZ findings that are fixed in this task).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Husky + lint-staged in web/ + bootstrap-dev.sh wiring</name>
  <files>web/package.json, web/package-lock.json, scripts/bootstrap-dev.sh, tests/unit/test_precommit_config.py</files>
  <behavior>
    - Test: `web/package.json` declares `"husky": "^9.1.7"` and `"lint-staged": "^16.4.0"` in `devDependencies`.
    - Test: `web/package.json` has a `lint-staged` block mapping `*.{ts,tsx}` → `vitest related --run` and `*.{ts,tsx,json,md}` → `prettier --check`.
    - Test: `package.json` `scripts.prepare` is `husky` (v9 style; no `husky install`).
    - Test: `scripts/bootstrap-dev.sh` tail invokes `pre-commit install`, `cd web && npm install`, and `scripts/doctor.sh` in that order.
    - Smoke test: write a temp Python file containing `x = 1 ; y=2` (ruff format violation) and assert `pre-commit run --files <tmp>` exits non-zero within 5s.
  </behavior>
  <action>
    In `web/`, run `npm install --save-dev husky@^9.1.7 lint-staged@^16.4.0` (captures package-lock.json changes). Add the `lint-staged` config block and the `prepare: "husky"` script. Do NOT create a `.husky/pre-commit` file by hand — bootstrap-dev.sh will trigger `npm install`, which runs `prepare`, which initializes husky.

    Edit `scripts/bootstrap-dev.sh`: after the existing compose-up and cert work, append a final block:
      `echo "▸ Installing pre-commit hooks..."; uv run pre-commit install`
      `echo "▸ Installing web dev deps (husky auto-installs)..."; (cd web && npm install)`
      `echo "▸ Running env-drift doctor..."; scripts/doctor.sh`
    Each wrapped in a single-line `|| echo "⚠ ..."` so bootstrap doesn't hard-fail if doctor.sh is missing in this plan (Plan 04 ships it).

    Create `tests/unit/test_precommit_config.py` with pytest cases asserting: (a) YAML parses, (b) expected hooks present, (c) ruff select includes DTZ, (d) bootstrap-dev.sh tail contains the three install lines, (e) the 5-second smoke test on a deliberately-broken file.
  </action>
  <verify>
    <automated>uv run pytest tests/unit/test_precommit_config.py -x</automated>
  </verify>
  <done>
    `web/package.json` declares husky + lint-staged deps; `scripts/bootstrap-dev.sh` runs pre-commit install, npm install, and doctor.sh at the tail; unit test passes including the <5s ruff rejection smoke.
  </done>
</task>

</tasks>

<verification>
  - `uv run pre-commit run --all-files` exits 0 on a clean tree.
  - `uv run pre-commit run --files <deliberate_dtz_violation>.py` exits non-zero citing the DTZ rule.
  - `cd web && npx lint-staged --help` runs (dep installed).
  - `bash -n scripts/bootstrap-dev.sh` parses clean; tail contains the three new lines.
  - `uv run pytest tests/unit/test_precommit_config.py` passes.
</verification>

<success_criteria>
  Pre-commit hook rejects ruff/prettier drift in <5s citing file + rule (ROADMAP success criterion 1). Hooks installed automatically by bootstrap-dev.sh. Datetime-naive AST backstop ships as DTZ ruff rule + existing `tests/unit/test_no_naive_datetime.py` invariant.
</success_criteria>

<output>
  After completion, create `.planning/phases/112-seed-002-continuous-verification/112-01-SUMMARY.md` per template.
</output>
