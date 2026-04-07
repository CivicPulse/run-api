# Architecture Research -- Twilio Communications

**Domain:** Twilio Voice/SMS integration for multi-tenant campaign field ops
**Researched:** 2026-04-07
**Overall confidence:** HIGH

---

## New Data Models

### Org-Level Models (no RLS -- org-scoped via FK)

These tables live outside campaign RLS because Twilio credentials and phone numbers are billed per-organization, not per-campaign. They follow the same pattern as `organizations` and `organization_members` -- queried via `get_db()` with explicit `organization_id` filtering.

#### `org_twilio_configs`

Stores the org's Twilio credentials. One row per org. Auth token encrypted at rest.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | FK organizations.id | UNIQUE -- one config per org |
| account_sid | VARCHAR(64) | Twilio Account SID (AC...) |
| auth_token_encrypted | BYTEA | Fernet-encrypted auth token |
| api_key_sid | VARCHAR(64) NULL | For Access Token generation (SK...) |
| api_key_secret_encrypted | BYTEA NULL | Fernet-encrypted API key secret |
| twiml_app_sid | VARCHAR(64) NULL | TwiML App SID for Voice SDK |
| status | VARCHAR(20) | 'active' / 'suspended' / 'pending' |
| daily_budget_cents | INTEGER NULL | Soft daily spend limit (cents) |
| total_budget_cents | INTEGER NULL | Soft total spend limit (cents) |
| webhook_base_url | VARCHAR(500) NULL | Override for webhook URL (default: app URL) |
| created_by | FK users.id | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Rationale:** One row per org avoids join complexity. `api_key_sid` + `api_key_secret` are separate from Account SID / Auth Token because Twilio recommends API keys for production Access Token generation. The TwiML App SID is needed for Voice SDK grants.

#### `org_twilio_phones`

Phone numbers available to the org (BYO registered or platform-provisioned).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | FK organizations.id | |
| phone_number | VARCHAR(20) | E.164 format |
| twilio_sid | VARCHAR(64) NULL | Twilio PhoneNumber SID (PN...) if provisioned |
| friendly_name | VARCHAR(255) NULL | |
| capabilities | JSONB | `{"voice": true, "sms": true, "mms": false}` |
| phone_type | VARCHAR(20) | 'local' / 'toll_free' / 'mobile' |
| is_default_voice | BOOLEAN DEFAULT false | Default caller ID for voice |
| is_default_sms | BOOLEAN DEFAULT false | Default sender for SMS |
| provisioned_by_platform | BOOLEAN DEFAULT false | true if purchased via our provisioning API |
| status | VARCHAR(20) | 'active' / 'released' / 'pending' |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint:** `(organization_id, phone_number)`

### Campaign-Level Models (RLS-protected)

These tables have `campaign_id` FK and are protected by existing RLS policies. They follow the same pattern as `call_lists`, `voter_interactions`, etc.

#### `sms_conversations`

Thread container for two-way SMS between a campaign phone number and a voter's phone.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| campaign_id | FK campaigns.id | RLS-scoped |
| org_phone_id | FK org_twilio_phones.id | Campaign's sending number |
| voter_id | FK voters.id NULL | Linked voter (NULL if unmatched inbound) |
| voter_phone | VARCHAR(20) | Voter's phone in E.164 |
| status | VARCHAR(20) | 'active' / 'opted_out' / 'closed' |
| last_message_at | TIMESTAMPTZ NULL | For inbox sorting |
| unread_count | INTEGER DEFAULT 0 | Unread inbound messages |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint:** `(campaign_id, org_phone_id, voter_phone)` -- one thread per number pair per campaign.

**Index:** `(campaign_id, last_message_at DESC)` for inbox sorting.

#### `sms_messages`

Individual messages within a conversation. Append-only log.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| campaign_id | FK campaigns.id | RLS-scoped |
| conversation_id | FK sms_conversations.id | |
| twilio_sid | VARCHAR(64) NULL | Twilio Message SID (SM...) |
| direction | VARCHAR(10) | 'outbound' / 'inbound' |
| body | TEXT | Message content |
| from_number | VARCHAR(20) | E.164 |
| to_number | VARCHAR(20) | E.164 |
| status | VARCHAR(20) | 'queued'/'sent'/'delivered'/'failed'/'received' |
| error_code | VARCHAR(10) NULL | Twilio error code if failed |
| error_message | TEXT NULL | |
| segment_count | INTEGER DEFAULT 1 | For cost tracking |
| price_cents | INTEGER NULL | Actual cost from Twilio callback |
| sent_by | FK users.id NULL | NULL for inbound |
| created_at | TIMESTAMPTZ | |

