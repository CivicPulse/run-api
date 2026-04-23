---
plan_id: 112-04
phase: 112-seed-002-continuous-verification
plan: 04
type: infra
wave: 1
depends_on: []
requirements: [TEST-01, TEST-02]
files_modified:
  - scripts/doctor.sh
  - scripts/test/doctor.bats
  - scripts/test/fixtures/env.drift-db-port.env
  - scripts/test/fixtures/env.clean.env
estimated_lines: 200
autonomous: true
must_haves:
  truths:
    - "Running `scripts/doctor.sh` on a healthy dev environment exits 0 with a summary of checks."
    - "Running it with `.env` DB port not matching `docker compose port db 5432` exits non-zero and prints a single-line remediation mentioning the mismatched values."
    - "Running it when E2E users are missing in the DB exits non-zero and points at the fix command."
    - "Running it when `alembic heads` doesn't match the migration directory tip exits non-zero with remediation."
    - "Running it when a dep is in `pyproject.toml` but missing from the running image (or vice versa) exits non-zero."
  artifacts:
    - path: "scripts/doctor.sh"
      provides: "env-drift healthcheck; one-line remediation per failure"
      min_lines: 80
    - path: "scripts/test/doctor.bats"
      provides: "bats-core tests exercising each drift path via env overrides + mocks"
  key_links:
    - from: "scripts/bootstrap-dev.sh"
      to: "scripts/doctor.sh"
      via: "tail-step invocation (Plan 01)"
      pattern: "scripts/doctor.sh"
    - from: ".github/workflows/pr.yml"
      to: "scripts/doctor.sh"
      via: "step-1 fail-fast guard in every job (Plan 02)"
      pattern: "scripts/doctor.sh"
    - from: ".github/workflows/nightly.yml"
      to: "scripts/doctor.sh"
      via: "step-1 fail-fast guard in nightly job (Plan 02)"
      pattern: "scripts/doctor.sh"
---

<objective>
Author `scripts/doctor.sh`, the env-drift healthcheck that catches the exact drift classes that produced v1.18 Phase 106's 219 silent failures. Covers (per CONTEXT.md locked research defaults): `.env` DB port vs `docker compose port db 5432`, E2E users presence, `pyproject.toml` ↔ running-image dep skew, `alembic heads` vs migration directory head. Each failure prints a one-line remediation. Called as the tail step of `bootstrap-dev.sh` (Plan 01) and as the first step of every CI workflow (Plan 02). Ships with bats-core tests that exercise every drift class using env overrides + mocked CLI output.

