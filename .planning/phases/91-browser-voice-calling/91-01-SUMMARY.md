---
phase: 91-browser-voice-calling
plan: 01
subsystem: voice-calling-data-foundation
tags: [twilio, voice, models, migration, service, rls]
dependency_graph:
  requires: []
  provides: [call_records-table, CallRecord-model, VoiceService, VoiceCredentials, voice-schemas]
  affects: [app/models/campaign.py, app/models/organization.py, app/services/twilio_config.py]
tech_stack:
  added: [twilio.jwt.access_token]
  patterns: [fernet-encryption, rls-policy, timezone-aware-compliance]
key_files:
  created:
    - alembic/versions/032_call_records_and_voice_config.py
    - app/models/call_record.py
    - app/schemas/voice.py
    - app/services/voice.py
    - tests/unit/test_voice_models_schemas.py
    - tests/unit/test_voice_service.py
  modified:
    - app/models/__init__.py
    - app/models/campaign.py
    - app/models/organization.py
    - app/services/twilio_config.py
decisions:
  - Used Twilio AccessToken with VoiceGrant for browser dialer token generation
  - API Key secrets use same Fernet keyring as auth tokens for encryption at rest
  - Calling hours check is timezone-aware using ZoneInfo with campaign-specific timezone
metrics:
  duration: 4m9s
  completed: "2026-04-07T22:41:18Z"
---

# Phase 91 Plan 01: Voice Calling Data Foundation Summary

Database migration, models, schemas, and service layer for browser voice calling with Twilio Access Token generation, calling hours and DNC compliance checks, and call record CRUD.

## What Was Built

### Migration (032_call_records_and_voice_config)
- `call_records` table with UUID PK, campaign_id FK (CASCADE), twilio_sid (unique partial index), voter_id, caller_user_id, phone_bank_session_id, direction, from/to numbers, status, duration, price, timestamps
- RLS policy `call_records_isolation` using `app.current_campaign_id` session var
- Composite indexes on (campaign_id, voter_id, created_at) and (campaign_id, caller_user_id, created_at)
- 4 new columns on organizations: twilio_api_key_sid, twilio_api_key_secret_encrypted, twilio_api_key_secret_key_id, twilio_twiml_app_sid
- 3 new columns on campaigns: calling_hours_start (TIME default 09:00), calling_hours_end (TIME default 21:00), calling_hours_timezone (VARCHAR default America/New_York)

### Models
- `CallRecord` SQLAlchemy model with all migration columns
- Campaign model extended with calling hours fields
- Organization model extended with API key credential fields

### Schemas
- `VoiceTokenResponse` -- JWT token for Twilio Client SDK
- `CallRecordRead` -- full call record serialization
- `CallingHoursCheck` -- compliance result with window details
- `DNCCheckResult` -- pre-call DNC check result
- `VoiceCapabilityResponse` -- org readiness for browser calling

### TwilioConfigService Extensions
- `VoiceCredentials` dataclass (account_sid, api_key_sid, api_key_secret, twiml_app_sid)
- `encrypt_api_key_secret()` / `decrypt_api_key_secret()` using Fernet keyring
- `voice_credentials_for_org()` resolver

### VoiceService
- `generate_voice_token()` -- creates Twilio AccessToken with VoiceGrant
- `check_calling_hours()` -- timezone-aware window check
- `check_dnc()` -- delegates to DNCService
- `create_call_record()` -- inserts new record
- `update_call_record_from_webhook()` -- idempotent upsert by twilio_sid
- `check_voice_capability()` -- checks credentials + voice-capable phone numbers

## Test Results

19 tests total, all passing:
- 9 model/schema tests (test_voice_models_schemas.py)
- 10 service tests (test_voice_service.py)

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | d8b8810 | Failing tests for models and schemas |
| 1 (GREEN) | ec3d16d | Migration, models, schemas implementation |
| 2 (RED) | c815152 | Failing tests for VoiceService |
| 2 (GREEN) | 63e5e08 | VoiceService implementation |

## Threat Mitigations Applied

- **T-91-01 (Information Disclosure)**: API key secrets encrypted via Fernet keyring; `encrypt_api_key_secret`/`decrypt_api_key_secret` follow same pattern as auth token encryption
- **T-91-02 (Elevation of Privilege)**: RLS policy `call_records_isolation` enforces campaign-scoped access via `app.current_campaign_id` session variable
- **T-91-03 (Tampering)**: `update_call_record_from_webhook` is the only status mutation path; designed for server-side webhook use only

## Self-Check: PASSED
