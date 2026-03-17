---
phase: 36-google-maps-navigation-link-for-canvassing
plan: 02
subsystem: ui
tags: [react, google-maps, playwright, canvassing, admin]

# Dependency graph
requires:
  - phase: 36-google-maps-navigation-link-for-canvassing
    plan: 01
    provides: getGoogleMapsUrl, hasAddress, HasRegistrationAddress utilities in canvassing.ts
provides:
  - View on Map link on voter detail Registration Address card
  - Map icon per walk list entry row with household_key
  - P36-05 e2e test for admin View on Map link
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin map links use subtle text style (text-muted-foreground) vs field mode button treatment"
    - "Walk list entry map links use household_key as best-effort destination"

key-files:
  created: []
  modified:
    - web/src/routes/campaigns/$campaignId/voters/$voterId.tsx
    - web/src/routes/campaigns/$campaignId/canvassing/walk-lists/$walkListId.tsx
    - web/e2e/phase36-navigate.spec.ts
    - web/playwright.config.ts

key-decisions:
  - "Campaign API mock required for admin page e2e tests (root route fetches campaign data)"
  - "Added ignoreHTTPSErrors to Playwright webServer config for reliable HTTPS self-signed cert health checks"

patterns-established:
  - "Admin page e2e tests must mock /api/v1/campaigns/{id} endpoint for auth-gated page rendering"

requirements-completed: [P36-05]

# Metrics
duration: 31min
completed: 2026-03-16
---

# Phase 36 Plan 02: Admin View on Map Links Summary

**Subtle "View on Map" text links on voter detail and walk list admin pages with Google Maps walking directions**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-16T21:08:44Z
- **Completed:** 2026-03-16T21:39:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Voter detail page shows "View on Map" link below Registration Address card using getGoogleMapsUrl utility
- Walk list detail entries table shows ExternalLink icon per row when household_key exists
- Both links open Google Maps with travelmode=walking in new tab
- P36-05 Playwright e2e test passes verifying admin View on Map link

## Task Commits

Each task was committed atomically:

1. **Task 1: Add View on Map links to voter detail and walk list detail pages** - `88204f3` (feat)
2. **Task 2: Add P36-05 e2e test for voter detail View on Map link** - `ef58454` (test)

## Files Created/Modified
- `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` - Added View on Map link below Registration Address card
- `web/src/routes/campaigns/$campaignId/canvassing/walk-lists/$walkListId.tsx` - Added ExternalLink map icon per walk list entry row
- `web/e2e/phase36-navigate.spec.ts` - Added P36-05 test for admin View on Map link
- `web/playwright.config.ts` - Added ignoreHTTPSErrors to webServer config

## Decisions Made
- Campaign API endpoint must be mocked for admin page e2e tests because the root route loader fetches campaign data and blocks rendering on failure
- Added ignoreHTTPSErrors to Playwright webServer config to fix HTTPS self-signed certificate health check timeouts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ignoreHTTPSErrors to Playwright webServer config**
- **Found during:** Task 2 (e2e test)
- **Issue:** Playwright webServer health check could not connect to HTTPS preview server with self-signed certs, causing 60s timeout
- **Fix:** Added `ignoreHTTPSErrors: true` to webServer config in playwright.config.ts
- **Files modified:** web/playwright.config.ts
- **Verification:** All 6 Playwright tests pass from clean start
- **Committed in:** ef58454 (Task 2 commit)

**2. [Rule 3 - Blocking] Added campaign API mock for admin page test**
- **Found during:** Task 2 (e2e test)
- **Issue:** Admin pages hang on loading spinner because root route fetches campaign data from /api/v1/campaigns/{id} which returns 500 with no backend
- **Fix:** Added page.route() mock for campaign endpoint returning minimal campaign object
- **Files modified:** web/e2e/phase36-navigate.spec.ts
- **Verification:** P36-05 test passes, page renders voter detail correctly
- **Committed in:** ef58454 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for test infrastructure to work with admin pages. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 36 complete: all Google Maps navigation links implemented for both field mode and admin views
- All P36 requirements addressed across Plans 01 and 02

---
*Phase: 36-google-maps-navigation-link-for-canvassing*
*Completed: 2026-03-16*
