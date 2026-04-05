---
phase: 76-reliability-backend-infrastructure
plan: 05
subsystem: infra
tags: [middleware, logging, security, structlog, trusted-proxy, ip-spoofing]

requires:
  - phase: 76-reliability-backend-infrastructure
    provides: Settings dedup fix (76-02) so trusted_proxy_cidrs carries the real Cloudflare list at import time
  - phase: 76-reliability-backend-infrastructure
    provides: Wave 0 failing request-logging IP test (76-01)
provides:
  - StructlogMiddleware trusted-proxy IP resolution
  - IP-spoofing hardening on request-logging client_ip field
affects: [request-logs, audit-trails, rate-limiting]

tech-stack:
  added: []
  patterns:
    - "Reuse _is_trusted_proxy helper across middleware (logging + rate limit)"

key-files:
  created: []
  modified:
    - app/core/middleware/request_logging.py

key-decisions:
  - "Reuse existing _is_trusted_proxy from app.core.rate_limit (per plan D-11 lock) instead of duplicating CIDR parsing"
  - "Kept cf-connecting-ip > x-real-ip precedence so rate-limit and logging agree"

patterns-established:
  - "Trust-gated header extraction: only honor proxy headers when scope client is an allowed proxy"

requirements-completed: [REL-07]

duration: 6min
completed: 2026-04-05
---

# Phase 76 Plan 05: Request-logging trusted-proxy IP check Summary

**Gated X-Real-IP / CF-Connecting-IP on _is_trusted_proxy() so unauthenticated callers can no longer spoof their logged client_ip (REL-07 / H16)**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-05T01:50:00Z
- **Completed:** 2026-04-05T01:56:06Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- StructlogMiddleware now ignores cf-connecting-ip / x-real-ip when scope client is not in trusted_proxy_cidrs
- Wave 0 failing request-logging IP tests (5 cases) now pass
- All 26 rate-limit coverage tests still green, ruff clean

## Task Commits

1. **Task 1: Gate X-Real-IP / CF-Connecting-IP on trusted-proxy check** - `f4d207c` (fix)

## Files Modified
- `app/core/middleware/request_logging.py` - Added `_is_trusted_proxy` import and gated proxy-header trust on scope client IP

## Before / After Diff

Before (lines 81-85):
```python
client_ip = (
    _get_header(headers, b"cf-connecting-ip")
    or _get_header(headers, b"x-real-ip")
    or scope.get("client", ("",))[0]
)
```

After:
```python
scope_client = scope.get("client") or ("",)
scope_client_ip = scope_client[0] if scope_client else ""
if scope_client_ip and _is_trusted_proxy(scope_client_ip):
    client_ip = (
        _get_header(headers, b"cf-connecting-ip")
        or _get_header(headers, b"x-real-ip")
        or scope_client_ip
    )
else:
    client_ip = scope_client_ip
```

Plus the new import:
```python
from app.core.rate_limit import _is_trusted_proxy  # noqa: PLC2701
```

## Verification

```
uv run pytest tests/unit/test_request_logging_ip.py tests/unit/test_rate_limit_coverage.py -x
31 passed, 1 warning in 0.23s

uv run ruff check app/core/middleware/request_logging.py
All checks passed!
```

All 5 new test_request_logging_ip.py cases flipped from failing to passing:
- test_ip_from_untrusted_client_ignores_x_real_ip
- test_ip_from_untrusted_client_ignores_cf_connecting_ip
- test_ip_from_trusted_proxy_honors_x_real_ip
- test_ip_from_trusted_proxy_prefers_cf_connecting_ip
- test_ip_falls_back_to_scope_client_when_no_headers

Smoke test against a running container was skipped — the unit tests exercise the exact trust boundary with both Cloudflare and non-Cloudflare scope clients.

## Decisions Made
- Used `# noqa: PLC2701` on the `_is_trusted_proxy` import rather than exposing a public alias, per plan guidance (renaming ripples).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- The `<verification>` block referenced `tests/unit/test_observability.py` which does not exist in the repo. Ran the remaining two test files (which is what actually validates the change); all passed.

## Next Phase Readiness
- Phase 76 Wave 0 hardening complete end-to-end. All 7 Wave 0 tests pass (this plan + 76-01/02/03/04 predecessors).
- No blockers. Ready for phase verification.

---
*Phase: 76-reliability-backend-infrastructure*
*Completed: 2026-04-05*


## Self-Check: PASSED
- SUMMARY.md exists at .planning/phases/76-reliability-backend-infrastructure/76-05-SUMMARY.md
- Commit f4d207c exists

