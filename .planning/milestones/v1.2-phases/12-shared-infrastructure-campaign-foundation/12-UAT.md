---
status: complete
phase: 12-shared-infrastructure-campaign-foundation
source: 12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md
started: 2026-03-12T14:00:00Z
updated: 2026-03-12T15:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Settings Gear Icon Visibility
expected: Navigate to a campaign. In the sidebar, you should see a gear icon at the bottom. This gear icon should only be visible if you are logged in as an admin or owner.
result: pass

### 2. Campaign Settings General Tab
expected: Click the settings gear icon. You should see a settings page with a vertical sidebar nav showing General, Members, and Danger Zone. The General tab should show an edit form with campaign name and description fields. Editing a field should enable a Save button. Navigating away with unsaved changes should show a confirmation dialog.
result: pass

### 3. Campaign Settings Members Tab
expected: Click the Members tab in settings. You should see a list of current campaign members with role badges, a kebab menu per member for changing roles and removing (except the owner row which has no kebab), and a Pending Invites section with an "Invite member" button (admin+ only). Clicking Invite opens a dialog with email and role fields.
result: pass

### 4. Campaign Settings Danger Zone
expected: Click Danger Zone tab. You should see two destructive-styled cards: "Delete Campaign" (requires typing the campaign name to confirm) and "Transfer Ownership" (shows admin member selector, then a confirmation dialog). Both sections should only be visible to the owner role.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
