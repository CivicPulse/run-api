---
phase: 40
slug: production-hardening-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (asyncio_mode=auto) |
| **Config file** | pyproject.toml `[tool.pytest.ini_options]` |
| **Quick run command** | `uv run pytest tests/test_observability.py -x -q` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/test_observability.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | OBS-02 | unit | `uv run pytest tests/test_observability.py::test_contextvar_set -x` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | OBS-02 | unit | `uv run pytest tests/test_observability.py::test_structlog_json_format -x` | ❌ W0 | ⬜ pending |
| 40-01-03 | 01 | 1 | OBS-02 | unit | `uv run pytest tests/test_observability.py::test_health_check_excluded -x` | ❌ W0 | ⬜ pending |
| 40-01-04 | 01 | 1 | OBS-02 | unit | `uv run pytest tests/test_observability.py::test_request_id_honoring -x` | ❌ W0 | ⬜ pending |
| 40-02-01 | 02 | 1 | OBS-01 | unit | `uv run pytest tests/test_observability.py::test_sentry_init_with_dsn -x` | ❌ W0 | ⬜ pending |
| 40-02-02 | 02 | 1 | OBS-01 | unit | `uv run pytest tests/test_observability.py::test_pii_scrubbing -x` | ❌ W0 | ⬜ pending |
| 40-02-03 | 02 | 1 | OBS-01 | unit | `uv run pytest tests/test_observability.py::test_sentry_disabled_without_dsn -x` | ❌ W0 | ⬜ pending |
| 40-03-01 | 03 | 2 | OBS-03 | unit | `uv run pytest tests/test_observability.py::test_trusted_proxy_ip -x` | ❌ W0 | ⬜ pending |
| 40-03-02 | 03 | 2 | OBS-04 | unit | `uv run pytest tests/test_observability.py::test_per_user_rate_limit -x` | ❌ W0 | ⬜ pending |
| 40-03-03 | 03 | 2 | OBS-03 | unit | `uv run pytest tests/test_observability.py::test_untrusted_proxy_fallback -x` | ❌ W0 | ⬜ pending |
| 40-04-01 | 04 | 2 | OBS-01,OBS-02 | unit | `uv run pytest tests/test_observability.py::test_error_response_request_id -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_observability.py` — stubs for OBS-01 through OBS-04
- [ ] Test fixtures for mock Sentry transport, ASGI app, and request context

*Existing pytest infrastructure covers framework needs. Only test file stubs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentry event visible in dashboard | OBS-01 | Requires running Sentry instance | Trigger 500 error, check Sentry UI within 30s |

*All other behaviors have automated verification via mocked transports and captured stdout.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
