---
phase: 40-production-hardening-observability
plan: 01
subsystem: observability
tags: [sentry, structlog, contextvars, pii-scrubbing, request-tracing]

requires:
  - phase: 39-multi-tenancy-fix
    provides: "Stable FastAPI app with error handlers and middleware stack"
provides:
  - "ContextVars for request_id, user_id, campaign_id (app/core/observability.py)"
  - "Sentry SDK init with PII scrubbing and health-check exclusion (app/core/sentry.py)"
  - "Structlog JSON request logging middleware (app/core/middleware/request_logging.py)"
  - "request_id in all RFC 9457 error responses"
affects: [40-02, production-deployment, monitoring]

tech-stack:
  added: [sentry-sdk, structlog]
  patterns: [ContextVar-based request context, pure ASGI middleware, before_send PII scrubbing]

key-files:
  created:
    - app/core/observability.py
    - app/core/sentry.py
    - app/core/middleware/__init__.py
    - app/core/middleware/request_logging.py
    - tests/test_observability.py
  modified:
    - app/core/config.py
    - app/core/errors.py
    - app/main.py
    - pyproject.toml

key-decisions:
  - "Pure ASGI middleware (not BaseHTTPMiddleware) for structlog to avoid request body streaming issues"
  - "traces_sampler callback excludes /health paths from Sentry traces (returns 0.0)"
  - "ContextVars shared across middleware, error handlers, and Sentry before_send hook"

patterns-established:
  - "ContextVar pattern: set in middleware, read in error handlers and Sentry"
  - "Pure ASGI middleware pattern: __init__(app) + __call__(scope, receive, send)"
  - "PII scrubbing via compiled regex in before_send hook"

requirements-completed: [OBS-01, OBS-02]

duration: 4min
completed: 2026-03-24
---

# Phase 40 Plan 01: Observability Core Summary

**Sentry error tracking with PII scrubbing and structlog JSON request telemetry via ContextVars-based request context**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T10:34:12Z
- **Completed:** 2026-03-24T10:38:36Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Sentry SDK initializes when SENTRY_DSN is set, gracefully no-ops when empty
- PII scrubbing removes phone numbers and emails from all Sentry event fields
- Structlog middleware emits JSON log per request with 11 fields (request_id, user_id, campaign_id, method, path, status_code, duration_ms, query_params, response_size, client_ip, user_agent)
- Health check endpoints excluded from both logging and Sentry traces
- X-Request-ID header honored from upstream, generated as UUID4 when missing, returned in response
- All 8 RFC 9457 error responses include request_id field
- 6 unit tests covering PII scrubbing, Sentry no-op, and health check exclusion

## Task Commits

Each task was committed atomically:

1. **Task 1: Create observability core, Sentry module, and config settings** - `513fc05` (feat)
2. **Task 2: Create structlog middleware, update error handlers, wire into main.py** - `83b226e` (feat)
3. **Task 3: Unit tests for PII scrubbing, health check exclusion, and request_id propagation** - `75286c9` (test)

## Files Created/Modified

- `app/core/observability.py` - ContextVars for request_id, user_id, campaign_id
- `app/core/sentry.py` - Sentry SDK init, PII scrubbing, traces_sampler for health exclusion
- `app/core/middleware/__init__.py` - Middleware package init
- `app/core/middleware/request_logging.py` - Pure ASGI structlog middleware with JSON request logging
- `app/core/config.py` - Added sentry_dsn, sentry_traces_sample_rate, environment settings
- `app/core/errors.py` - Added request_id to all 8 ProblemResponse handlers
- `app/main.py` - Wired init_sentry() and StructlogMiddleware into create_app()
- `pyproject.toml` - Added sentry-sdk[fastapi] and structlog dependencies
- `tests/test_observability.py` - 6 unit tests for observability stack

## Decisions Made

- Used pure ASGI middleware (not BaseHTTPMiddleware) for structlog to avoid request body streaming issues
- traces_sampler callback returns 0.0 for /health paths to exclude from Sentry traces
- ContextVars shared across middleware, error handlers, and Sentry before_send hook for consistent request context

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. SENTRY_DSN is optional and defaults to empty (no-op).

## Next Phase Readiness

- Observability foundation complete; request logging and error tracking operational
- Plan 02 can build on ContextVars for additional observability (metrics, dashboards)
- SENTRY_DSN environment variable ready for production configuration

---
*Phase: 40-production-hardening-observability*
*Completed: 2026-03-24*