**Index:** `(conversation_id, created_at)` for thread display.

**Idempotency:** `twilio_sid` has a UNIQUE constraint -- `INSERT ... ON CONFLICT (twilio_sid) DO NOTHING` prevents double-processing of webhook retries.

#### `call_records`

Twilio Voice call metadata. Links to existing `voter_interactions` for the canonical interaction log but stores Twilio-specific metadata separately.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| campaign_id | FK campaigns.id | RLS-scoped |
| twilio_sid | VARCHAR(64) NULL | Twilio Call SID (CA...) -- UNIQUE for idempotency |
| voter_id | FK voters.id NULL | |
| voter_interaction_id | FK voter_interactions.id NULL | Link to canonical interaction |
| caller_user_id | FK users.id | Who placed the call |
| phone_bank_session_id | FK phone_bank_sessions.id NULL | If part of a session |
| direction | VARCHAR(10) | 'outbound' / 'inbound' |
| from_number | VARCHAR(20) | E.164 |
| to_number | VARCHAR(20) | E.164 |
| status | VARCHAR(20) | 'initiated'/'ringing'/'answered'/'completed'/'no-answer'/'busy'/'failed' |
| duration_seconds | INTEGER NULL | Call duration from Twilio |
| answered | BOOLEAN NULL | Derived from status |
| price_cents | INTEGER NULL | Actual cost from Twilio callback |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ | |

**Index:** `(campaign_id, caller_user_id, created_at)` for per-caller stats.
**Index:** `(campaign_id, voter_id, created_at)` for voter history.

#### `twilio_spend_ledger`

Append-only spend log for budget enforcement. One row per billable event.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | FK organizations.id | For org-level budget checks |
| campaign_id | FK campaigns.id NULL | Optional campaign attribution |
| event_type | VARCHAR(20) | 'voice_call' / 'sms_outbound' / 'sms_inbound' / 'phone_provision' / 'lookup' |
| twilio_sid | VARCHAR(64) NULL | Reference to Twilio resource |
| amount_cents | INTEGER | Cost in cents |
| occurred_at | TIMESTAMPTZ | When the billable event happened |
| created_at | TIMESTAMPTZ | |

**Index:** `(organization_id, occurred_at)` for daily/total aggregation.

**Note:** This table does NOT use campaign-level RLS because budget enforcement queries span org-level. Queried via `get_db()` with explicit `organization_id` filtering.

#### `phone_validations`

Cache for Twilio Lookup API results. Avoids re-validating the same number.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| campaign_id | FK campaigns.id | RLS-scoped |
| phone_number | VARCHAR(20) | E.164 |
| valid | BOOLEAN | |
| line_type | VARCHAR(20) NULL | 'mobile'/'landline'/'voip'/'toll_free' etc. |
| carrier_name | VARCHAR(255) NULL | |
| country_code | VARCHAR(5) NULL | |
| lookup_data | JSONB NULL | Full Lookup v2 response |
| validated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Unique constraint:** `(campaign_id, phone_number)` with upsert on re-validation.

---

## API Endpoint Groups

### Group 1: Org Twilio Config (org-level, no RLS)

Route prefix: `/api/v1/org/twilio`
Auth: `require_org_role("org_admin")` minimum, `require_org_role("org_owner")` for credential write
DB: `get_db()` (like existing `/api/v1/org/*` endpoints)

| Method | Path | Purpose | Role |
|--------|------|---------|------|
| GET | `/org/twilio/config` | Get org Twilio config (SID visible, token masked) | org_admin |
| PUT | `/org/twilio/config` | Create/update Twilio credentials | org_owner |
| DELETE | `/org/twilio/config` | Remove Twilio config | org_owner |
| POST | `/org/twilio/config/test` | Verify credentials work (calls Twilio API) | org_admin |
| GET | `/org/twilio/spend` | Get current spend summary (daily/total) | org_admin |
| GET | `/org/twilio/spend/history` | Spend ledger with date range filter | org_admin |

### Group 2: Org Phone Numbers (org-level, no RLS)

