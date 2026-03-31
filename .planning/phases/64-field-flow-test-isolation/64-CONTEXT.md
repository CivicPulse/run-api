# Phase 64: field-flow-test-isolation - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate FIELD-07 canvassing inline survey test-order side effects by isolating fixtures and setup so inline survey coverage passes consistently regardless of execution order.

</domain>

<decisions>
## Implementation Decisions

### FIELD-07 Fixture Ownership
- **D-01:** FIELD-07 uses per-test disposable backend data, not shared seed walk-list state.
- **D-02:** FIELD-07 fixture builds spec-owned canvassing entities for that test run only (walk-list path plus required assignment data), then consumes only those entities.

### Inline Survey Determinism
- **D-03:** FIELD-07 must always attach a known survey to the disposable FIELD-07 path so inline survey UI is deterministically exercised.
- **D-04:** Survey-present behavior is the required assertion path for FIELD-07; permissive survey-absent fallback logic is not the target for this test.

### Reset Boundary
- **D-05:** Isolation includes both backend data reset (fresh disposable entities) and client-side state reset before FIELD-07.
- **D-06:** Client reset explicitly includes canvassing-local persistence and tour-local persistence relevant to flow stability (for example `canvassing-store` and tour state).

### Order-Isolation Verification
- **D-07:** Completion requires a broad permutation matrix of reordered executions (not just one reordered run) to prove FIELD-07 order independence.
- **D-08:** Verification must demonstrate FIELD-07 pass behavior when positioned across multiple order variants, including before and after other field-flow tests.

### Carry Forward from Prior Phases
- **D-09:** Preserve Phase 63 deterministic fixture principle: no dependence on mutable shared long-lived data for critical field-flow assertions.
- **D-10:** Preserve established Playwright execution model: serial flow inside spec blocks, parallelism across spec files unless an isolation guard requires targeted override.

### the agent's Discretion
- Exact helper/function naming and placement for disposable FIELD-07 fixture builders
- Exact survey script content and answer-option shape used by deterministic fixture
- Exact permutation set size and command wiring, as long as it satisfies the broad matrix verification bar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 64 goal, gap closure target (FIELD-07 order side effects), and success criteria
- `.planning/REQUIREMENTS.md` — E2E-20 requirement mapping and milestone traceability for field-mode coverage
- `.planning/PROJECT.md` — testing milestone context and non-negotiable quality baseline for E2E reliability

### Prior Phase Decisions to Carry Forward
- `.planning/phases/60-e2e-field-mode-cross-cutting-validation/60-CONTEXT.md` — Field-mode testing patterns, offline/tour/canvassing conventions
- `.planning/phases/63-phone-banking-api-data-resilience/63-CONTEXT.md` — Deterministic per-spec/per-test fixture strategy and no-skip reliability posture
- `.planning/phases/59-e2e-advanced-tests/59-CONTEXT.md` — API-first setup and isolation conventions for high-volume E2E domains

### Affected Test Code
- `web/e2e/field-mode.volunteer.spec.ts` — FIELD-07 current implementation and shared-state behavior that must be isolated
- `web/e2e/helpers.ts` — Existing disposable fixture helper patterns (`createDisposablePhoneBankFixture`, authenticated API helpers)

### Codebase Testing Conventions
- `.planning/codebase/TESTING.md` — Existing test architecture, execution patterns, and reliability conventions
- `.planning/codebase/CONVENTIONS.md` — Route/test style conventions and response/assertion patterns
- `.planning/codebase/STRUCTURE.md` — File placement and integration points for E2E helper and spec updates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/e2e/helpers.ts`: authenticated API helpers and disposable fixture pattern that can be mirrored for canvassing/survey fixture creation
- `web/e2e/field-mode.volunteer.spec.ts`: existing campaign discovery, volunteer assignment setup, local-state reset helpers, and serial field-flow grouping

### Established Patterns
- Field-mode tests already rely on serial describe blocks and mobile volunteer context
- Deterministic disposable fixture creation was introduced recently for phone-banking resilience and is the expected direction for flaky field flows
- Local persistence reset (`localStorage` keys) is already used as a stabilization primitive and should be combined with backend isolation

### Integration Points
- FIELD-07 setup path inside `web/e2e/field-mode.volunteer.spec.ts` must be refactored to consume per-test disposable canvassing + survey data
- Shared E2E helper layer in `web/e2e/helpers.ts` is the natural home for reusable canvassing/survey fixture constructors and API utilities
- Verification scripts/commands for reordered runs should integrate with existing Playwright invocation patterns used by the phase test workflow

</code_context>

<specifics>
## Specific Ideas

- User explicitly locked per-test disposable fixture ownership for FIELD-07
- User explicitly locked deterministic inline survey attachment (always survey-present path)
- User explicitly locked combined backend+local reset boundary
- User explicitly chose a broad permutation matrix as the verification bar for order isolation confidence

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 64-field-flow-test-isolation*
*Context gathered: 2026-03-31*
