---
phase: 76-reliability-backend-infrastructure
plan: 01
subsystem: testing
tags: [pytest, tdd, wave-0, reliability, asgi, httpx]

# Dependency graph
requires: []
provides:
  - Failing pytest stubs pinning REL-04/05/06/07/09/10/11 gaps
  - Nyquist loop for plans 76-02..05 (each fix has pre-existing watcher)
  - ASGI middleware driving pattern for StructlogMiddleware tests
  - Source-text assertion pattern for config/engine kwargs
affects: [76-02, 76-03, 76-04, 76-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-text assertions for config defaults (Path.read_text + .count / substring)"
    - "Direct ASGI middleware drive pattern (scope/receive/send shim for unit tests)"
    - "Dependency override + patched resolve_campaign_role/JWKSManager for route tests"

key-files:
  created:
    - tests/unit/test_zitadel_timeouts.py
    - tests/unit/test_db_engine_timeouts.py
    - tests/unit/test_settings_dedup.py
    - tests/unit/test_dnc_upload_size_limit.py
    - tests/unit/test_import_filename_sanitize.py
    - tests/unit/test_alembic_ini_interpolation.py
    - tests/unit/test_request_logging_ip.py
  modified: []

key-decisions:
  - "Used source-text assertions for engine kwargs to avoid SQLAlchemy pool introspection brittleness"
  - "Drove StructlogMiddleware manually via crafted ASGI scope instead of booting the full app (keeps REL-07 test under 50 ms)"
  - "Patched app.main.settings + ZitadelService._get_token in filename-sanitize test to bypass lifespan credential check"

patterns-established:
  - "Wave 0 TDD: each REL fix has a failing test that flips green when the fix lands"
  - "Auth bypass for unit route tests: dependency_overrides[get_current_user] + patch resolve_campaign_role + patch JWKSManager + mock_db.execute returning local User"

requirements-completed: []  # Tests pin requirements — the requirements themselves complete when plans 02-05 land.

# Metrics
duration: 25min
completed: 2026-04-04
---

# Phase 76 Plan 01: Failing Test Stubs Summary

**Seven failing pytest modules covering REL-04..11 hardening gaps, each pre-wired to flip green as plans 76-02..05 land.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-04T21:45:00Z (approx)
- **Completed:** 2026-04-04T21:55:00Z (approx)
- **Tasks:** 3
- **Files created:** 7

## Accomplishments

- 7 new pytest files in `tests/unit/`, 14 failing assertions on current main, 7 passing guards
- Source-text assertion harness for config/engine kwargs (REL-04, REL-05, REL-06, REL-11)
- Full-stack TestClient route tests for REL-09 (DNC 10MB cap) and REL-10 (filename sanitize)
- Direct ASGI middleware drive harness for REL-07 (trusted-proxy IP check) — no full-app boot

## Test → REL Mapping + Failure Message on main

| File | REL | First failing assertion |
| --- | --- | --- |
| `test_zitadel_timeouts.py` | REL-04 | `8 httpx.AsyncClient call(s) in app/services/zitadel.py are missing timeout=10.0` |
| `test_db_engine_timeouts.py` | REL-05 | `app/db/session.py must pass pool_timeout=10 to create_async_engine` + `must pass connect_args={"server_settings": {"statement_timeout": "30000"}}` |
| `test_settings_dedup.py` | REL-06 / H11 | `trusted_proxy_cidrs: list[str] exactly once; found 2 declarations` + same for rate_limit_unauthenticated |
| `test_dnc_upload_size_limit.py` | REL-09 / H1 | `Expected 413 Payload Too Large for 11 MB DNC CSV upload, got 200` |
| `test_import_filename_sanitize.py` | REL-10 / H2 | `file_key must not contain '..' path traversal: 'imports/.../../../../etc/passwd'` (x4 sanitization checks) |
| `test_alembic_ini_interpolation.py` | REL-11 | `alembic.ini must use %(DATABASE_URL_SYNC)s interpolation for sqlalchemy.url` |
| `test_request_logging_ip.py` | REL-07 / H16 | `Untrusted client 8.8.8.8 must NOT be allowed to spoof X-Real-IP; expected 8.8.8.8, got '1.2.3.4'` |

## Task Commits

1. **Task 1: zitadel/db timeouts + settings dedup tests** — `9d5e45a` (test)
2. **Task 2: DNC cap + filename sanitize + alembic.ini tests** — `e8dd783` (test)
3. **Task 3: request-logging trusted-proxy IP check tests** — `ce3f169` (test)

## Files Created

- `tests/unit/test_zitadel_timeouts.py` — Regex-extracts every `httpx.AsyncClient(...)` call in zitadel.py and asserts each has `timeout=10.0`.
- `tests/unit/test_db_engine_timeouts.py` — Source-text asserts `pool_timeout=10` and `statement_timeout": "30000"` in session.py.
- `tests/unit/test_settings_dedup.py` — Asserts single declaration of `trusted_proxy_cidrs` / `rate_limit_unauthenticated` + effective defaults match Cloudflare CIDRs + 60/minute.
- `tests/unit/test_dnc_upload_size_limit.py` — Full TestClient POST against `/dnc/import`; asserts 413 for 11MB body, non-413 for small body.
- `tests/unit/test_import_filename_sanitize.py` — Full TestClient POST against `/imports`; asserts `file_key` strips `..`, `\x00`, `\\` and prepends UUID.
- `tests/unit/test_alembic_ini_interpolation.py` — Asserts `%(DATABASE_URL_SYNC)s` present and hardcoded localhost URL absent.
- `tests/unit/test_request_logging_ip.py` — Directly drives `StructlogMiddleware` with crafted ASGI scope; captures `client_ip` via monkeypatched logger.

## Decisions Made

- **Source-text assertions over runtime introspection** for engine/config checks — SQLAlchemy QueuePool internals change across versions and would couple the test to private attributes. Reading the source file keeps assertions explicit and version-stable.
- **Bracket-matching parser** (not naive regex) for extracting `httpx.AsyncClient(...)` argument spans — handles the multi-line constructor calls in zitadel.py cleanly.
- **Manual ASGI drive for StructlogMiddleware** — skips app boot, middleware stack, auth, and DB. Test finishes in ~10ms and isolates the IP-resolution logic.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan allowed either SQLAlchemy pool introspection or source-text assertions for DB engine tests; chose source-text per the plan's own "simple, no runtime introspection gymnastics" note.

## Issues Encountered

1. **First DNC test run hit `ensure_user_synced` coroutine bug** — `require_role` imports `ensure_user_synced` locally, so `dependency_overrides` doesn't intercept it. **Resolution:** Populated `mock_db.execute` to return a pre-built `User` instance so the real `ensure_user_synced` runs cleanly, then patched `resolve_campaign_role` and `JWKSManager` (same pattern as existing `test_import_upload.py`).
2. **Filename-sanitize test triggered lifespan ZITADEL token exchange** — app startup validates credentials against real ZITADEL. **Resolution:** Added `patch("app.main.settings")` with stub ZITADEL values + `patch.object(ZitadelService, "_get_token")` (copied pattern from `test_import_upload.py::test_initiate_import_rewrites_upload_url_to_request_origin`).

## Next Phase Readiness

- Wave 0 scaffold complete. Plans 76-02, 76-03, 76-04 now have pre-existing tests to flip.
- No blockers. Ruff clean. 14 failing assertions, 7 passing guards.

---
*Phase: 76-reliability-backend-infrastructure*
*Completed: 2026-04-04*

## Self-Check: PASSED
