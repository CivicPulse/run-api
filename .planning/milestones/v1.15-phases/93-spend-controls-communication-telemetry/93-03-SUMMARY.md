---
phase: 93-spend-controls-communication-telemetry
plan: "03"
subsystem: spend-controls-ui
tags: [react, tanstack-query, org-settings, phone-banking]
dependency_graph:
  requires: [93-02]
  provides: [org-spend-card, inline-budget-banners]
  affects: [org-settings, phone-banking-messages, phone-banking-calls]
tech_stack:
  added: [react, vitest]
  patterns: [compact-admin-card, inline-warning-banner, shared-budget-summary]
key_files:
  created: []
  modified:
    - web/src/types/org.ts
    - web/src/types/sms.ts
    - web/src/types/voice.ts
    - web/src/hooks/useSmsSend.ts
    - web/src/hooks/useVoiceCapability.ts
    - web/src/routes/org/settings.tsx
    - web/src/routes/org/settings.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/messages.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx
    - web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.test.tsx
metrics:
  completed: "2026-04-08T01:38:00Z"
  files_created: 0
  files_modified: 11
---

# Phase 93 Plan 03: Spend UI Summary

Delivered the operator-facing spend surface:

- Added a compact `Twilio Spend & Telemetry` card to org settings with threshold controls and recent activity.
- Added inline phone-banking budget banners for Messages and Active Calling so near-limit and over-limit states are visible before action attempts.
- Updated route tests to cover the changed org settings and phone-banking contracts.

## Verification

- `cd web && npm test -- src/routes/org/settings.test.tsx src/routes/campaigns/\$campaignId/phone-banking/messages.test.tsx src/routes/campaigns/\$campaignId/phone-banking/sessions/\$sessionId/call.test.tsx`
- Result: passed

## Outcome

Plan 03 completed. Org admins can manage Twilio spend policy, and staff now see budget state inline where they initiate calls and messages.
