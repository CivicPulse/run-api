---
phase: 92-two-way-sms-opt-out-handling
plan: "04"
subsystem: sms-messages-ui
tags: [react, tanstack-query, phone-banking, shadcn, sms]
dependency_graph:
  requires: [92-02, 92-03]
  provides: [messages-route, composer-ui, bulk-send-sheet]
  affects: [phone-banking-navigation, campaign-messages-workflow]
tech_stack:
  added: [react, tanstack-query]
  patterns: [two-pane-inbox-layout, inline-compliance-banner, queued-job-status-card]
key_files:
  created:
    - web/src/types/sms.ts
    - web/src/hooks/useSmsInbox.ts
    - web/src/hooks/useSmsSend.ts
    - web/src/components/field/SmsConversationList.tsx
    - web/src/components/field/SmsThreadPanel.tsx
    - web/src/components/field/SmsEligibilityBanner.tsx
    - web/src/components/field/SmsComposer.tsx
    - web/src/components/field/SmsBulkSendSheet.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/messages.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx
  modified:
    - web/src/routes/campaigns/$campaignId/phone-banking.tsx
    - web/src/routeTree.gen.ts
decisions:
  - "SMS lives inside the existing phone-banking module as a Messages route, not a new top-level area"
  - "Blocked eligibility states are explained inline in the composer instead of relying on toast-only errors"
  - "Bulk send reflects queued background work via a local status card after submission"
metrics:
  completed: "2026-04-07T23:57:00Z"
  files_created: 10
  files_modified: 2
---

# Phase 92 Plan 04: Messages UI Summary

Built the operator-facing Messages surface inside phone banking:

- Added a `Messages` module nav entry and a campaign Messages route with a responsive list/thread layout.
- Added inbox/detail hooks, conversation/thread presentation, inline eligibility bannering, a sticky composer, and a bulk-send sheet.
- Added route-level tests covering list/detail rendering, blocked eligibility states, and bulk-send queue behavior.

## Verification

- `cd web && npx vitest run src/routes/campaigns/\$campaignId/phone-banking/messages.test.tsx`
- Result: passed

## Outcome

Plan 04 completed. Campaign staff now have an inbox, thread view, send composer, and bulk-send launch point inside the existing phone-banking workflow.
