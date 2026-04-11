---
phase: 107-canvassing-wizard-fixes
plan: 01
subsystem: ui
tags: [react, hooks, accessibility, prefers-reduced-motion, vitest]

requires:
  - phase: 106-test-baseline-trustworthiness
    provides: stable vitest + happy-dom test baseline
provides:
  - usePrefersReducedMotion React hook (D-20)
  - 5 unit tests covering false/true/change/cleanup/SSR-safe paths
affects: [107-04, 108, 109, 110]

tech-stack:
  added: []
  patterns:
    - "Reduced-motion detection via window.matchMedia + useEffect listener; SSR-safe initial state"

key-files:
  created:
    - web/src/hooks/usePrefersReducedMotion.ts
    - web/src/hooks/usePrefersReducedMotion.test.ts
  modified: []

key-decisions:
  - "Hook is SSR-safe via typeof window guard so it can be imported anywhere without crashing under non-DOM environments"
  - "Used addEventListener('change', handler) (not the deprecated addListener) to match modern matchMedia contract"
  - "Initial state computed lazily in useState initializer so the first render already reflects the OS preference"

patterns-established:
  - "Single-file hooks at web/src/hooks/{name}.ts with co-located {name}.test.ts using renderHook + happy-dom"

requirements-completed: [CANV-01]

duration: 3 min
completed: 2026-04-10
---

# Phase 107 Plan 01: usePrefersReducedMotion Hook Summary

**Reusable React hook detecting `prefers-reduced-motion: reduce` via `window.matchMedia` with reactive change-listener and SSR-safe initial state, gating Plan 107-04's card-swap animation and haptic feedback per D-20.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-10T23:19:00Z
- **Completed:** 2026-04-10T23:21:00Z
- **Tasks:** 1
- **Files modified:** 2 (both new)

## Accomplishments
- Added `usePrefersReducedMotion()` boolean hook (~20 lines, TypeScript strict, no `any`)
- 5 unit tests passing in vitest + happy-dom
- Zero changes to any other file in the repo
- Ready for Plan 107-04 to import for D-03 triple-channel feedback gating

## Task Commits

1. **Task 1: Create usePrefersReducedMotion hook + unit test (D-20)** — `b4ed72a` (feat)

## Files Created/Modified
- `web/src/hooks/usePrefersReducedMotion.ts` — Hook implementation: lazy-initialized state via matchMedia, useEffect change listener with cleanup, SSR-safe guards
- `web/src/hooks/usePrefersReducedMotion.test.ts` — 5 vitest specs: false-when-no-match, true-on-mount, reactive change update, cleanup on unmount, SSR-safe when matchMedia undefined

## Decisions Made
- **SSR-safe guards in BOTH the useState initializer and the useEffect** — defends against any consumer importing the hook in a non-DOM context (e.g., a future SSR pre-render).
- **Single 50ms vibrate is downstream's concern** — this hook is purely the detection primitive; consumers (Plan 04) decide what to gate.
- **Test mock installs matchMedia via Object.defineProperty rather than vi.stubGlobal** — happy-dom defines `window.matchMedia` as a non-configurable getter in some versions; defineProperty with `configurable: true` is the more portable shim.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hook is import-ready for Plan 107-04 (`import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"`)
- Wave 1 sibling plans 107-02 and 107-03 are non-overlapping and can land independently
- Ready for Plan 107-02

## Self-Check: PASSED
- `web/src/hooks/usePrefersReducedMotion.ts` — FOUND
- `web/src/hooks/usePrefersReducedMotion.test.ts` — FOUND
- Commit `b4ed72a` — FOUND in git log
- `npx vitest run src/hooks/usePrefersReducedMotion.test.ts` — exits 0, 5/5 passing
- `npx tsc --noEmit` — no errors on new files

---
*Phase: 107-canvassing-wizard-fixes*
*Completed: 2026-04-10*
