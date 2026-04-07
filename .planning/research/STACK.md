# Stack Research -- Twilio Communications

**Project:** CivicPulse Run v1.15
**Researched:** 2026-04-07
**Overall confidence:** HIGH

## New Dependencies

### Backend (Python)

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `twilio` | `>=9.10.4` | Twilio REST API client, Access Token generation, webhook validation, TwiML generation | Official helper library. Includes `twilio.rest.Client` for Messaging/Lookup API calls, `twilio.jwt.access_token` for Voice SDK token generation, `twilio.request_validator.RequestValidator` for webhook signature verification, and `twilio.twiml` for TwiML response building. Native async support via `AsyncTwilioHttpClient` (uses aiohttp internally). Single dependency covers all five Twilio integration surfaces. |
| `cryptography` | `>=44.0.0` | Fernet symmetric encryption for org-scoped Twilio credentials at rest | Auth Tokens and API Key Secrets stored in PostgreSQL must be encrypted. Fernet (AES-128-CBC + HMAC-SHA256) provides authenticated encryption with a single `CREDENTIAL_ENCRYPTION_KEY` env var. No external KMS needed at current scale. Already a transitive dependency of `authlib` so no new wheel to build. |

No other new backend packages required. The `twilio` package bundles:
- REST client (sync + async) for Voice, Messaging, Lookup v2 APIs
- `AccessToken` + `VoiceGrant` classes for browser SDK token minting
- `RequestValidator` for webhook X-Twilio-Signature verification
- TwiML builder (`VoiceResponse`, `MessagingResponse`) for webhook responses

### Frontend (TypeScript/React)

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@twilio/voice-sdk` | `^2.18.1` | Browser WebRTC calling via Twilio Voice | Official Twilio Voice JS SDK. Provides `Device` (manages WebRTC connection) and `Call` (represents an active call with mute/hangup/DTMF). Replaces `tel:` links with in-browser calling on desktop; mobile can still fall back to `tel:`. Full TypeScript types included. v1.x is EOL (April 2025); v2.x is the only supported line. |

No other new frontend packages required. The Voice SDK is self-contained (bundles its own WebRTC handling). SMS UI is purely API-driven via existing `ky` + TanStack Query patterns.

## Key Integration Points

### 1. Access Token Endpoint (Voice SDK auth)

The browser Voice SDK requires a short-lived JWT (Access Token) with a VoiceGrant. New FastAPI endpoint:

```
POST /api/v1/campaigns/{campaign_id}/twilio/voice-token
```

Backend flow:
1. Load org's Twilio API Key SID + API Key Secret (decrypted from DB)
2. Create `AccessToken(account_sid, api_key_sid, api_key_secret, identity=user_id)`
3. Add `VoiceGrant(outgoing_application_sid=twiml_app_sid)`
4. Return `token.to_jwt()` with 10-minute TTL

Frontend fetches this token, passes it to `new Device(token)`, then calls `device.connect()` to initiate WebRTC calls.

**Critical:** Use Twilio API Keys (Standard type), not the master Auth Token, for Access Token signing. API Keys can be revoked per-org without compromising the entire Twilio account.

### 2. TwiML Application Webhook

When `device.connect({To: '+1234567890'})` fires, Twilio POSTs to a configured TwiML Application URL:

```
POST /api/v1/webhooks/twilio/voice  (public, validated by X-Twilio-Signature)
```

Returns TwiML:
```xml
<Response><Dial callerId="+1orgNumber"><Number>+1234567890</Number></Dial></Response>
```

### 3. Twilio Messaging API (SMS)

Outbound SMS uses the Twilio REST client with async methods:

```python
from twilio.http.async_http_client import AsyncTwilioHttpClient
from twilio.rest import Client

async_http = AsyncTwilioHttpClient()
client = Client(account_sid, auth_token, http_client=async_http)
message = await client.messages.create_async(
    body="Your message",
    from_=org_twilio_number,
    to=voter_phone,
    status_callback="https://api.civpulse.org/api/v1/webhooks/twilio/sms-status"
)
```

Inbound SMS and delivery status updates arrive via webhook endpoints.

### 4. Twilio Lookup v2 API

Number validation on voter contact create/edit:

```python
phone_number = await client.lookups.v2.phone_numbers(e164).fetch_async(
    fields="line_type_intelligence"
)
# Returns: line_type_intelligence.type = "mobile" | "landline" | "fixedVoip" | ...
```

Cache results in voter contact records (line_type, carrier columns) to avoid repeated paid lookups.

### 5. Webhook Signature Validation

All Twilio webhook endpoints must validate the `X-Twilio-Signature` header:

```python
from twilio.request_validator import RequestValidator

