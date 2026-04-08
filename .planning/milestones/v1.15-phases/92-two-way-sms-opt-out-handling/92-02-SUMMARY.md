---
phase: 92-two-way-sms-opt-out-handling
plan: "02"
subsystem: sms-outbound-api
tags: [twilio, sms, fastapi, procrastinate]
dependency_graph:
  requires: [92-01]
  provides: [campaign-sms-routes, bulk-sms-queue, outbound-twilio-send]
  affects: [campaign-phone-banking-api]
tech_stack:
  added: [fastapi, procrastinate]
  patterns: [campaign-scoped-routes, queued-bulk-work, structured-compliance-errors]
key_files:
  created:
    - app/api/v1/sms.py
    - app/tasks/sms_tasks.py
    - tests/unit/test_sms_api.py
  modified:
    - app/api/v1/router.py
    - app/tasks/procrastinate_app.py
    - app/schemas/sms.py
    - app/services/sms.py
    - tests/unit/test_sms_service.py
decisions:
  - "Single-send and bulk-send both reuse SMSService so compliance checks stay identical across request and worker paths"
  - "Bulk sends are queued per eligible voter phone and return immediately with job metadata"
  - "Blocked recipients fail fast with machine-readable reason fields instead of silent skips"
metrics:
  completed: "2026-04-07T21:21:00Z"
  files_created: 3
  files_modified: 5
---

# Phase 92 Plan 02: Outbound SMS Backend Summary

Built the campaign-scoped outbound SMS backend:

- Added `POST /campaigns/{id}/sms/send`, `POST /campaigns/{id}/sms/bulk-send`, list/detail inbox endpoints, and mark-read support.
- Wired router registration and Procrastinate task imports so bulk SMS jobs can queue in the background.
- Extended `SMSService` with Twilio-backed single-send and batch-send helpers that persist `twilio_message_sid`, blocked states, and failure details.
- Added unit coverage for the API routes and worker-facing send behavior.

## Verification

- `uv run pytest tests/unit/test_sms_api.py tests/unit/test_sms_service.py -q`
- Result: passed

## Outcome

Plan 02 completed. Campaign staff now have backend endpoints for individual SMS, bulk queueing, inbox reads, and read-state updates.
