# Phase 64: field-flow-test-isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 64-field-flow-test-isolation
**Areas discussed:** FIELD-07 fixture scope, inline survey trigger strategy, state reset boundaries, order-isolation verification bar

---

## FIELD-07 fixture scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per-test disposable data | Each FIELD-07 run creates and consumes its own walk-list/survey data. | ✓ |
| Per-spec disposable data | One fixture shared within FIELD-03..07 describe block. | |
| Keep shared seed data | Reuse long-lived seed walk-list state with resets. | |

**User's choice:** Per-test disposable data
**Notes:** Locked as the required isolation level to eliminate cross-test consumption side effects.

---

## Inline survey trigger strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Always attach known survey | Deterministically attach known survey to FIELD-07 fixture path. | ✓ |
| Dual-path assertion | Allow survey-present or survey-absent branch. | |
| Separate tests for both | Split explicit survey-present and survey-absent tests. | |

**User's choice:** Always attach known survey
**Notes:** FIELD-07 must reliably execute inline survey behavior, not a permissive fallback branch.

---

## State reset boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Data + local state reset | Fresh backend entities plus client-side local persistence reset. | ✓ |
| Local state reset only | Reset localStorage but reuse backend data. | |
| Full spec-wide rebuild each test | Rebuild all FIELD-03..07 fixtures every test. | |

**User's choice:** Data + local state reset
**Notes:** Isolation requires both server-side and browser-side reset boundaries.

---

## Order-isolation verification bar

| Option | Description | Selected |
|--------|-------------|----------|
| Reordered targeted runs | Validate normal order plus focused reorder cases. | |
| Single reordered run | One alternate order execution. | |
| Broad permutation matrix | Multiple order permutations to prove robustness. | ✓ |

**User's choice:** Broad permutation matrix
**Notes:** User chose the highest-confidence verification bar for order independence.

---

## the agent's Discretion

- Helper naming and placement for fixture builders
- Exact permutation set and command mechanics, provided broad-matrix intent is met

## Deferred Ideas

None
