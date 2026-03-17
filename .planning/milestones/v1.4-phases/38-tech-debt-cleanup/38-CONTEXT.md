# Phase 38: Tech Debt Cleanup - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve 4 accumulated tech debt items identified in the v1.4 milestone audit. No new features, no behavior changes — strictly cleanup fixes across test stubs, lint warnings, selector ambiguity, and unused variables.

</domain>

<decisions>
## Implementation Decisions

### Playwright selector fix (Phase 32 debt)
- `getByText("Survey Questions")` matches both heading and sr-only ARIA live div
- Affected files: `web/e2e/phase31-canvassing.spec.ts:153`, `web/e2e/phase32-verify.spec.ts:339-341`
- Fix by using a more specific selector (getByRole heading, or scoping to a container)

### useCallback dependency fix (Phase 33 debt)
- `useCallingSession.ts:241` — useCallback dependency array omits campaignId and sessionId
- Lint advisory, not runtime bug — but should be fixed for correctness
- Add missing dependencies to the useCallback array

### Tour test stub implementation (Phase 34 debt)
- 36 test stubs across 3 files need real implementations:
  - `web/src/stores/tourStore.test.ts` — 17 stubs (test.todo)
  - `web/src/hooks/useTour.test.ts` — 7 stubs (test.todo)
  - `web/e2e/tour-onboarding.spec.ts` — 12 stubs (test.fixme)
- Unit tests (tourStore, useTour) test Zustand store logic and driver.js hook behavior
- E2E tests (tour-onboarding) test tour auto-trigger, replay, quick-start card, and data-tour attributes

### Unused variable cleanup (Phase 35 debt)
- `web/src/routes/field/$campaignId/canvassing.tsx:57` — `isRunning` is destructured from useTourStore but unused
- Line 60 uses `s.isRunning` inside a selector callback, so the top-level destructure is redundant
- Remove the unused destructure

### Claude's Discretion
- Exact selector strategy for "Survey Questions" disambiguation (getByRole vs test-id vs container scoping)
- Test implementation details for the 36 tour stubs (assertion granularity, mock strategies)
- Whether to split into 2 plans (quick fixes + test stubs) or other grouping

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone audit
- `.planning/v1.4-MILESTONE-AUDIT.md` — Source of all 4 tech debt items with file locations and descriptions

### Affected test files
- `web/e2e/phase31-canvassing.spec.ts` — Playwright test with ambiguous "Survey Questions" selector
- `web/e2e/phase32-verify.spec.ts` — Playwright test with ambiguous "Survey Questions" selector
- `web/src/stores/tourStore.test.ts` — 17 test.todo stubs for tour Zustand store
- `web/src/hooks/useTour.test.ts` — 7 test.todo stubs for useTour hook
- `web/e2e/tour-onboarding.spec.ts` — 12 test.fixme stubs for tour e2e tests

### Affected source files
- `web/src/hooks/useCallingSession.ts` — useCallback dependency lint advisory
- `web/src/routes/field/$campaignId/canvassing.tsx` — Unused isRunning variable

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing Playwright page.route() API mocking pattern used across phases 31-36 for e2e tests
- tourStore uses Zustand persist with localStorage — test pattern established in offlineQueueStore tests
- driver.js already installed and CSS overrides in place from Phase 34

### Established Patterns
- Vitest for unit tests, Playwright for e2e tests
- Store tests use `getState()` directly without React rendering context (Phase 31 decision)
- E2e tests use `page.route()` mocking for CI-compatible testing without live backend (Phase 32 decision)

### Integration Points
- Tour test implementations need to match the actual tour step definitions in `useTour.ts`
- Playwright e2e tests for tour need to mock field API endpoints (field-me, walk-list-entries, etc.)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — all items are deterministic fixes from the milestone audit with clear before/after states.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-tech-debt-cleanup*
*Context gathered: 2026-03-17*