Purpose: Fail fast on env drift rather than discovering it through cascading test failures hours later (ARCHITECTURE.md Q8 + ROADMAP success criterion 4).
Output: Bash script + bats test suite + fixture env files.
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
@docker-compose.yml
@pyproject.toml
@scripts/bootstrap-dev.sh
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: doctor.sh skeleton — check framework + DB-port + alembic-head checks</name>
  <files>scripts/doctor.sh, scripts/test/doctor.bats, scripts/test/fixtures/env.clean.env, scripts/test/fixtures/env.drift-db-port.env</files>
  <behavior>
    - `doctor.sh` defines a small check-framework: `check <name> <command>` that prints `▸ name... PASS/FAIL` and accumulates failures.
    - Check 1: `.env` DB port matches `docker compose port db 5432` output (when compose is up). If compose is down, check is SKIP (not FAIL) — CI bootstraps compose first.
    - Check 2: `alembic heads` output (single head) matches the last revision id found in `alembic/versions/`. When alembic unavailable, SKIP.
    - Accepts `--env-file PATH` override for testing.
    - On any FAIL: exits non-zero with a bracketed summary at the end; each failure line is `✖ <name>: <one-line remediation>`.
    - On all PASS/SKIP: exits 0 with `✓ All checks passed (N skipped)`.
    - bats tests use the two fixture .env files + mock `docker` and `alembic` via PATH stubs (`scripts/test/stubs/`).
  </behavior>
  <action>
    Create `scripts/doctor.sh` with the check-framework sketch above. Implement:
      - Check 1 (DB port): parse `DATABASE_URL` or `DB_PORT` from `--env-file`; run `docker compose port db 5432` (timeout 3s). Compare host-ports. Remediation: "update .env DB port to match compose (run: docker compose port db 5432)".
      - Check 2 (alembic head): compare `uv run alembic heads` (single head hash expected) to the `version_num` value stored in the `alembic_version` DB table via `docker compose exec -T db psql -U app -d civicpulse_dev -tAc "select version_num from alembic_version"` (reuses same psql pattern as Check 3). Mismatch → FAIL with remediation "run `uv run alembic upgrade head`". If either side unavailable → SKIP. Do NOT use file-mtime or `down_revision = None` heuristics (unreliable — see commit 5b8eec04 fix for column-width bug).
    Create `scripts/test/fixtures/env.clean.env` (DB_PORT=5433 matching compose) and `env.drift-db-port.env` (DB_PORT=9999). Create PATH stubs for `docker` and `alembic` under `scripts/test/stubs/` that emit deterministic output.
    Create `scripts/test/doctor.bats` with cases:
      - `clean env exits 0` (uses stubs returning 5433 and matching alembic head)
      - `db-port drift exits non-zero with remediation` (stub returns 5433, .env says 9999)
      - `alembic head drift exits non-zero` (stub returns a head hash that doesn't exist in fixture versions dir)
  </action>
  <verify>
    <automated>cd scripts/test && PATH="$PWD/stubs:$PATH" bats doctor.bats</automated>
  </verify>
  <done>
    `scripts/doctor.sh` executable; runs check-framework with checks 1+2; bats tests for clean + db-port drift + alembic drift all pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: E2E users check + pyproject↔image dep-skew check + bootstrap/CI wiring verification</name>
  <files>scripts/doctor.sh, scripts/test/doctor.bats</files>
  <behavior>
    - Check 3 (E2E users): queries the DB for known E2E usernames (owner1@localhost, admin1@localhost, volunteer1@localhost) via `docker compose exec -T db psql ...` OR a simple `nc`-based connectivity probe that falls through to SKIP when DB is unreachable. Missing users → FAIL with remediation `docker compose exec api bash -c "PYTHONPATH=/home/app python scripts/create-e2e-users.py"` (preserved for v1.19 compatibility; rewritten in Phase 113).
    - Check 4 (dep skew): compares `uv pip list` inside the running api container against `pyproject.toml` `[project.dependencies]`. Drift → FAIL with remediation `docker compose build api && docker compose up -d api`.
    - bats test exercises missing-users path (stub psql returns 0 rows) and dep-skew path (stub returns a mismatched package list).
    - All four checks run unconditionally; script accumulates failures rather than short-circuiting so the operator sees every issue in one pass.
  </behavior>
  <action>
    Add checks 3 and 4 to `scripts/doctor.sh`. For check 3, use `docker compose exec -T -e PGPASSWORD=... db psql -U postgres -d civicpulse -tAc "select count(*) from users where email in (...)"` via a helper function; SKIP when compose unreachable.
    For check 4, helper `image_has_pkg <name> <version>` running `docker compose exec -T api uv pip show <name>`; compare result to pinned version from pyproject.
    Extend stubs to emulate psql + docker-compose-exec output for bats.
    Add bats cases: `missing e2e users → FAIL remediation present`, `dep skew → FAIL remediation present`, `all four checks PASS → exit 0 with summary line`.
    Confirm `scripts/bootstrap-dev.sh` tail (from Plan 01) invokes this script — add bats test that greps bootstrap-dev.sh for `scripts/doctor.sh`.
  </action>
  <verify>
    <automated>cd scripts/test && PATH="$PWD/stubs:$PATH" bats doctor.bats</automated>
  </verify>
  <done>
    All four checks implemented; bats suite covers clean + each drift class + bootstrap integration; executable bit set; script ≤200 lines with readable check-framework.
  </done>
</task>

</tasks>

<verification>
  - `chmod +x scripts/doctor.sh`.
  - Local manual run: `./scripts/doctor.sh` with `docker compose up -d` prints four PASS lines and exits 0.
  - `./scripts/doctor.sh --env-file scripts/test/fixtures/env.drift-db-port.env` exits non-zero with remediation line.
  - `cd scripts/test && PATH="$PWD/stubs:$PATH" bats doctor.bats` — all cases green.
</verification>

<success_criteria>
  ROADMAP success criterion 4: `scripts/doctor.sh` exits non-zero on known env drift with human-readable one-line remediation; invoked as CI first step (Plan 02) and bootstrap tail (Plan 01).
</success_criteria>

<output>
  After completion, create `.planning/phases/112-seed-002-continuous-verification/112-04-SUMMARY.md`.
</output>
