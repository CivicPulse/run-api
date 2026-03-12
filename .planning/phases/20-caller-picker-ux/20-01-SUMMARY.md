---
phase: 20-caller-picker-ux
plan: 01
subsystem: ui
tags: [react, cmdk, combobox, popover, phone-banking, member-picker]

# Dependency graph
requires:
  - phase: 16-phone-banking
    provides: "Session detail page with AddCallerDialog, Overview/Progress tabs, useAssignCaller mutation"
  - phase: 17-volunteer-management
    provides: "volunteersById useMemo lookup pattern (replicated as membersById)"
provides:
  - "Popover+Command combobox member picker in AddCallerDialog"
  - "membersById name resolution with UUID fallback in Overview and Progress caller tables"
  - "roleVariant map for consistent role badge rendering"
affects: [20-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "membersById useMemo lookup for user_id to CampaignMember resolution"
    - "Popover+Command combobox with closure-captured IDs (avoids cmdk normalization)"
    - "resolveCallerName/resolveCallerRole helpers with UUID fallback"

key-files:
  created: []
  modified:
    - "web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx"

key-decisions:
  - "roleVariant map duplicated from settings/members.tsx rather than extracting to shared module (minimal file changes for focused phase)"
  - "resolveCallerName/resolveCallerRole as module-level functions taking membersById parameter (not closures) for testability"
  - "CommandItem value set to display_name + email for dual-field search via cmdk built-in filter"

patterns-established:
  - "Popover+Command combobox pattern: closure-captured ID in onSelect, PopoverContent width via --radix-popover-trigger-width CSS var"
  - "membersById Map<string, CampaignMember> lookup via useMemo on useMembers query data"

requirements-completed: [PHON-03]

# Metrics
duration: 2min 45sec
completed: 2026-03-12
---

# Phase 20 Plan 01: Caller Picker UX Summary

**Popover+Command combobox member picker in AddCallerDialog with membersById name+role resolution in Overview and Progress caller tables**

## Performance

- **Duration:** 2 min 45 sec
- **Started:** 2026-03-12T19:41:55Z
- **Completed:** 2026-03-12T19:44:40Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced raw ZITADEL user ID text input with searchable Popover+Command combobox showing campaign members with display name + role badge
- Both Overview and Progress tab caller tables now show resolved member names + role badges instead of truncated UUIDs
- Already-assigned callers hidden from picker; "All campaign members are already assigned" shown when no available members
- Fallback to truncated UUID (first 12 chars + "...") when caller not found in members lookup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add membersById lookup and name resolution helpers** - `8603d22` (feat)
2. **Task 2: Refactor AddCallerDialog to Popover+Command combobox** - `079fc53` (feat)

## Files Created/Modified
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx` - Added useMembers query, membersById lookup, resolveCallerName/resolveCallerRole helpers, roleVariant map, Popover+Command combobox in AddCallerDialog, name+role display in both caller tables

## Decisions Made
- roleVariant map duplicated from settings/members.tsx -- per RESEARCH.md recommendation, duplication acceptable for minimal file changes in this focused phase
- resolveCallerName/resolveCallerRole implemented as module-level functions taking membersById as parameter for reusability across OverviewTab and ProgressTab
- CommandItem value set to `${display_name} ${email}` enabling cmdk built-in filter on both fields without custom filter logic
- Used closure-captured member.user_id in onSelect callback to avoid cmdk value normalization pitfall

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PHON-03 gap closure complete -- all 60 v1.2 requirements now satisfied
- Plan 20-02 (verification) can proceed to validate the implementation

## Self-Check: PASSED

- FOUND: web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/index.tsx
- FOUND: 8603d22 (Task 1 commit)
- FOUND: 079fc53 (Task 2 commit)
- FOUND: 20-01-SUMMARY.md

---
*Phase: 20-caller-picker-ux*
*Completed: 2026-03-12*
