---
phase: 90-webhook-security-routing-infrastructure
plan: 02
subsystem: webhook-security-routing
tags: [twilio, webhooks, security, signature-validation, idempotency]
dependency_graph:
  requires: [90-01]
  provides: [verify_twilio_signature, resolve_org_from_phone, check_idempotency, webhook_router]
  affects: [app/api/v1/router.py]
tech_stack:
  added: [twilio.request_validator]
  patterns: [fastapi-dependency-chain, on-conflict-do-nothing-idempotency, server-side-url-reconstruction]
key_files:
  created:
    - app/services/twilio_webhook.py
    - app/api/v1/webhooks.py
    - tests/unit/test_twilio_webhook.py
  modified:
    - app/api/v1/router.py
decisions:
  - URL reconstruction uses server-side webhook_base_url, never request.url, to prevent Host header HMAC bypass (T-90-05)
  - Org resolution tries To param first, falls back to Called param, for both voice and SMS webhook compatibility
  - Idempotency returns bool (is_duplicate) rather than raising, letting handlers decide response behavior
metrics:
  duration_seconds: 258
  completed: "2026-04-07T21:43:23Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 12
  files_created: 3
  files_modified: 1
---

# Phase 90 Plan 02: Webhook Security & Routing Infrastructure Summary

Twilio webhook service layer with HMAC signature validation against server-side URL, phone-number-to-org resolution via OrgPhoneNumber lookup, and SID-based idempotency using ON CONFLICT DO NOTHING.

## What Was Built

### Webhook Service (`app/services/twilio_webhook.py`)

Three composable functions forming the security and routing foundation for all Twilio webhook endpoints:

- **`verify_twilio_signature`** -- FastAPI dependency that validates the `X-Twilio-Signature` HMAC-SHA1 using the resolved org's decrypted auth token. Reconstructs the public URL from `settings.webhook_base_url` (server-side) to prevent Host header bypass attacks.
- **`resolve_org_from_phone`** -- FastAPI dependency that extracts the `To` or `Called` phone number from form data, looks up the owning org via `OrgPhoneNumber`, and returns the `Organization` model.
- **`check_idempotency`** -- Callable function (not a dependency) that uses `INSERT ... ON CONFLICT DO NOTHING` on the `(provider_sid, event_type)` unique constraint to detect duplicate webhook deliveries.

### Webhook Router (`app/api/v1/webhooks.py`)

Three placeholder endpoints mounted at `/api/v1/webhooks/twilio/`:

| Endpoint | Purpose | Phase |
|----------|---------|-------|
| `POST /voice/status` | Voice call status callbacks | Phase 91 |
| `POST /sms/inbound` | Inbound SMS messages | Phase 92 |
| `POST /sms/status` | Outbound SMS delivery status | Phase 92 |

All routes gated by `verify_twilio_signature` dependency and rate-limited at 120/minute per IP.

### Unit Tests (`tests/unit/test_twilio_webhook.py`)

12 tests covering:
- URL reconstruction (base URL, query strings, trailing slash handling)
- Signature validation (missing header, invalid HMAC, unconfigured org)
- Org resolution (To param, Called fallback, unknown number 404)
- Idempotency (new event, duplicate detection, same SID different type)

## Threat Mitigations Implemented

| Threat ID | Mitigation |
|-----------|------------|
| T-90-04 | `verify_twilio_signature` validates HMAC-SHA1 using org-specific auth token |
| T-90-05 | URL reconstructed from `settings.webhook_base_url`, never from `request.url` |
| T-90-06 | `webhook_events` table logs provider_sid, event_type, org_id for audit |
| T-90-07 | Phone-to-org resolution isolates auth token lookup per org |
| T-90-08 | 120/minute IP-based rate limiting on all webhook routes |
| T-90-09 | `check_idempotency` with UNIQUE constraint + ON CONFLICT DO NOTHING |

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | cbbe2fa | Failing tests for webhook service |
| 1 (GREEN) | 67ab5f7 | Implement webhook service with signature validation, org resolution, idempotency |
| 2 | c4b962f | Add webhook router with placeholder endpoints and mount |

## Self-Check: PASSED

All 3 created files exist. All 3 commits verified. 12/12 tests passing. Lint and format clean.
