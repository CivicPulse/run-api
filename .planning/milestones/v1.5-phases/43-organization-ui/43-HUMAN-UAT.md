---
status: resolved
phase: 43-organization-ui
source: [43-VERIFICATION.md]
started: 2026-03-24T21:35:00Z
updated: 2026-03-24T23:30:00Z
---

## Current Test

[all items automated via Playwright E2E specs]

## Tests

### 1. Org switcher — single org displays as plain text
expected: If user belongs to one org, header shows org name as non-clickable text (not a dropdown)
result: automated — `web/e2e/org-switcher.spec.ts` verifies plain text span and absence of dropdown chevron

### 2. Archive flow — campaign moves to archived section
expected: After confirming archive in dialog, campaign card moves from active grid to collapsed Archived section, toast 'X archived.' appears
result: automated — `web/e2e/campaign-archive.spec.ts` exercises full three-dot menu → confirm → toast → archived section flow

### 3. RequireOrgRole gate — Create Campaign button hidden for non-admin
expected: User with no org role does not see the Create Campaign button on the org dashboard
result: automated — `web/e2e/role-gated.volunteer.spec.ts` test 2 uses volunteer auth (no org role) and asserts button not visible

### 4. PATCH /org org_owner gating — non-owner cannot edit name
expected: User with org_admin role sees the name input as read-only (bg-muted, no Save button)
result: automated — `web/e2e/role-gated.orgadmin.spec.ts` test 1 uses orgadmin auth and verifies readonly, bg-muted, no Save

## Summary

total: 4
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 0
automated: 4

## Gaps
