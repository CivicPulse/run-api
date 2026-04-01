# Phase 63: Phone Banking API + Data Resilience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 63-phone-banking-api-data-resilience
**Areas discussed:** Delete endpoint semantics, Fixture/data resilience strategy, Isolation boundary for tests, Unskip and verification bar

---

## Delete endpoint semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Guarded hard delete | Allow deleting only non-active sessions, remove session + caller assignments, keep call history/interactions/DNC records, return 204 | ✓ |
| Always hard delete | Delete regardless of status, force-release in-progress claims first | |
| Soft delete only | Add deleted/archived state instead of physical delete | |

**User's choice:** Guarded hard delete
**Notes:** Keep audit/operational records independent while making session lifecycle API-complete.

---

## Fixture/data resilience strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Per-spec API-built data | Each spec creates disposable call list/session/entries through API helpers | ✓ |
| Refresh shared seed data | Keep seeded sessions and reset/reseed before affected specs | |
| Hybrid approach | Seed for baseline context, fresh artifacts for active-calling steps | |

**User's choice:** Per-spec API-built data
**Notes:** Avoid dependence on exhausted long-lived seed sessions.

---

## Isolation boundary for tests

| Option | Description | Selected |
|--------|-------------|----------|
| Strict per-spec isolation | No shared mutable phone-banking fixtures across PB/FIELD specs | ✓ |
| Per-file shared fixture | Share only within a spec file | |
| Shared pool with reset | Share across specs with reset logic | |

**User's choice:** Strict per-spec isolation
**Notes:** Each spec owns and consumes only its generated phone-banking data.

---

## Unskip and verification bar

| Option | Description | Selected |
|--------|-------------|----------|
| No-skip mandatory in CI | Remove BUG-01 skips; affected tests must execute assertions in local + CI | ✓ |
| No-skip local, guarded CI | Local must run fully; CI may temporarily allow fallback | |
| Keep conditional fallback | Keep skip/fallback with better diagnostics | |

**User's choice:** No-skip mandatory in CI
**Notes:** Failures become regressions, not acceptable skips.

---

## the agent's Discretion

- Helper organization for per-spec API data builders
- Exact validation error message text for delete-while-active
- Placement of helper code (shared helper file vs local spec helper blocks)

## Deferred Ideas

None.
