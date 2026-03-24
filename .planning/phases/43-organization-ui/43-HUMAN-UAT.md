---
status: partial
phase: 43-organization-ui
source: [43-VERIFICATION.md]
started: 2026-03-24T21:35:00Z
updated: 2026-03-24T21:35:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Org switcher — single org displays as plain text
expected: If user belongs to one org, header shows org name as non-clickable text (not a dropdown)
result: [pending]

### 2. Archive flow — campaign moves to archived section
expected: After confirming archive in dialog, campaign card moves from active grid to collapsed Archived section, toast 'X archived.' appears
result: [pending]

### 3. RequireOrgRole gate — Create Campaign button hidden for non-admin
expected: User with no org role does not see the Create Campaign button on the org dashboard
result: [pending]

### 4. PATCH /org org_owner gating — non-owner cannot edit name
expected: User with org_admin role sees the name input as read-only (bg-muted, no Save button)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
