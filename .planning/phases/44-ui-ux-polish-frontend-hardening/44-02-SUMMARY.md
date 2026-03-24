---
phase: 44-ui-ux-polish-frontend-hardening
plan: 02
subsystem: ui
tags: [react, tooltip, radio-group, shadcn, volunteer-invite, ux]

requires:
  - phase: 43-organization-ui
    provides: "Org settings page with ZITADEL org ID display"
provides:
  - "Promoted TooltipIcon component at web/src/components/shared/TooltipIcon.tsx"
  - "Volunteer invite mode radio toggle (manager-only)"
  - "Contextual tooltips at 4 of 5 decision points"
affects: [44-ui-ux-polish-frontend-hardening, org-settings]

tech-stack:
  added: [shadcn-alert]
  patterns: [tooltip-at-decision-points, radio-toggle-for-mode-selection]

key-files:
  created:
    - web/src/components/shared/TooltipIcon.tsx
    - web/src/components/ui/alert.tsx
  modified:
    - web/src/components/field/TooltipIcon.tsx
    - web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx
    - web/src/routes/campaigns/$campaignId/canvassing/turfs/new.tsx
    - web/src/routes/campaigns/$campaignId/settings/members.tsx
    - web/src/routes/campaigns/$campaignId/voters/imports/new.tsx
    - web/src/routes/campaigns/new.tsx

key-decisions:
  - "Tooltip on turf creation placed next to heading in new.tsx rather than in shared TurfForm component"
  - "Org settings tooltip deferred: page not present in worktree (Phase 43 branch not merged)"
  - "Invite mode uses toast.info for coming-soon notice since backend invite endpoint not yet wired"

patterns-established:
  - "TooltipIcon imported from @/components/shared/TooltipIcon for all new tooltip placements"
  - "Label+TooltipIcon wrapped in flex container for inline tooltip placement"

requirements-completed: [UX-02, UX-03, UX-04]

duration: 4m 20s
completed: 2026-03-24
---

# Phase 44 Plan 02: Volunteer Invite Toggle and Contextual Tooltips Summary

**Promoted TooltipIcon to shared component, added manager-only volunteer invite radio toggle with alert banner, and placed contextual help tooltips at 4 decision points (turf creation, role assignment, import mapping, campaign type)**

## Performance

- **Duration:** 4m 20s
- **Started:** 2026-03-24T20:43:47Z
- **Completed:** 2026-03-24T20:48:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Promoted TooltipIcon from field/ to shared/ with backward-compatible re-export
- Added radio toggle for tracked-only vs invite mode on volunteer creation (manager-only via RequireRole)
- Installed shadcn Alert component and used it for invite mode info banner
- Placed contextual tooltips at turf creation, role assignment, import column mapping, and campaign type decision points

## Task Commits

Each task was committed atomically:

1. **Task 1: Promote TooltipIcon to shared, add volunteer invite toggle** - `34bcb0a` (feat)
2. **Task 2: Place contextual tooltips at four decision points** - `45afa3b` (feat)

## Files Created/Modified
- `web/src/components/shared/TooltipIcon.tsx` - Promoted TooltipIcon for app-wide use
- `web/src/components/field/TooltipIcon.tsx` - Re-export for backward compatibility
- `web/src/components/ui/alert.tsx` - shadcn Alert component (new)
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` - Radio toggle for volunteer type + invite alert
- `web/src/routes/campaigns/$campaignId/canvassing/turfs/new.tsx` - Turf sizing tooltip
- `web/src/routes/campaigns/$campaignId/settings/members.tsx` - Role description tooltip
- `web/src/routes/campaigns/$campaignId/voters/imports/new.tsx` - Column mapping tooltip
- `web/src/routes/campaigns/new.tsx` - Campaign type tooltip

## Decisions Made
- Tooltip on turf creation placed next to "New Turf" heading rather than inside shared TurfForm component to avoid changing edit-turf behavior
- Org settings tooltip deferred because web/src/routes/org/settings.tsx does not exist in this worktree (Phase 43 code not yet merged)
- Invite mode creates volunteer record with send_invite flag and shows toast.info that email invite is coming soon (backend endpoint not yet available)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed shadcn Alert component**
- **Found during:** Task 1 (volunteer invite toggle)
- **Issue:** Alert component not yet installed in the project
- **Fix:** Ran `npx shadcn@latest add alert --yes`
- **Files modified:** web/src/components/ui/alert.tsx
- **Verification:** TypeScript compiles clean
- **Committed in:** 34bcb0a (Task 1 commit)

### Deferred Items

**2. Org settings tooltip (1 of 5 planned tooltips)**
- **Reason:** web/src/routes/org/settings.tsx does not exist in this worktree. The page was created in Phase 43 commits on the main branch which have not been merged into this worktree.
- **Resolution:** Apply tooltip after Phase 43 branch merge. Tooltip text: "This is your organization's unique identifier in the authentication system. Share it with support if you need assistance with account or access issues."

---

**Total deviations:** 1 auto-fixed (blocking), 1 deferred (missing dependency)
**Impact on plan:** 4 of 5 tooltip placements completed. Org settings tooltip deferred due to branch divergence -- no functional impact.

## Issues Encountered
- TypeScript compiler (tsc) not installed in worktree node_modules; resolved by running `npm install --no-save typescript`

## Known Stubs

**1. Volunteer invite email send**
- **File:** web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx
- **Line:** invite mode submit handler
- **Reason:** Backend invite endpoint does not exist yet. The invite mode creates a volunteer record with `send_invite: true` flag and shows a toast indicating the feature is coming soon. Intentional stub per plan spec (D-05).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TooltipIcon promoted and ready for additional tooltip placements across the app
- Volunteer invite toggle in place; backend invite endpoint needed to complete the flow
- Org settings tooltip ready to apply once Phase 43 merge completes

---
*Phase: 44-ui-ux-polish-frontend-hardening*
*Completed: 2026-03-24*