Route prefix: `/api/v1/org/twilio/phones`
Auth: `require_org_role("org_admin")`
DB: `get_db()`

| Method | Path | Purpose | Role |
|--------|------|---------|------|
| GET | `/org/twilio/phones` | List org phone numbers | org_admin |
| POST | `/org/twilio/phones` | Register BYO phone number | org_admin |
| DELETE | `/org/twilio/phones/{phone_id}` | Remove phone number | org_admin |
| POST | `/org/twilio/phones/search` | Search available numbers for provisioning | org_admin |
| POST | `/org/twilio/phones/provision` | Purchase a number via Twilio API | org_owner |
| POST | `/org/twilio/phones/{phone_id}/release` | Release a provisioned number | org_owner |

### Group 3: Voice SDK Token + Call Initiation (campaign-level)

Route prefix: `/api/v1/campaigns/{campaign_id}/twilio`
Auth: `require_role("volunteer")` minimum
DB: `get_campaign_db`

| Method | Path | Purpose | Role |
|--------|------|---------|------|
| POST | `/campaigns/{cid}/twilio/voice-token` | Generate Voice SDK Access Token | volunteer |
| POST | `/campaigns/{cid}/twilio/calls` | Initiate outbound call (returns call_record) | volunteer |

**Voice token generation flow:**
1. Caller requests token with their identity
2. Server fetches org's `api_key_sid` + `api_key_secret` + `twiml_app_sid` from `org_twilio_configs` (via campaign -> organization FK chain)
3. Server creates AccessToken with VoiceGrant (outgoing_application_sid = twiml_app_sid)
4. Token returned with TTL (default 1 hour, max 24 hours)
5. Frontend initializes Twilio Voice SDK `Device` with the token

### Group 4: SMS (campaign-level)

Route prefix: `/api/v1/campaigns/{campaign_id}/sms`
Auth: `require_role("manager")` for send, `require_role("volunteer")` for inbox read
DB: `get_campaign_db`

| Method | Path | Purpose | Role |
|--------|------|---------|------|
| GET | `/campaigns/{cid}/sms/conversations` | List conversations (inbox) | volunteer |
| GET | `/campaigns/{cid}/sms/conversations/{conv_id}` | Get conversation with messages | volunteer |
| POST | `/campaigns/{cid}/sms/conversations/{conv_id}/messages` | Send reply in conversation | volunteer |
| POST | `/campaigns/{cid}/sms/send` | Send SMS to voter(s) -- creates conversations | manager |
| POST | `/campaigns/{cid}/sms/send-bulk` | Bulk SMS to voter list segment (202 Accepted) | manager |
| PATCH | `/campaigns/{cid}/sms/conversations/{conv_id}/read` | Mark conversation read | volunteer |

### Group 5: Phone Validation (campaign-level)

Route prefix: `/api/v1/campaigns/{campaign_id}/phones`
DB: `get_campaign_db`

| Method | Path | Purpose | Role |
|--------|------|---------|------|
| POST | `/campaigns/{cid}/phones/validate` | Validate phone via Twilio Lookup v2 | manager |
| GET | `/campaigns/{cid}/phones/{phone}/validation` | Get cached validation result | volunteer |

### Group 6: Twilio Webhooks (unauthenticated -- Twilio signature validated)

Route prefix: `/api/v1/webhooks/twilio`
Auth: Twilio signature validation (NOT JWT auth) via custom dependency
DB: `get_db()` -- webhook handler resolves org/campaign from phone number lookup

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/webhooks/twilio/voice` | TwiML App voice webhook (connect calls) |
| POST | `/webhooks/twilio/voice/status` | Voice call status callback |
| POST | `/webhooks/twilio/sms` | Inbound SMS webhook |
| POST | `/webhooks/twilio/sms/status` | SMS delivery status callback |

---

## Twilio Webhook Architecture

### The Core Challenge: Multi-Tenant Webhook Routing

Twilio sends webhooks to a single URL per phone number. The webhook must determine which org and campaign the message belongs to. This is solved by looking up the `To` phone number (for inbound) or the `AccountSid` (for status callbacks) in `org_twilio_phones` / `org_twilio_configs` to find the org, then using conversation/call record context to find the campaign.

### Webhook Data Flow -- Inbound SMS

```
Twilio Cloud
    |
    v
