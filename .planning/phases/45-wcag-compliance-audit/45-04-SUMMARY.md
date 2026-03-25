---
phase: 45-wcag-compliance-audit
plan: 04
subsystem: testing
tags: [accessibility, wcag, playwright, aria, keyboard-navigation, screen-reader, a11y, e2e]

requires:
  - phase: 45-01
    provides: shared a11y components (SkipNav, FocusScope, LiveRegion)
  - phase: 45-02
    provides: map accessibility with skip-nav and GeoJSON fallback
  - phase: 45-03
    provides: axe-core route scan, D-10 focus management, ARIA remediation
provides:
  - 5 Playwright accessibility flow tests for critical user workflows
  - Voter search keyboard navigation and ARIA landmark verification
  - Voter import wizard multi-step accessibility verification (D-07)
  - Walk list creation flow keyboard and screen reader verification
  - Phone bank session flow keyboard navigation verification
  - Campaign settings form labels, keyboard navigation, and dialog focus trapping (D-10)
affects: [voter-search, voter-import, canvassing, phone-banking, campaign-settings]

tech-stack:
  added: []
  patterns: ["keyboard Tab navigation assertions", "getByRole ARIA landmark verification", "heading hierarchy validation", "dialog focus trap verification", "multi-step wizard a11y verification"]

key-files:
  created:
    - web/e2e/a11y-voter-search.spec.ts
    - web/e2e/a11y-voter-import.spec.ts
    - web/e2e/a11y-walk-list.spec.ts
    - web/e2e/a11y-phone-bank.spec.ts
    - web/e2e/a11y-campaign-settings.spec.ts
  modified: []

key-decisions:
  - "Each flow test combines keyboard-only Tab navigation AND getByRole ARIA assertions in single test (D-06)"
  - "Voter import wizard verifies accessibility at each of 4 steps via URL query param navigation (D-07)"
  - "Dialog focus trapping verified by Tab inside dialog and Escape to close (D-10)"
  - "Heading hierarchy validation checks no levels are skipped (h1->h3 would fail)"
  - "Mock API pattern reused from a11y-scan.spec.ts with per-flow route-specific mocks"

patterns-established:
  - "A11Y flow test pattern: setupAuth + setupApiMocks + navigate + verify landmarks + verify headings + keyboard navigation + role assertions"
  - "Heading hierarchy validator: collect all heading levels, assert consecutive jump <= 1"

requirements-completed: [A11Y-02, A11Y-03]

duration: 4min
completed: 2026-03-25
---

# Phase 45 Plan 04: Accessibility Flow Tests Summary

**5 Playwright flow tests verifying keyboard operability and screen reader compatibility for voter search, voter import wizard, walk list creation, phone bank sessions, and campaign settings**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T00:18:05Z
- **Completed:** 2026-03-25T00:21:58Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created 5 accessibility flow tests covering the 5 critical user workflows
- Each test verifies ARIA landmarks (navigation, main), heading hierarchy, and keyboard Tab navigation
- Voter import wizard test verifies accessibility at every step (upload, column mapping, preview, progress) per D-07
- Campaign settings test verifies dialog focus trapping and Escape-to-close per D-10
- All tests use Playwright getByRole assertions combined with keyboard navigation per D-06

## Task Commits

Each task was committed atomically:

1. **Task 1: Create voter search and voter import flow tests** - `5a0ea4e` (feat)
2. **Task 2: Create walk list, phone bank, and campaign settings flow tests** - `56e4129` (feat)

## Files Created/Modified
- `web/e2e/a11y-voter-search.spec.ts` - Voter search ARIA landmarks, heading hierarchy, keyboard navigation, table semantics
- `web/e2e/a11y-voter-import.spec.ts` - Import wizard multi-step accessibility (file upload, column mapping, preview, progress)
- `web/e2e/a11y-walk-list.spec.ts` - Canvassing overview ARIA landmarks, heading hierarchy, table semantics, button names
- `web/e2e/a11y-phone-bank.spec.ts` - Phone banking sessions list and detail page keyboard navigation, button names
- `web/e2e/a11y-campaign-settings.spec.ts` - Settings form labels, keyboard navigation, dialog focus trapping, members page

## Decisions Made
- Each flow test combines keyboard-only Tab navigation AND getByRole ARIA assertions in a single test (per D-06)
- Voter import wizard navigates to each step via URL query params (jobId + step) to verify accessibility at each stage (per D-07)
- Dialog focus trapping verified by checking activeElement is within dialog after Tab, and dialog closes on Escape (per D-10)
- Heading hierarchy validated by collecting all heading levels and asserting no consecutive jump > 1
- Mock API pattern reused from a11y-scan.spec.ts with per-flow route-specific mock data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- All 5 critical flow accessibility tests ready for CI execution
- Combined with Plan 03's axe-core scan, full WCAG AA compliance coverage is established
- Phase 45 accessibility audit complete with automated scanning + flow verification
