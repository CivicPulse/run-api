# Phase 112: Schema Migration + Legacy-Invite Handling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 112-schema-migration-legacy-invite-handling
**Mode:** `--interactive` (batched, one turn per area)
**Areas discussed:** Status column shape, SEC-04 enforcement, Legacy-flow predicate precision, Index strategy

---

## Status Column Shape

| Option | Description | Selected |
|--------|-------------|----------|
| varchar + CHECK constraint | VARCHAR(32) with `CHECK (...IN (...))`. Mirrors `email_delivery_status` precedent. Cheap to evolve values by swapping the constraint. | ✓ |
| Postgres native ENUM | `CREATE TYPE ... AS ENUM (...)`. Stronger type safety but `ALTER TYPE ADD VALUE` is non-reversible, breaking MIG-03. | |
| Plain varchar, no constraint | Weakest. No validation. Only for heavy value churn. | |

**User's choice:** varchar + CHECK constraint (recommended)
**Notes:** Precedent alignment (`email_delivery_status` on the same table) plus MIG-03's clean-downgrade requirement settled it.

---

## SEC-04 Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Both: ruff rule + unit test | `DTZ` ruleset in ruff (`DTZ003`, `DTZ005`) for edit-time + AST-scan test for CI backstop. | ✓ |
| Unit test only | AST scan without ruff config change. | |
| Ruff rule only | Fast local but no CI backstop if ruff is bypassed. | |

**User's choice:** Both (recommended)
**Notes:** Defense in depth for a bug (O6) that already shipped once in v1.18.

---

## Legacy-Flow Predicate Precision

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-v1.19 pending + unexpired | `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()` | ✓ |
| All unaccepted, unrevoked rows | Includes expired rows. Simpler, but flags dead rows. | |
| Every row without accepted_at | Includes revoked. Probably wrong. | |

**User's choice:** Pre-v1.19 pending + unexpired (recommended)
**Notes:** Expired rows get handled by Phase 115's "request fresh invite" CTA regardless of legacy flag.

---

## Index Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Unique partial on `zitadel_user_id` only | `WHERE zitadel_user_id IS NOT NULL`. Enforces 1 invite per ZITADEL user, speeds Phase 113 reuse lookup. | ✓ |
| Partial on both columns | Adds non-unique partial on `legacy_flow=true`. | |
| Skip all indexes | Add later on query-plan evidence. | |

**User's choice:** Unique partial on `zitadel_user_id` only (recommended)
**Notes:** Legacy cohort is bounded and small; add `legacy_flow` index later if query plans justify it.

---

## Claude's Discretion

- Column ordering in DDL (readability only)
- Whether ruff-sweep fixes ride in the same commit or a companion commit (default: same commit)
- Exact assertion style of `tests/unit/test_no_naive_datetime.py`
- Handling of non-load-bearing `DTZ` codes if they surface on this branch

## Deferred Ideas

- `legacy_flow` index — Phase 115 if query plan proves it's needed
- Composite `(campaign_id, identity_provisioning_status)` index — speculative, not today
- Enum migration (if we ever regret VARCHAR+CHECK) — a new migration, non-trivial but bounded
- `invite_provisioning_events` auditable history table — only if compliance/SLA dashboards need replay
- Naive-datetime enforcement for `scripts/` and `alembic/` — explicitly scope-limited to `app/`