POST /api/v1/webhooks/twilio/sms
    |
    +-- 1. Validate X-Twilio-Signature (reject 403 if invalid)
    |
    +-- 2. Extract From/To/Body from form data
    |
    +-- 3. Look up To number in org_twilio_phones -> get organization_id
    |
    +-- 4. Look up existing sms_conversations by (org_phone_id, From number)
    |       -> If found: route to that campaign's conversation
    |       -> If not found: create new conversation (unmatched inbound)
    |
    +-- 5. INSERT sms_messages ON CONFLICT (twilio_sid) DO NOTHING (idempotency)
    |
    +-- 6. Check for STOP/UNSUBSCRIBE/CANCEL/END/QUIT keyword
    |       -> auto-DNC via DNCService + mark conversation opted_out
    |
    +-- 7. Return TwiML response (empty <Response/> for SMS)
```

### Webhook Data Flow -- Voice Call Status

```
Twilio Cloud
    |
    v
POST /api/v1/webhooks/twilio/voice/status
    |
    +-- 1. Validate X-Twilio-Signature
    |
    +-- 2. Extract CallSid, CallStatus, CallDuration, Price from form data
    |
    +-- 3. UPDATE call_records SET status, duration_seconds, price_cents, ended_at
    |       WHERE twilio_sid = CallSid
    |
    +-- 4. Write spend ledger entry if price is present
```

### Signature Validation Implementation

Use a FastAPI dependency (not middleware) scoped to webhook routes only. This avoids running validation on all requests and allows per-org auth token resolution.

```python
# app/api/deps.py (new dependency)
async def validate_twilio_signature(request: Request) -> dict:
    """Validate Twilio webhook signature.

    Resolves the org from the AccountSid or To phone number,
    fetches the decrypted auth_token for that org, and validates
    X-Twilio-Signature.

    Returns parsed form data and resolved org config on success.
    Raises HTTPException(403) on invalid signature.
    """
    form_data = await request.form()
    account_sid = form_data.get("AccountSid", "")

    # Look up org auth token from AccountSid
    org_config = await _get_org_config_by_sid(account_sid)
    if not org_config:
        raise HTTPException(403, "Unknown Twilio account")

    auth_token = decrypt_field(org_config.auth_token_encrypted)
    validator = RequestValidator(auth_token)

    # Reconstruct the original URL (handle proxy/TLS termination)
    url = _reconstruct_webhook_url(request)
    signature = request.headers.get("X-Twilio-Signature", "")

    if not validator.validate(url, dict(form_data), signature):
        raise HTTPException(403, "Invalid Twilio signature")

    return {"form_data": dict(form_data), "org_config": org_config}
```

**Critical: SSL termination handling.** The system uses Cloudflare/Traefik TLS termination. The webhook URL that Twilio signs uses HTTPS, but the request arrives at the app as HTTP. The `_reconstruct_webhook_url` function must use the `X-Forwarded-Proto` header (or the configured `webhook_base_url` from `org_twilio_configs`) to rebuild the original HTTPS URL, or Twilio signature validation will fail every time. This is the single most common Twilio webhook integration failure.

### Idempotency Strategy

Twilio retries webhooks on 5xx or timeout. Every webhook handler must be idempotent:

- **SMS messages:** `INSERT INTO sms_messages ... ON CONFLICT (twilio_sid) DO NOTHING`
- **Call records:** `INSERT INTO call_records ... ON CONFLICT (twilio_sid) DO UPDATE SET status = EXCLUDED.status, duration_seconds = EXCLUDED.duration_seconds` (status callbacks are naturally idempotent -- latest status wins)
- **Spend ledger:** Keyed by `(twilio_sid, event_type)` to prevent double-counting

### STOP Keyword Processing

When an inbound SMS contains STOP, UNSUBSCRIBE, CANCEL, END, or QUIT (case-insensitive, entire body or first word):
1. Mark the `sms_conversations` row as `status = 'opted_out'`
2. Add the voter's phone to the campaign's DNC list via existing `DNCService.add_entry()` with reason `'sms_stop'`
3. Twilio handles the auto-response at the carrier level (Twilio automatically sends "You have been unsubscribed..."), so the server returns empty `<Response/>`
4. Future outbound SMS to this number in this campaign is blocked at the send endpoint

---

## Org Credential Security

### Encryption Approach: Fernet Symmetric Encryption via SQLAlchemy TypeDecorator

Use the `cryptography` library's Fernet implementation with a SQLAlchemy `TypeDecorator` for transparent encrypt/decrypt.

**Key management:**
- Encryption key stored as environment variable `TWILIO_ENCRYPTION_KEY` (Fernet key, 32-byte URL-safe base64)
- Key injected via K8s Secret (same pattern as `DATABASE_URL`, `ZITADEL_SERVICE_CLIENT_SECRET`)
- Key added to `Settings` model in `app/core/config.py`
- Never logged, never in git, never in error reports (Sentry PII scrubbing already strips env vars)
- Generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

**Implementation:**

```python
# app/core/encryption.py
from cryptography.fernet import Fernet
from sqlalchemy import LargeBinary
from sqlalchemy.types import TypeDecorator
from app.core.config import settings

