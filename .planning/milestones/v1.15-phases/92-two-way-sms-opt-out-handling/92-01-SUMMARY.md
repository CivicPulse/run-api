---
phase: 92-two-way-sms-opt-out-handling
plan: "01"
subsystem: sms-domain-foundation
tags: [twilio, sms, sqlalchemy, alembic, rls]
dependency_graph:
  requires: [90-02]
  provides: [sms-domain-models, sms-service-foundation, sms-schemas]
  affects: [campaign-sms-storage, eligibility-checks]
tech_stack:
  added: [alembic, sqlalchemy, pydantic]
  patterns: [campaign-scoped-rls, org-scoped-opt-out-memory, immutable-message-log]
key_files:
  created:
    - alembic/versions/033_sms_domain_foundation.py
    - app/models/sms_conversation.py
    - app/models/sms_message.py
    - app/models/sms_opt_out.py
    - app/schemas/sms.py
    - app/services/sms.py
    - tests/unit/test_sms_models_schemas.py
    - tests/unit/test_sms_service.py
  modified:
    - app/db/base.py
    - app/models/__init__.py
    - app/models/voter_contact.py
decisions:
  - "SMS conversation state is campaign-scoped, while SMS opt-out memory is org-scoped and channel-specific"
  - "VoterPhone.sms_allowed is the explicit eligibility signal; imported phone numbers alone are not textable"
  - "Conversations denormalize unread count and latest-message state so the inbox can query cheaply"
metrics:
  completed: "2026-04-07T20:58:00Z"
  files_created: 8
  files_modified: 3
---

# Phase 92 Plan 01: SMS Domain Foundation Summary

Created the storage and service foundation for campaign SMS:

- Added `sms_conversations`, `sms_messages`, and `sms_opt_outs` with campaign RLS on conversation/message tables and org-scoped opt-out storage.
- Added SQLAlchemy models, SMS API schemas, and the initial `SMSService` helpers for normalization, eligibility, sender resolution, conversation upsert, immutable message recording, and opt-out synchronization.
- Extended `VoterPhone` with `sms_allowed` so consent is explicit in the data model.
- Added focused unit coverage for the schema/model layer and the core service methods.

## Verification

- `uv run pytest tests/unit/test_sms_models_schemas.py tests/unit/test_sms_service.py -q`
- Result: passed

## Outcome

Plan 01 completed. Later plans now have durable SMS storage, eligibility checks, and conversation state to build on.
