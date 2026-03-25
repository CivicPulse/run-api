# Phase 48: Connected E2E Journey Spec - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 48-connected-e2e-journey-spec
**Areas discussed:** Journey chaining strategy, Data creation vs seed data, Failure isolation, Assertion depth
**Mode:** --auto (all decisions auto-selected)

---

## Journey Chaining Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single test with `test.step()` blocks | Continuous browser state, clear step labels in reports | ✓ |
| Multiple tests sharing state via fixtures | More granular reporting but complex state passing |  |
| Single test without step labels | Simplest but no visibility into which step failed |  |

**User's choice:** [auto] Single `test.describe.serial()` with `test.step()` blocks
**Notes:** Recommended default — Playwright's step API provides best traceability while keeping state continuous.

---

## Data Creation vs Seed Data

| Option | Description | Selected |
|--------|-------------|----------|
| Create fresh data during journey | Proves full lifecycle — campaign creation through phone banking | ✓ |
| Use seed data (Macon-Bibb) | Faster, but doesn't test creation flows |  |
| Hybrid (seed org, create campaign) | Middle ground — org exists, campaign is fresh |  |

**User's choice:** [auto] Create fresh data during the journey
**Notes:** The spec's value is verifying creation flows compose correctly. Auth uses stored state from existing setup.

---

## Failure Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Serial dependency (skip rest on failure) | Correct for connected journey — later steps need earlier data | ✓ |
| Independent tests with shared setup | More resilient but doesn't test the connected path |  |
| Soft assertions (continue after failure) | Runs everything but may produce cascading failures |  |

**User's choice:** [auto] Serial dependency — `test.describe.serial()`
**Notes:** If campaign creation fails, there's nothing meaningful to test downstream.

---

## Assertion Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Navigation + key element + API response | Balanced — confirms step completed without over-asserting | ✓ |
| Navigation only (smoke level) | Too shallow — wouldn't catch broken forms |  |
| Full CRUD verification per step | Too deep — duplicates existing individual flow specs |  |

**User's choice:** [auto] Navigation + key element visible + API success response
**Notes:** Each step verifies URL, key UI element, and API success where applicable.

---

## Claude's Discretion

- Exact selectors and assertion targets per step
- `waitForResponse()` vs `waitForURL()` at each transition
- GeoJSON payload for turf creation
- Phone bank form field values

## Deferred Ideas

None — discussion stayed within phase scope
