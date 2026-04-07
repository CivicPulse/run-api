---
phase: 90-webhook-security-routing-infrastructure
plan: 01
subsystem: webhook-data-foundation
tags: [twilio, webhooks, idempotency, migration, schema]
dependency_graph:
  requires: []
  provides: [webhook_events_table, webhook_event_model, webhook_schemas, webhook_base_url_config, phone_number_unique_index]
  affects: [app/models/__init__.py, app/core/config.py]
tech_stack:
  added: []
  patterns: [org-scoped-table-without-rls, idempotency-via-unique-constraint]
key_files:
  created:
    - alembic/versions/031_webhook_events.py
    - app/models/webhook_event.py
    - app/schemas/webhook.py
  modified:
    - app/models/__init__.py
    - app/core/config.py
decisions:
  - "webhook_events is org-scoped, not campaign-scoped -- no RLS needed (SEC-04 satisfied by design)"
  - "Phone number uniqueness enforced globally across orgs via unique index"
metrics:
  duration: 82s
  completed: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Phase 90 Plan 01: Webhook Data Foundation Summary

Alembic migration, SQLAlchemy model, Pydantic schema, and config setting establishing the data layer for Twilio webhook idempotency and org-safe phone number routing.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration for webhook_events table and phone_number unique index | 7577bcb | alembic/versions/031_webhook_events.py |
| 2 | WebhookEvent model, webhook schemas, and config setting | cec3c95 | app/models/webhook_event.py, app/schemas/webhook.py, app/models/__init__.py, app/core/config.py |

## What Was Built

1. **webhook_events migration** (031_webhook_events.py): Creates the idempotency table with `uq_webhook_events_sid_type` unique constraint on (provider_sid, event_type), org_id FK to organizations, indexes on created_at and org_id, and GRANT to app_user. Also adds `ix_org_phone_numbers_phone_unique` unique index on org_phone_numbers.phone_number.

2. **WebhookEvent model**: SQLAlchemy model mirroring the migration schema with UUID PK, provider_sid (String 64), event_type (String 50), org_id FK, optional JSON payload_summary, and server-defaulted created_at.

3. **WebhookEventRead schema**: Pydantic read schema with from_attributes for ORM compatibility.

4. **webhook_base_url config**: Added to Settings class, defaults to `http://localhost:8000`, used by downstream phases for Twilio request signature validation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed VoterSearchRecord missing from __all__**
- **Found during:** Task 2
- **Issue:** VoterSearchRecord was imported in models/__init__.py but not listed in __all__, causing ruff F401
- **Fix:** Added "VoterSearchRecord" to __all__ list
- **Files modified:** app/models/__init__.py
- **Commit:** cec3c95

## Verification

- Migration file parses without errors (verified via importlib exec)
- Model and schema imports succeed (`from app.models.webhook_event import WebhookEvent` etc.)
- `webhook_base_url` defaults to `http://localhost:8000`
- `uv run ruff check` passes on all new/modified files

## Security Notes

- webhook_events is org-scoped (org_id FK), not campaign-scoped -- no RLS policy needed (SEC-04)
- uq_webhook_events_sid_type prevents duplicate event processing at DB level (T-90-02)
- ix_org_phone_numbers_phone_unique prevents cross-org phone sharing (T-90-03)

## Self-Check: PASSED

- All 4 created/modified files verified on disk
- Both task commits (7577bcb, cec3c95) found in git log
