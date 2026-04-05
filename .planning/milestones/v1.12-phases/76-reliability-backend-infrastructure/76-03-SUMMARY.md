---
phase: 76-reliability-backend-infrastructure
plan: 03
subsystem: backend-reliability
tags: [timeouts, httpx, sqlalchemy, asyncpg, zitadel]
requires: [76-01]
provides:
  - "ZitadelService httpx.AsyncClient 10s timeout on all call sites"
  - "Async SQLAlchemy engine with pool_timeout=10 and statement_timeout=30000ms"
affects: [app/services/zitadel.py, app/db/session.py]
tech-stack:
  added: []
  patterns:
    - "httpx.AsyncClient(timeout=10.0, ...) standard idiom"
    - "asyncpg server_settings via connect_args for Postgres statement_timeout"
key-files:
  created: []
  modified:
    - app/services/zitadel.py
    - app/db/session.py
decisions:
  - "10s hardcoded httpx timeout per D-03 (no env override in this plan)"
  - "30000ms Postgres statement_timeout per D-04 (no env override in this plan)"
metrics:
  duration: "~5 min"
  completed: "2026-04-04"
requirements: [REL-04, REL-05]
---

# Phase 76 Plan 03: ZitadelService + DB Engine Timeouts Summary

HTTP calls to ZITADEL and all DB operations are now bounded by explicit timeouts: 10s per httpx request and 10s pool checkout / 30s per Postgres statement.

## What Was Built

- Added `timeout=10.0` kwarg to every `httpx.AsyncClient(...)` instantiation in `app/services/zitadel.py` (9 call sites).
- Added `pool_timeout=10` and `connect_args={"server_settings": {"statement_timeout": "30000"}}` to `create_async_engine` in `app/db/session.py`.

## ZitadelService AsyncClient Call Sites Modified

| Method                   | Line (approx) | Before                                               | After                                                                 |
| ------------------------ | ------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `_get_token`             | 62            | `headers=..., verify=self._verify_tls`               | `headers=..., verify=self._verify_tls, timeout=10.0`                  |
| `create_organization`    | 117           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `deactivate_organization`| 153           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `delete_organization`    | 188           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `assign_project_role`    | 241           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `remove_project_role`    | 295           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `remove_all_project_roles`| 375          | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `create_project_grant`   | 426           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |
| `ensure_project_grant`   | 487           | `verify=self._verify_tls`                            | `verify=self._verify_tls, timeout=10.0`                               |

## Engine Kwargs Diff

```diff
 engine = create_async_engine(
     settings.database_url,
     echo=settings.debug,
     pool_pre_ping=True,
     pool_size=20,
     max_overflow=20,
+    pool_timeout=10,
+    connect_args={"server_settings": {"statement_timeout": "30000"}},
 )
```

## Tasks Completed

| Task | Name                                                       | Commit   | Files                   |
| ---- | ---------------------------------------------------------- | -------- | ----------------------- |
| 1    | Add 10s timeout to every httpx.AsyncClient in ZitadelService | 2e79c05  | app/services/zitadel.py |
| 2    | Add pool_timeout and statement_timeout to async engine     | deb2687  | app/db/session.py       |

## Verification

```
uv run pytest tests/unit/test_zitadel_timeouts.py tests/unit/test_db_engine_timeouts.py tests/unit/test_zitadel_token.py tests/unit/test_pool_events.py -x
=> 8 passed

uv run pytest tests/unit/test_rls_middleware.py -x
=> 3 passed

uv run ruff check app/services/zitadel.py app/db/session.py
=> All checks passed!
```

Wave 0 timeout tests (`test_zitadel_timeouts.py`, `test_db_engine_timeouts.py`) flipped from red to green. No regression in existing ZITADEL token test or pool/RLS event tests.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/services/zitadel.py (modified)
- FOUND: app/db/session.py (modified)
- FOUND: commit 2e79c05
- FOUND: commit deb2687
