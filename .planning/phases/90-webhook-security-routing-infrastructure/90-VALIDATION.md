---
phase: 90
slug: webhook-security-routing-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 90 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (asyncio_mode=auto) |
| **Config file** | pyproject.toml |
| **Quick run command** | `uv run pytest tests/unit/ -x -q --timeout=10` |
| **Full suite command** | `uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/unit/ -x -q --timeout=10`
- **After each plan completes:** Run `uv run pytest tests/ -x -q`
- **Before verification:** Run `uv run ruff check . && uv run ruff format --check .`

---

## Validation Architecture

### Wave 0: Test Foundation
- Verify existing test suite passes before any changes
- Run `uv run pytest tests/unit/ -x -q` as baseline

### Critical Paths
1. **Signature validation** — Twilio RequestValidator with public URL reconstruction
2. **Idempotency** — Duplicate webhook SID handling returns 200 without side effects
3. **Org routing** — Phone number → org resolution chain
4. **Error handling** — Invalid signatures return 403, missing orgs return 404

### Dimension Coverage
| Dimension | Coverage |
|-----------|----------|
| D1: Unit tests | Signature validation, org resolution, idempotency logic |
| D2: Integration | Webhook endpoint with mocked Twilio signatures |
| D3: Lint/format | ruff check + format on all new files |
| D4: Type check | mypy or pyright on new modules |
| D5: Security | Signature bypass attempts, replay attacks |
| D6: Build | Docker compose builds successfully |
| D7: Manual | Curl test with real Twilio signature (optional) |
| D8: Nyquist | This document |
