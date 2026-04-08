---
phase: 91-browser-voice-calling
plan: 02
subsystem: voice-calling-api-layer
tags: [twilio, voice, api, twiml, webhook, compliance]
dependency_graph:
  requires: [call_records-table, CallRecord-model, VoiceService, VoiceCredentials, voice-schemas]
  provides: [voice-token-endpoint, twiml-handler, voice-status-webhook, voice-capability-endpoint]
  affects: [app/api/v1/router.py, app/api/v1/webhooks.py]
tech_stack:
  added: [twilio.twiml.voice_response]
  patterns: [direct-handler-unit-testing, form-data-webhook-parsing, twiml-xml-generation]
key_files:
  created:
    - app/api/v1/voice.py
    - tests/unit/test_voice_api.py
  modified:
    - app/api/v1/router.py
    - app/api/v1/webhooks.py
decisions:
  - TwiML endpoint does not use verify_twilio_signature because the To number is the voter (not our number), so resolve_org_from_phone would fail; instead uses CampaignId connect param for context
  - Unit tests call endpoint handler functions directly with mocked arguments instead of TestClient to avoid FastAPI dependency injection complexity with require_role closures
  - Rate limiter disabled at module level in test file since handler functions bypass Starlette Request validation
metrics:
  duration: 8m28s
  completed: "2026-04-07T22:52:32Z"
---

# Phase 91 Plan 02: Voice Calling API Layer Summary

API endpoints for browser voice calling: token generation, TwiML voice URL handler, compliance checks, and voice status webhook processing connecting the frontend Twilio Device to VoiceService infrastructure.

## What Was Built

### Voice API Endpoints (app/api/v1/voice.py)

**Campaign-scoped routes (require auth, volunteer+ role):**
- `POST /campaigns/{id}/voice/token` -- Generates Twilio Access Token for browser dialer; returns 404 when org unconfigured
- `GET /campaigns/{id}/voice/capability` -- Checks org readiness (credentials + voice-capable numbers)
- `GET /campaigns/{id}/voice/calling-hours` -- Returns current calling hours compliance status
- `POST /campaigns/{id}/voice/dnc-check` -- Pre-call DNC list check for a phone number

**Twilio-facing route:**
- `POST /voice/twiml` -- TwiML voice URL handler returning Dial XML; validates CampaignId param, checks calling hours and DNC server-side before dialing; creates initial call_record; resolves caller ID from org's default voice number

### Webhook Handler (app/api/v1/webhooks.py)
- Replaced empty placeholder `voice_status_callback` with real implementation
- Parses CallSid, CallStatus, CallDuration from Twilio form data
- Idempotency via `check_idempotency` on webhook_events table
- Maps terminal statuses (completed, busy, no-answer, failed, canceled) with ended_at timestamp
- Updates call_records via `VoiceService.update_call_record_from_webhook`

### Router Registration (app/api/v1/router.py)
- Campaign-scoped voice routes under `/campaigns` prefix
- TwiML route under `/voice` prefix

## Test Results

23 tests total, all passing:
- 7 voice API endpoint tests (test_voice_api.py, Task 1)
- 6 webhook status tests including 4 parametrized terminal statuses (test_voice_api.py, Task 2)
- 10 voice service tests (test_voice_service.py, from Plan 01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TwiML endpoint cannot use verify_twilio_signature**
- **Found during:** Task 1
- **Issue:** The existing `verify_twilio_signature` resolves org from the `To` phone number, but in TwiML handler the `To` is the voter's number (not our org number). The dependency would always 404.
- **Fix:** TwiML endpoint uses `CampaignId` connect parameter from frontend for campaign context resolution instead of webhook signature validation. This is consistent with the plan's T-91-09 mitigation.
- **Files modified:** app/api/v1/voice.py

**2. [Rule 3 - Blocking] Unit tests required direct handler invocation**
- **Found during:** Task 1
- **Issue:** FastAPI's `require_role` captures dependency closures at route definition time, making `dependency_overrides` insufficient for TestClient-based tests without a full app bootstrap.
- **Fix:** Tests call endpoint handler functions directly as async functions with mocked arguments, bypassing dependency injection entirely. Rate limiter disabled at module level in test file.
- **Files modified:** tests/unit/test_voice_api.py

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | 8090bce | Failing tests for voice API endpoints |
| 1 (GREEN) | 377185d | Voice token, TwiML, capability, compliance endpoints + router |
| 2 (RED) | 968b0b3 | Failing tests for webhook status callback |
| 2 (GREEN) | 90543d6 | Webhook handler implementation with call record updates |

## Threat Mitigations Applied

- **T-91-04 (Spoofing)**: Webhook voice/status endpoint retains `verify_twilio_signature` for Twilio HMAC validation
- **T-91-05 (Tampering)**: TwiML handler performs server-side DNC and calling hours checks before generating Dial XML
- **T-91-06 (Elevation of Privilege)**: Token endpoint requires authenticated user with campaign membership via `require_role("volunteer")`
- **T-91-07 (Denial of Service)**: Token endpoint rate-limited 10/min per user; TwiML route 60/min per IP
- **T-91-09 (Tampering CampaignId)**: CampaignId from connect params resolved to campaign+org in TwiML handler; malformed/invalid UUIDs return hangup TwiML

## Self-Check: PASSED
