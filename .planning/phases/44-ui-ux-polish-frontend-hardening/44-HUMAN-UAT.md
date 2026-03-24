---
status: partial
phase: 44-ui-ux-polish-frontend-hardening
source: [44-VERIFICATION.md]
started: 2026-03-24T23:00:00Z
updated: 2026-03-24T23:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Sidebar slide-over behavior (UX-01)
expected: Sidebar overlays content (does not push) when toggled. Content uses full viewport width when sidebar is hidden. New users see sidebar hidden by default.
result: [pending]

### 2. Error boundary Card fallback (OBS-05)
expected: Throwing an error in any campaign or org route renders the Card-based fallback with AlertTriangle icon, "Something went wrong" title, "Try Again" button, and "Go to Dashboard" link.
result: [pending]

### 3. Volunteer toggle — manager view (UX-02)
expected: As a user with manager role, the volunteer registration form shows a "Volunteer Type" radio group with "Add volunteer record" and "Invite to app" options. Selecting "Invite to app" shows the Alert info banner about email invitation.
result: [pending]

### 4. Volunteer toggle — non-manager view (UX-02)
expected: As a user with volunteer role (non-manager), the radio toggle is NOT visible. Form shows only essential fields.
result: [pending]

### 5. Tooltip popover interaction (UX-03, UX-04)
expected: Clicking the HelpCircle icon next to turf name, role selector, import mapping, campaign type, and org settings opens a popover with contextual hint text. Popover closes on click-outside.
result: [pending]

### 6. Skeleton loading visual quality (OBS-07)
expected: Campaign dashboard, shift list, and settings general pages show layout-matching skeletons (not a spinner) during initial data fetch. Skeletons match the shape of the content that will appear.
result: [pending]

### 7. Empty state appearance on all list pages (OBS-06)
expected: Navigating to any list page on an empty campaign shows a meaningful empty state with an icon, title, and description. No blank tables or generic "No data" text appears.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
