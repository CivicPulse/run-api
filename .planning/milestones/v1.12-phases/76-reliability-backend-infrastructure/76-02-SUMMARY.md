---
phase: 76-reliability-backend-infrastructure
plan: 02
subsystem: config-hygiene
tags: [config, rate-limit, alembic, settings, hygiene]
requires: [76-01]
provides:
  - deduplicated Settings class fields
  - rate limiting ENABLED by default in docker-compose
  - env-var-driven alembic sqlalchemy.url
affects: [app/core/config.py, docker-compose.yml, alembic.ini]
tech-stack:
  added: []
  patterns: ["env-var interpolation via configparser %()s"]
key-files:
  created: []
  modified:
    - app/core/config.py
    - docker-compose.yml
    - alembic.ini
decisions:
  - "Remove first (stale) Settings declarations per plan D-06"
  - "DISABLE_RATE_LIMIT default = false per D-07 (defense-in-depth)"
  - "Alembic interpolation uses %(DATABASE_URL_SYNC)s; missing env var fails loudly (D-08)"
metrics:
  duration: "~6 minutes"
  tasks-completed: 3
  files-modified: 3
  completed: "2026-04-05"
requirements: [REL-06, REL-11]
---

# Phase 76 Plan 02: Config Hygiene Summary

**One-liner:** Deduplicated Settings fields, flipped rate-limit default to ON, and switched alembic.ini to `%(DATABASE_URL_SYNC)s` interpolation — closing H11/H12/H15.

## Overview

Three small but high-impact config fixes:
1. **H11/REL-06:** Eliminated duplicate `trusted_proxy_cidrs` and `rate_limit_unauthenticated` declarations that silently let the second definition win.
2. **H12/REL-06:** Changed docker-compose default for `DISABLE_RATE_LIMIT` from `true` → `false`, making rate limiting the default posture.
3. **H15/REL-11:** Replaced hardcoded localhost DB URL in `alembic.ini` with env-var interpolation; missing env now fails loudly instead of silently connecting to a non-existent localhost DB.

## Task Breakdown

### Task 1: Remove duplicate Settings field declarations (H11)

**Before (`app/core/config.py:43-46`):**
```python
    # Rate limiting
    disable_rate_limit: bool = False
    trusted_proxy_cidrs: list[str] = []
    rate_limit_unauthenticated: str = "30/minute"
```

**After:**
```python
    # Rate limiting (disable flag only; defaults live below)
    disable_rate_limit: bool = False
```

The later declarations at lines 67-93 (Cloudflare CIDR list + `"60/minute"`) are now the only definitions. Removed 2 lines, added 1 comment clarification.

Tests flipped green:
- `test_trusted_proxy_cidrs_default_is_cloudflare_list` ✓
- `test_rate_limit_unauthenticated_default_is_60_per_minute` ✓
- `test_settings_file_has_no_duplicate_trusted_proxy_cidrs_declaration` ✓
- `test_settings_file_has_no_duplicate_rate_limit_declaration` ✓

**Commit:** `00dee4b`

### Task 2: DISABLE_RATE_LIMIT default = false (H12)

**Before (`docker-compose.yml:25`):**
```yaml
      DISABLE_RATE_LIMIT: ${DISABLE_RATE_LIMIT:-true}
```

**After:**
```yaml
      DISABLE_RATE_LIMIT: ${DISABLE_RATE_LIMIT:-false}  # Rate limiting ENABLED by default per REL-06; opt out via env var
```

`docker compose config` validates cleanly. Developers who need to disable rate limiting during local testing can still do so via `DISABLE_RATE_LIMIT=true docker compose up`.

**Commit:** `0b4a96e`

### Task 3: alembic.ini env-var interpolation (H15)

**Before (`alembic.ini:5`):**
```ini
sqlalchemy.url = postgresql+psycopg2://postgres:postgres@localhost:5432/run_api
```

**After:**
```ini
sqlalchemy.url = %(DATABASE_URL_SYNC)s
```

`alembic/env.py` already overrides the option via `config.set_main_option("sqlalchemy.url", ...)` when `DATABASE_URL_SYNC` is set, so the interpolation token is only consulted when the env var is missing — in which case configparser raises `InterpolationMissingOptionError` (the desired loud failure).

Verified:
- With env var set: `uv run alembic current` loads config and attempts DB connection (no interpolation error).
- Without env var: `uv run alembic current` raises `configparser.InterpolationMissingOptionError` — loud, immediate, cannot silently point at a wrong DB.

Tests flipped green:
- `test_alembic_ini_uses_database_url_sync_interpolation` ✓
- `test_alembic_ini_does_not_hardcode_local_postgres_url` ✓

**Commit:** `892bbc3`

## Deviations from Plan

None — plan executed exactly as written. The plan's speculative note about needing to add `config.set_main_option("DATABASE_URL_SYNC", ...)` in env.py turned out to be unnecessary: env.py already sets the `sqlalchemy.url` option directly (line 26), so the `%()s` interpolation is bypassed whenever the env var is present.

## Verification Results

```
$ uv run pytest tests/unit/test_settings_dedup.py tests/unit/test_alembic_ini_interpolation.py -x
6 passed, 1 warning in 0.03s

$ uv run ruff check app/core/config.py
All checks passed!

$ docker compose config > /dev/null
(exit 0)

$ uv run pytest tests/unit/test_rate_limit_coverage.py tests/unit/test_security.py
47 passed (no regressions)
```

## Key Decisions

- **D-06 (lock):** Removed the FIRST (stale) declarations at lines 45-46 of config.py; later defaults (Cloudflare CIDRs + 60/minute) preserved.
- **D-07 (lock):** Rate limiting flipped to ENABLED-by-default; opt-out preserved via env var.
- **D-08 (lock):** `%(DATABASE_URL_SYNC)s` interpolation — missing env var causes `InterpolationMissingOptionError`, which is the intended loud-failure behavior.

## Self-Check: PASSED

- FOUND: app/core/config.py (modified)
- FOUND: docker-compose.yml (modified)
- FOUND: alembic.ini (modified)
- FOUND commit: 00dee4b (Settings dedup)
- FOUND commit: 0b4a96e (rate-limit default)
- FOUND commit: 892bbc3 (alembic interpolation)
