---
phase: 43-organization-ui
plan: 02
subsystem: ui
tags: [react, tanstack-router, shadcn, org-dashboard, campaign-cards, org-switcher]

requires:
  - phase: 43-01
    provides: "Org API endpoints, frontend types, hooks (useOrgCampaigns, useMyOrgs, useArchiveCampaign), RequireOrgRole, switchOrg"
provides:
  - "Org dashboard at / with campaign card grid, stats bar, archived section, archive flow"
  - "OrgSwitcher header component for multi-org users"
  - "Sidebar Organization group with Members and Settings nav items"
affects: [43-03, 43-04]

tech-stack:
  added: []
  patterns: ["Org-scoped dashboard replacing campaign list at /", "OrgSwitcher with ZITADEL re-auth on org change"]

key-files:
  created:
    - web/src/components/org/CampaignCard.tsx
    - web/src/components/org/StatsBar.tsx
    - web/src/components/org/OrgSwitcher.tsx
  modified:
    - web/src/routes/index.tsx
    - web/src/routes/__root.tsx

key-decisions:
  - "Sum campaign member_counts for stats bar total (may double-count cross-campaign members, acceptable for dashboard stats)"
  - "Archived campaigns excluded from three-dot menu (view-only, no action needed)"

patterns-established:
  - "CampaignCard: stopPropagation on dropdown to prevent card link navigation"
  - "OrgSwitcher: single-org shows plain text, multi-org shows dropdown"

requirements-completed: [ORG-05, ORG-07, ORG-11, ORG-12, ORG-13]

duration: 12min
completed: 2026-03-24
---

# Phase 43 Plan 02: Org Dashboard & Switcher Summary

**Org-scoped dashboard at / with campaign card grid, archive flow, stats bar, and header org switcher for multi-org users**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-24T19:21:50Z
- **Completed:** 2026-03-24T19:34:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced CampaignList home page with OrgDashboard showing campaign cards with status badges, election dates, and member counts
- Archive flow with three-dot menu, confirmation dialog, and toast notification
- StatsBar showing active campaign count and total members
- OrgSwitcher in header with dropdown for multi-org users, triggering ZITADEL re-auth on switch
- Sidebar Organization group with Members and Settings nav items gated to org_admin+

## Task Commits

Each task was committed atomically:

1. **Task 1: Org dashboard replacing home page with campaign cards, stats, and archive** - `b253271` (feat)
2. **Task 2: OrgSwitcher component in header for multi-org users** - `3c2aa36` (feat)

## Files Created/Modified
- `web/src/components/org/StatsBar.tsx` - Stats bar showing active campaign count and member count
- `web/src/components/org/CampaignCard.tsx` - Campaign card with status badge, election date, three-dot archive menu
- `web/src/components/org/OrgSwitcher.tsx` - Header org switcher dropdown with ZITADEL re-auth on switch
- `web/src/routes/index.tsx` - Rewritten from CampaignList to OrgDashboard with archived section and archive dialog
- `web/src/routes/__root.tsx` - Added OrgSwitcher to header, org nav items to sidebar

## Decisions Made
- Sum campaign member_counts for stats bar total (acceptable approximation for dashboard)
- Archived campaign cards have no three-dot menu -- only active campaigns show action menu
- Single-org users see org name as plain text (no dropdown), multi-org see full switcher

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Org dashboard complete, ready for Plan 03 (org members page) and Plan 04 (org settings page)
- Sidebar nav links to /org/members and /org/settings are wired but routes not yet created

## Self-Check: PASSED

All 5 files exist. Both commit hashes verified. All 21 acceptance criteria pass. TypeScript compilation clean.

---
*Phase: 43-organization-ui*
*Completed: 2026-03-24*
