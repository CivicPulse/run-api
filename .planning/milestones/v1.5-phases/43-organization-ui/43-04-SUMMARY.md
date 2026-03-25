---
phase: 43-organization-ui
plan: 04
subsystem: ui
tags: [react, tanstack-router, shadcn, org-management, member-directory, settings]

requires:
  - phase: 43-organization-ui
    plan: 01
    provides: useOrgMembers, useOrgCampaigns, useUpdateOrg, useAddMemberToCampaign hooks, OrgMember/OrgCampaign types, useOrgPermissions
provides:
  - Member directory page at /org/members with per-campaign role matrix
  - AddToCampaignDialog for assigning org members to campaigns with role selection
  - Org settings page at /org/settings with name editing and ZITADEL org ID display
  - DangerZone component with disabled Transfer Ownership and Delete Organization placeholders
affects:
  - web/src/routes/org/members.tsx
  - web/src/routes/org/settings.tsx
  - web/src/components/org/RoleMatrixTable.tsx
  - web/src/components/org/AddToCampaignDialog.tsx
  - web/src/components/org/DangerZone.tsx

tech-stack:
  added: []
  patterns:
    - Role matrix table with dynamic campaign columns
    - Disabled destructive buttons with Coming soon tooltip
    - Owner-only field editability via useOrgPermissions

key-files:
  created:
    - web/src/routes/org/members.tsx
    - web/src/routes/org/settings.tsx
    - web/src/components/org/RoleMatrixTable.tsx
    - web/src/components/org/AddToCampaignDialog.tsx
    - web/src/components/org/DangerZone.tsx
  modified: []

decisions:
  - Used Map<string, string> for campaign selection state in AddToCampaignDialog for clean add/remove semantics
  - Role select dropdown only appears after checkbox is checked to reduce visual clutter
  - DangerZone uses tooltips on span wrappers (tabIndex=0) so disabled buttons still show tooltip on hover/focus

metrics:
  duration: 2m 27s
  completed: 2026-03-24
  tasks: 2/2
  files_created: 5
  files_modified: 0
---

# Phase 43 Plan 04: Member Directory & Org Settings Summary

Member directory at /org/members with per-campaign role matrix table and add-to-campaign dialog; org settings at /org/settings with owner-only name editing, read-only ZITADEL org ID, and danger zone placeholders.

## What Was Built

### Task 1: Member Directory Page (5324f3f)

Created three components for the member directory:

- **RoleMatrixTable** - Table with avatar+name, email, and one column per active campaign showing the member's role or "--" if not a member. Each row has an "Add to Campaign" ghost button.
- **AddToCampaignDialog** - Dialog showing available campaigns (filtered to exclude those the member already belongs to) with checkboxes and per-campaign role select dropdowns. Calls `useAddMemberToCampaign` for each selection.
- **Members page** (`/org/members`) - Route page with loading skeleton (5 rows), empty state ("No members"), and the role matrix table with dialog integration.

### Task 2: Org Settings Page (4635eb9)

Created two components for org settings:

- **DangerZone** - Card with destructive border-left, containing disabled "Transfer Ownership" and "Delete Organization" buttons with "Coming soon" tooltips. Follows the campaign settings danger zone visual pattern.
- **Settings page** (`/org/settings`) - Route page with editable org name (org_owner only, read-only with muted styling for others), read-only ZITADEL org ID with mono font and help text, "Save Changes" button with dirty tracking and loading spinner, and the DangerZone component below.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compilation passes (`tsc --noEmit` returns clean)
- All acceptance criteria met for both tasks
- All files created at specified paths with required exports and content

## Self-Check: PASSED

All 5 created files verified on disk. Both commit hashes (5324f3f, 4635eb9) found in git log.
