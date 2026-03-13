---
phase: 12-shared-infrastructure-campaign-foundation
plan: 02
subsystem: ui
tags: [react, typescript, tanstack-router, react-hook-form, zod, permissions, settings, destructive-actions]

# Dependency graph
requires:
  - "12-01 (usePermissions, RequireRole, useFormGuard)"
provides:
  - "Settings layout route with vertical sidebar nav (General/Members/Danger Zone)"
  - "General tab: campaign edit form with zod validation, useFormGuard, useUpdateCampaign"
  - "Danger Zone tab: delete campaign (type-to-confirm) and transfer ownership (admin selector)"
  - "DestructiveConfirmDialog: reusable type-to-confirm destructive action dialog"
  - "useCampaigns extended: useUpdateCampaign, useDeleteCampaign, useTransferOwnership"
  - "Sidebar gear icon with RequireRole minimum='admin' permission gate"
affects:
  - phase-13
  - phase-15

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings layout as sibling route to campaign tab layout (no tab nav on settings pages)"
    - "Type-to-confirm destructive pattern: DestructiveConfirmDialog with input matching confirmText"
    - "Two-step transfer ownership: admin selector dialog -> confirm dialog"
    - "Danger Zone card styling: border-destructive/50, destructive-colored heading"
    - "useFormGuard with ConfirmDialog: isBlocked triggers unsaved-changes warning on navigation"

key-files:
  created:
    - web/src/routes/campaigns/$campaignId/settings.tsx
    - web/src/routes/campaigns/$campaignId/settings/index.tsx
    - web/src/routes/campaigns/$campaignId/settings/general.tsx
    - web/src/routes/campaigns/$campaignId/settings/danger.tsx
    - web/src/components/shared/DestructiveConfirmDialog.tsx
  modified:
    - web/src/routes/__root.tsx
    - web/src/hooks/useCampaigns.ts

key-decisions:
  - "Settings is a sibling route to campaign layout — not a child — so campaign tabs do NOT appear on settings pages"
  - "DestructiveConfirmDialog uses AlertDialogDescription asChild to embed input inside description area"
  - "Transfer ownership uses two-step flow: member selector first, then dedicated confirm dialog"
  - "Danger Zone wrapped in RequireRole minimum='owner' with readable fallback for non-owners"

requirements-completed: [CAMP-01, CAMP-02, CAMP-08]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 12 Plan 02: Campaign Settings Summary

**Campaign settings area with vertical sidebar layout, General edit tab (form + unsaved-changes guard), Danger Zone tab (type-to-confirm delete + two-step ownership transfer), and sidebar gear icon gated behind RequireRole minimum='admin'**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T21:41:02Z
- **Completed:** 2026-03-10T21:44:09Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments

- Added Settings gear icon to sidebar footer in `__root.tsx` wrapped in `RequireRole minimum="admin"` — only admin+ roles see it, lower roles see no settings entry point
- Created settings layout route at `/campaigns/$campaignId/settings` — vertical nav sidebar (General, Members, Danger Zone) with content area via `<Outlet />`, no campaign tab navigation bar
- Created `settings/index.tsx` redirect using `beforeLoad + redirect()` to automatically forward to `/settings/general`
- Created General tab with react-hook-form + zod (mode: "onBlur"), useFormGuard for unsaved changes blocking, useUpdateCampaign mutation, success/error toasts via sonner, and discard button on dirty form
- Extended `useCampaigns.ts` with `useUpdateCampaign` (PATCH), `useDeleteCampaign` (DELETE + navigate to /), and `useTransferOwnership` (POST transfer-ownership) — all with proper query invalidation
- Created `DestructiveConfirmDialog` — reusable AlertDialog requiring user to type exact confirmation string before confirm button enables; resets on open
- Created Danger Zone tab with two sections in destructive-styled Cards: delete campaign (type campaign name) and transfer ownership (admin member selector + confirm dialog), both gated behind `RequireRole minimum="owner"` with informative fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings route structure, sidebar gear icon, and General tab** - `eca4d17` (feat)
2. **Task 2: Danger Zone tab - delete campaign and transfer ownership** - `3d62dfa` (feat)

## Files Created/Modified

- `web/src/routes/__root.tsx` — Added Settings gear icon in SidebarFooter with RequireRole minimum="admin"
- `web/src/hooks/useCampaigns.ts` — Added useUpdateCampaign, useDeleteCampaign, useTransferOwnership
- `web/src/routes/campaigns/$campaignId/settings.tsx` — Settings layout with vertical nav sidebar
- `web/src/routes/campaigns/$campaignId/settings/index.tsx` — Redirect to /settings/general
- `web/src/routes/campaigns/$campaignId/settings/general.tsx` — Campaign edit form with validation and form guard
- `web/src/routes/campaigns/$campaignId/settings/danger.tsx` — Delete + transfer ownership with RequireRole owner gate
- `web/src/components/shared/DestructiveConfirmDialog.tsx` — Reusable type-to-confirm destructive action dialog

## Decisions Made

- Settings is a sibling to the campaign tab layout (not a child) — navigating to settings does NOT show campaign tabs
- Transfer ownership is a two-step flow: admin member selector dialog first, then explicit confirmation dialog
- Danger Zone content wrapped entirely in RequireRole minimum="owner" with a descriptive fallback message for non-owners
- DestructiveConfirmDialog embeds the input inside AlertDialogDescription using asChild to keep semantic HTML correct

## Deviations from Plan

None — plan executed exactly as written.

---
*Phase: 12-shared-infrastructure-campaign-foundation*
*Completed: 2026-03-10*

## Self-Check: PASSED