validator = RequestValidator(auth_token)
is_valid = validator.validate(url, params, signature)
```

Implement as a FastAPI dependency (`Depends(verify_twilio_signature)`) applied to all `/webhooks/twilio/*` routes. These routes are public (no JWT auth) but cryptographically verified.

**Gotcha:** The validator needs the exact public URL Twilio sees (including protocol, host, port). Behind a reverse proxy (Traefik), reconstruct from `X-Forwarded-*` headers or configure a canonical webhook base URL in settings.

### 6. Org-Scoped Credential Storage

New `twilio_configs` table linked to `organizations.id`:

| Column | Type | Notes |
|--------|------|-------|
| org_id | UUID FK | One config per org |
| account_sid | VARCHAR | Not encrypted (not secret per Twilio docs) |
| auth_token_encrypted | BYTEA | Fernet-encrypted |
| api_key_sid | VARCHAR | For Access Token generation |
| api_key_secret_encrypted | BYTEA | Fernet-encrypted |
| twiml_app_sid | VARCHAR | Voice TwiML Application SID |
| phone_numbers | JSONB | Array of provisioned numbers with capabilities |
| daily_spend_limit_cents | INTEGER | Platform-enforced soft limit |
| total_spend_limit_cents | INTEGER | Platform-enforced soft limit |

Encryption: single `CREDENTIAL_ENCRYPTION_KEY` env var (Fernet key), loaded at startup. Decrypt only when making Twilio API calls.

### 7. Existing Code Touch Points

| File | Change |
|------|--------|
| `web/src/components/field/PhoneNumberList.tsx` | Add WebRTC call button alongside existing `tel:` link; conditionally render based on Twilio config availability |
| `app/api/v1/phone_banks.py` | Add call metadata recording endpoints |
| `app/models/organization.py` | Add relationship to `twilio_configs` table |
| `app/core/config.py` | Add `CREDENTIAL_ENCRYPTION_KEY` and `TWILIO_WEBHOOK_BASE_URL` settings |

## What NOT to Add

| Avoid | Why | Do Instead |
|-------|-----|------------|
| Twilio Conversations API | Designed for long-lived chat sessions with participant management; campaign SMS is transactional send-and-log | Use Messaging API directly |
| Separate webhook microservice | Webhook volume bounded by campaign activity (hundreds/day); a few FastAPI routes suffice | Add routes to existing API with signature validation dependency |
| WebSocket infrastructure for call state | `@twilio/voice-sdk` manages call state client-side via event emitters (`Device.on`, `Call.on`) | Thin React wrapper around SDK events |
| Per-org env var credentials | Does not scale to multi-tenant; cannot add/remove orgs without restart | Encrypted database storage with Fernet |
| Twilio phone number provisioning API | v1.15 scope is BYO numbers + manual config; programmatic purchasing is premature | Manual number entry in org settings UI |
| Custom dialer UI | Voice SDK `Device` and `Call` handle WebRTC, audio device selection, call state | Build thin wrapper around SDK events |
| Master Auth Token for Access Tokens | Account-wide, cannot be scoped or independently revoked | API Keys (Standard type) for all token generation |
| `twilio-python-async` (community) | Deprecated; official SDK now has native async | Use official `twilio` package with `AsyncTwilioHttpClient` |
| Redis for SMS queue | Procrastinate (already in stack) handles async jobs via PostgreSQL | Use existing Procrastinate worker for bulk SMS sends |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Python Twilio client | `twilio` (official) | `twilio-python-async` (community) | Deprecated; official SDK has native async |
| Browser calling | `@twilio/voice-sdk` v2 | `twilio-client` (v1) | v1 EOL April 2025; unsupported |
| Credential encryption | `cryptography` (Fernet) | `pgcrypto` extension | App-layer encryption keeps secrets opaque in DB dumps and query logs |
| Credential encryption | `cryptography` (Fernet) | AWS KMS / HashiCorp Vault | Over-engineering for current scale; migrate later if needed |
| SMS API | Twilio Messaging API | Twilio Conversations API | Conversations adds session/participant complexity for no benefit |
| Bulk SMS processing | Procrastinate jobs | Celery / Redis | Procrastinate already in stack; no new infrastructure |

## Installation

```bash
# Backend
cd /home/kwhatcher/projects/civicpulse/run-api
uv add twilio cryptography

# Frontend
cd /home/kwhatcher/projects/civicpulse/run-api/web
npm install @twilio/voice-sdk
```

## Version Compatibility

| New Package | Compatible With | Notes |
|-------------|-----------------|-------|
| `twilio` 9.10.x | Python 3.13 | Tested on 3.7-3.13; async via aiohttp |
| `twilio` 9.10.x | FastAPI async | Use `AsyncTwilioHttpClient` + `*_async()` methods |
| `@twilio/voice-sdk` 2.18.x | React 19, TypeScript | Full TS types bundled; no React-specific wrapper needed |
| `cryptography` 44.x | Python 3.13 | Wheels available; already transitive dep of authlib |

## Sources

- [Twilio Python SDK -- PyPI](https://pypi.org/project/twilio/) -- v9.10.4, MIT license (HIGH confidence)
- [Twilio Python async support](https://www.twilio.com/en-us/blog/twilio-python-helper-library-async) -- AsyncTwilioHttpClient docs (HIGH confidence)
- [@twilio/voice-sdk -- npm](https://www.npmjs.com/package/@twilio/voice-sdk) -- v2.18.1 (HIGH confidence)
- [Voice JavaScript SDK docs](https://www.twilio.com/docs/voice/sdks/javascript) -- Device/Call API reference (HIGH confidence)
- [Twilio Access Tokens](https://www.twilio.com/docs/iam/access-tokens) -- JWT generation with grants (HIGH confidence)
- [Twilio API Keys](https://www.twilio.com/docs/iam/api-keys) -- Standard/Main/Restricted types, production recommendation (HIGH confidence)
- [Lookup v2 Line Type Intelligence](https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence) -- carrier/line type data (HIGH confidence)
- [Webhook validation with FastAPI](https://www.twilio.com/en-us/blog/build-secure-twilio-webhook-python-fastapi) -- signature validation pattern (HIGH confidence)
- [Secure credentials](https://www.twilio.com/docs/usage/secure-credentials) -- storage best practices (HIGH confidence)

---
*Stack research for: Twilio Communications (v1.15)*
*Researched: 2026-04-07*