class EncryptedString(TypeDecorator):
    """Transparent Fernet encryption for string columns.

    Stores as BYTEA in PostgreSQL. Encrypts on write, decrypts on read.
    """
    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        f = Fernet(settings.twilio_encryption_key.encode())
        return f.encrypt(value.encode())

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        f = Fernet(settings.twilio_encryption_key.encode())
        return f.decrypt(value).decode()
```

**Why Fernet over alternatives:**
- `cryptography` is already a transitive dependency (via `authlib` used for JWT/JWKS)
- Fernet provides authenticated encryption (AES-128-CBC + HMAC-SHA256) -- prevents tampering
- No key rotation complexity needed at this stage (Fernet supports `MultiFernet` for rotation later)
- SQLAlchemy TypeDecorator makes it transparent to all service code -- no manual encrypt/decrypt calls

**What gets encrypted:**
- `org_twilio_configs.auth_token_encrypted` -- the Twilio Auth Token
- `org_twilio_configs.api_key_secret_encrypted` -- the Twilio API Key Secret

**What does NOT get encrypted (not secret per Twilio docs):**
- `account_sid` -- used as public identifier in API calls
- `api_key_sid` -- used as username, not secret
- `twiml_app_sid` -- resource identifier

**API response masking:** The GET config endpoint returns `auth_token_masked: "****abcd"` (last 4 chars only). The full token is never returned via API.

---

## Frontend Integration Points

### New React Components

#### Org Settings -- Twilio Configuration
Location: `web/src/routes/org/settings/twilio.tsx`

- TwilioConfigForm: Account SID, Auth Token input, API Key fields, test connection button
- PhoneNumberList: DataTable of org phone numbers with default voice/SMS toggles
- PhoneNumberSearch: Search + provision flow (search available -> preview -> purchase)
- SpendDashboard: Daily spend bar chart (recharts), total budget progress bar, spend history table

#### Campaign -- SMS Inbox
Location: `web/src/routes/campaigns/$campaignId/sms/`

- ConversationList: Left panel inbox sorted by last_message_at, unread badges
- ConversationThread: Right panel message history with reply input
- BulkSendDialog: Voter list segment picker -> message template -> preview -> send (202 Accepted)
- Uses existing voter search/filter infrastructure for segment selection

#### Campaign -- Phone Banking Enhancement
Location: Extends existing `web/src/routes/campaigns/$campaignId/phone-banking/`

- useTwilioDevice: React hook wrapping `@twilio/voice-sdk` Device lifecycle (token fetch, connect, disconnect, state management)
- VoiceCallButton: Replaces current `tel:` link with `device.connect()` call
- CallStatusIndicator: Real-time call state (ringing, connected, duration timer)
- Graceful fallback: If org has no Twilio config, existing `tel:` link behavior is preserved

#### Phone Validation
Inline in voter contact create/edit forms:

- ValidatePhoneButton: Triggers Twilio Lookup, shows loading state
- LineTypeBadge: Shows mobile/landline/voip icon on VoterPhone rows after validation

### TanStack Query Integration

New query keys follow existing pattern:
```
["org", "twilio", "config"]
["org", "twilio", "phones"]
["org", "twilio", "spend"]
["campaigns", campaignId, "sms", "conversations"]
["campaigns", campaignId, "sms", "conversations", conversationId, "messages"]
["campaigns", campaignId, "twilio", "voice-token"]
["campaigns", campaignId, "phones", phoneNumber, "validation"]
```

### NPM Dependencies

- `@twilio/voice-sdk` -- Browser WebRTC calling (the only new frontend dependency)

---

## Suggested Build Order

### Phase 1: Org Credential Storage + Encryption Foundation

**What:** `org_twilio_configs` table, `EncryptedString` TypeDecorator, config CRUD endpoints, org settings Twilio page.

**Rationale:** Everything else depends on having Twilio credentials stored and retrievable. This phase has zero Twilio API calls -- pure CRUD with encryption. Establishes the encryption pattern and the `twilio_encryption_key` env var in settings/k8s.

**Dependencies on existing code:** Extends `Organization` model (FK), `org.py` router pattern, org settings UI.
**New files:** `app/models/twilio.py`, `app/services/twilio_config.py`, `app/api/v1/twilio_config.py`, `app/core/encryption.py`, `app/schemas/twilio.py`
**Migration:** 1 Alembic migration (create `org_twilio_configs`)
**Risk:** Low -- no external API calls.

### Phase 2: Phone Number Management + Provisioning

**What:** `org_twilio_phones` table, BYO phone registration, Twilio number search + purchase API, phone list UI.

**Rationale:** Voice and SMS both need phone numbers configured before they can work. Provisioning is the first real Twilio API integration. Isolated from call/SMS complexity.

**Dependencies:** Phase 1 (needs org credentials to call Twilio API).
**New files:** `app/services/twilio_phone.py`, `app/api/v1/twilio_phones.py`
**Migration:** 1 Alembic migration (create `org_twilio_phones`)
**First Twilio API calls:** `client.available_phone_numbers`, `client.incoming_phone_numbers.create_async()`
**Risk:** Medium -- first real Twilio API integration; needs error handling for billing failures.

### Phase 3: Webhook Infrastructure + Signature Validation

**What:** Webhook route group, Twilio signature validation dependency, URL reconstruction for TLS termination, webhook route registration in `router.py`.

**Rationale:** Webhooks are needed by both Voice (Phase 4) and SMS (Phase 5). Building them standalone allows testing with Twilio's webhook debugger and ngrok/Tailscale Funnel before adding business logic. The signature validation is the critical security gate for all unauthenticated Twilio traffic.

**Dependencies:** Phase 1 (auth token for validation), Phase 2 (phone number lookup for routing).
**New files:** `app/api/v1/twilio_webhooks.py`, new dependency in `app/api/deps.py`
**Extends:** `router.py` (new webhook router without JWT auth prefix)
**Risk:** High -- SSL termination URL reconstruction is the #1 failure mode. Must test with production proxy.

### Phase 4: Click-to-Call via Voice SDK

**What:** Access Token generation endpoint, `call_records` table, TwiML App voice webhook handler (returns `<Dial>` TwiML), Voice SDK frontend integration (`useTwilioDevice` hook + `VoiceCallButton`), call status tracking.

**Rationale:** Voice calling is the highest-value feature -- it replaces the `tel:` fallback in phone banking with real WebRTC calling that records metadata. Depends on webhook infra (Phase 3) for status callbacks.

**Dependencies:** Phases 1, 2, 3.
**Extends:** Existing phone banking field mode UI (VoiceCallButton replaces tel: link), `VoterInteractionService` (PHONE_CALL payload now includes `twilio_call_sid`).
**New files:** `app/services/twilio_voice.py`, `app/api/v1/twilio_voice.py`, `web/src/hooks/useTwilioDevice.ts`
**Migration:** 1 Alembic migration (create `call_records`)
**Risk:** Medium -- Voice SDK Device lifecycle management in React is tricky (token refresh, reconnection).

### Phase 5: Two-Way SMS + STOP/DNC Integration

**What:** `sms_conversations` + `sms_messages` tables, SMS send/reply endpoints, inbound SMS webhook handler, STOP keyword -> DNC pipeline, SMS inbox UI, bulk SMS via Procrastinate.

**Rationale:** SMS is a large feature surface but self-contained. STOP processing reuses existing `DNCService.add_entry()`. Can be built in parallel with Phase 4 if desired (both depend on Phase 3).

**Dependencies:** Phases 1, 2, 3.
**Extends:** `DNCService` (new reason value `SMS_STOP`), `DNCReason` enum, `InteractionType` enum (add `SMS` value), Procrastinate import paths.
**New files:** `app/services/twilio_sms.py`, `app/api/v1/twilio_sms.py`, `app/tasks/sms_task.py`
**Migration:** 1 Alembic migration (create `sms_conversations` + `sms_messages` + RLS policies)
**Risk:** Medium -- bulk send needs rate limiting to avoid Twilio throttling; conversation threading for unmatched inbound numbers needs UX decisions.

### Phase 6: Spend Tracking + Budget Enforcement

**What:** `twilio_spend_ledger` table, spend aggregation queries, daily/total budget soft enforcement, spend dashboard UI in org settings.

**Rationale:** Budget enforcement is a policy layer on top of existing call/SMS. Building it last means all billable events are already flowing. Enforcement is "soft" -- blocks new sends when over budget but doesn't cancel in-progress operations.

**Dependencies:** Phases 4 and 5 (all billable event sources).
**Extends:** Voice and SMS services (add spend ledger writes on status callbacks), org settings UI.
**New files:** `app/services/twilio_spend.py`, `app/api/v1/twilio_spend.py`
**Migration:** 1 Alembic migration (create `twilio_spend_ledger`)
**Enforcement:** Pre-send check: `SELECT COALESCE(SUM(amount_cents), 0) FROM twilio_spend_ledger WHERE organization_id = ? AND occurred_at >= current_date` -- if >= daily_budget_cents, raise `BudgetExceededError`.

### Phase 7: Phone Validation (Twilio Lookup v2)

**What:** `phone_validations` cache table, Lookup API integration, validation endpoint, inline UI badge in voter contact forms.

**Rationale:** Lowest priority -- the platform already works without phone validation. This is a quality-of-life enhancement. Depends only on org credentials (Phase 1).

**Dependencies:** Phase 1 only (could be parallelized with Phases 4-6).
**Extends:** Voter contact create/edit UI (adds validate button + line type badge).
**New files:** `app/services/twilio_lookup.py`, `app/api/v1/twilio_lookup.py`
**Migration:** 1 Alembic migration (create `phone_validations`)
**Risk:** Low -- simple API call + cache pattern.

---

## Integration with Existing Features

### DNC Service

The existing `DNCService` and `DoNotCallEntry` model are reused directly:
- **STOP keyword SMS:** Webhook handler calls `DNCService.add_entry(campaign_id, phone, 'sms_stop', system_user_id)` when STOP detected
- **New DNCReason value:** Add `SMS_STOP = "sms_stop"` to `DNCReason` StrEnum (native_enum=False so no ALTER TYPE migration needed)
- **Pre-send DNC check:** SMS send and voice call endpoints call `DNCService.check_number()` before placing call/sending message
- **Call list DNC filtering:** Existing call list generation already filters DNC -- no change needed

### Voter Contacts (VoterPhone)

- **No schema changes to VoterPhone.** Line type data lives in the `phone_validations` cache table, not on VoterPhone itself. This avoids migrating the existing VoterPhone table and keeps Lookup results independently cacheable/refreshable.
- **Phone validation cache:** `phone_validations` is campaign-scoped, keyed by E.164 number. Frontend queries validation data separately when rendering phone rows.

### Voter Interactions

- **Voice calls:** Create `VoterInteraction(type=PHONE_CALL)` with extended JSONB payload: `{"twilio_call_sid": "CA...", "duration_seconds": 120, "answered": true, "via": "twilio_voice_sdk"}`
- **SMS messages:** Create `VoterInteraction(type=SMS)` for outbound messages: `{"twilio_message_sid": "SM...", "direction": "outbound", "body_preview": "..."}`
- **New InteractionType value:** Add `SMS = "sms"` to `InteractionType` StrEnum (native_enum=False, no ALTER TYPE needed)
- **Existing JSONB payload column** is flexible enough for all new fields -- no migration on `voter_interactions`

### Phone Banking (PhoneBankService)

- **Existing `record_call` flow preserved:** When a caller records an outcome in a phone bank session, the existing flow (create interaction, update entry status, auto-DNC on refused) continues unchanged
- **`call_records` table is supplementary:** It stores Twilio-specific metadata (SID, duration, price) that `CallListEntry` / `VoterInteraction` don't track
- **Voice SDK integration point:** The active calling screen's "Call" button switches from `<a href="tel:...">` to `Device.connect()` when org has Twilio config; outcome recording flow is identical
- **Feature detection:** Frontend checks for Twilio config via a lightweight endpoint or org context; falls back to `tel:` links with zero behavioral change if no config

### Procrastinate Job Queue

- **Bulk SMS sending:** New task `send_bulk_sms` registered in `app/tasks/sms_task.py`
- **Added to `procrastinate_app.import_paths`:** `["app.tasks.import_task", "app.tasks.sms_task"]`
- **Queueing lock:** Uses `queueing_lock=f"bulk_sms_{campaign_id}_{batch_id}"` to prevent duplicate job submission (same pattern as import jobs)
- **202 Accepted:** Bulk send endpoint returns 202 with job ID; frontend polls for completion

### Organization Model

- **No changes to `Organization` model itself** -- `org_twilio_configs` links via FK
- **Org router extended:** New sub-routers mounted at `/api/v1/org/twilio/...` following existing org.py pattern
- **Org role gates:** All config/phone endpoints use existing `require_org_role()` dependency

### Async Twilio Client Pattern

- **Use `AsyncTwilioHttpClient` with `*_async()` methods** for all Twilio API calls in the FastAPI process
- **Cache Twilio `Client` instances per org** in a module-level dict keyed by `org_id` with TTL. Invalidate on credential update.
- **Procrastinate worker:** Uses sync Twilio client (worker runs in its own process, not on the async event loop)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Data model design | HIGH | Follows established codebase patterns (campaign_id FK, JSONB payloads, append-only logs, StrEnum with native_enum=False) |
| Webhook architecture | HIGH | Twilio webhook patterns well-documented; SSL termination is the known pitfall to test early |
| Credential encryption | HIGH | Fernet + TypeDecorator is a standard pattern; cryptography is already a transitive dependency |
| Voice SDK token flow | HIGH | Well-documented Twilio pattern; Python SDK has native AccessToken generation |
| Multi-tenant webhook routing | HIGH | Phone number / AccountSid lookup approach is standard for multi-tenant Twilio integrations |
| Async compatibility | MEDIUM | Twilio Python SDK has `*_async` methods but some community-reported edge cases; may need `run_in_executor` fallback for specific operations |
| Spend tracking accuracy | MEDIUM | Relies on Twilio status callbacks for actual pricing; callbacks can be delayed or missing for some edge cases |
| Build order | HIGH | Dependencies are clear and phases are isolatable with well-defined integration seams |

---

## Sources

- [Build a Secure Twilio Webhook with Python and FastAPI](https://www.twilio.com/en-us/blog/build-secure-twilio-webhook-python-fastapi) -- FastAPI webhook + signature validation
- [Twilio Webhooks Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) -- X-Twilio-Signature HMAC-SHA1
- [Twilio Access Tokens](https://www.twilio.com/docs/iam/access-tokens) -- Voice SDK token generation
- [Twilio Voice SDKs](https://www.twilio.com/docs/voice/sdks) -- Browser calling via WebRTC
- [Generate Twilio Access Tokens in Python](https://www.twilio.com/en-us/blog/twilio-access-tokens-python) -- Python AccessToken + VoiceGrant
- [Twilio API Keys Overview](https://www.twilio.com/docs/iam/api-keys) -- API keys recommended for production
- [Secure Your Twilio Credentials](https://www.twilio.com/docs/usage/secure-credentials) -- Credential storage best practices
- [Twilio Lookup v2 API](https://www.twilio.com/docs/lookup/v2-api) -- Phone validation + line type intelligence
- [Twilio Available Phone Numbers API](https://www.twilio.com/docs/phone-numbers/global-catalog/api/available-numbers) -- Number search
- [Twilio IncomingPhoneNumber Resource](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource) -- Number purchase API
- [Encryption at Rest with SQLAlchemy](https://blog.miguelgrinberg.com/post/encryption-at-rest-with-sqlalchemy) -- Fernet TypeDecorator pattern
- [Twilio Python Helper Library Async](https://www.twilio.com/en-us/blog/twilio-python-helper-library-async) -- AsyncTwilioHttpClient usage
- [SQLAlchemy SymmetricEncryptionClientSide Wiki](https://github.com/sqlalchemy/sqlalchemy/wiki/SymmetricEncryptionClientSide) -- TypeDecorator encryption reference
- Existing codebase: `app/services/phone_bank.py` (service composition pattern), `app/models/organization.py` (org-level model), `app/api/v1/org.py` (org endpoint pattern), `app/api/deps.py` (dependency pattern), `app/tasks/procrastinate_app.py` (job queue pattern)
