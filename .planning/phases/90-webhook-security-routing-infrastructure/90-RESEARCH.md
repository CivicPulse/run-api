# Phase 90: Webhook Security & Routing Infrastructure - Research

**Researched:** 2026-04-07
**Domain:** Twilio webhook ingress, signature validation, idempotent event processing, org-scoped routing
**Confidence:** HIGH

## Summary

This phase builds the shared webhook infrastructure that Phases 91 (Voice) and 92 (SMS) depend on. The core challenges are: (1) validating Twilio request signatures against the public URL shape when the app sits behind Traefik reverse proxy with SSL termination, (2) deduplicating webhook deliveries using Twilio SID values as natural idempotency keys, and (3) routing inbound webhooks to the correct org by looking up the dialed/messaged phone number in the existing `org_phone_numbers` table.

The codebase already has the building blocks: `TwilioConfigService.credentials_for_org()` decrypts the auth token needed for `RequestValidator`, `OrgPhoneNumber` maps phone numbers to orgs, and the RLS pattern (`set_campaign_context` + migration policies) is well-established across 30+ tables.

**Primary recommendation:** Build a FastAPI dependency (`verify_twilio_signature`) that reconstructs the public URL from `webhook_base_url` config + request path, validates `X-Twilio-Signature` using the org's decrypted auth token, and returns 403 on failure. Pair it with a `webhook_events` idempotency table keyed on `(provider_sid, event_type)` with a UNIQUE constraint, and a phone-number-to-org resolution dependency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion -- infrastructure phase. Key constraints from requirements:
- SEC-02: Signature validation must use the public production URL (behind Traefik), not the internal container URL. The app runs behind `https://run.civpulse.org` in production -- Twilio signs against the public URL shape.
- SEC-03: Idempotency on Twilio SID values -- retried webhooks must not create duplicate records.
- SEC-04: Any new campaign-scoped tables must have RLS policies matching the existing pattern.
- ORG-03: Webhook routing resolves org from the registered phone number, keeping data isolated per org.

Patterns to follow from existing codebase:
- Routing: add to `app/api/v1/router.py` like other modules.
- Rate limiting: `@limiter.limit(...)` with `get_user_or_ip_key` (though webhooks use IP-only since no JWT).
- Config: extend `app/core/config.py` Settings for `webhook_base_url`.
- Org resolution: `org_phone_numbers.phone_number` -> `org_phone_numbers.org_id` -> org context.
- RLS: follow existing transaction-scoped `set_campaign_context` pattern for any campaign-scoped webhook data.

### Claude's Discretion
All implementation choices -- infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
- Voice call status callbacks -- Phase 91 responsibility.
- SMS delivery/reply callbacks -- Phase 92 responsibility.
- Webhook retry monitoring/alerting -- future operational concern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-03 | Twilio numbers, credentials, and webhook routing stay isolated per organization and never bleed across org boundaries | Phone-number-to-org lookup via `org_phone_numbers` table; org-scoped auth token decryption for per-org signature validation; RLS on any new campaign-scoped tables |
| SEC-02 | All Twilio webhook routes validate request signatures against the public webhook URL shape used in production behind Traefik | `webhook_base_url` config setting + URL reconstruction; Twilio `RequestValidator.validate(uri, params, signature)` using org's decrypted auth token |
| SEC-03 | Twilio callback handling is idempotent on provider SID values so retries do not duplicate records or side effects | `webhook_events` table with `UNIQUE(provider_sid, event_type)` constraint; INSERT ... ON CONFLICT DO NOTHING pattern |
| SEC-04 | New Twilio campaign-scoped tables enforce the existing RLS isolation model | Standard migration pattern: ENABLE + FORCE ROW LEVEL SECURITY, CREATE POLICY with `current_setting('app.current_campaign_id')::uuid`, GRANT to app_user |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| twilio | 9.10.4 | `RequestValidator` for webhook signature validation | Already installed; provides HMAC-SHA1 signature computation matching Twilio's server-side signing [VERIFIED: installed in project] |
| FastAPI | (existing) | Webhook route handlers, dependency injection | Project standard [VERIFIED: codebase] |
| SQLAlchemy | (existing) | Async ORM for idempotency table and org lookup | Project standard [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| slowapi | (existing) | Rate limiting webhook endpoints | IP-based rate limiting for unauthenticated webhook routes [VERIFIED: codebase] |
| pydantic-settings | (existing) | `webhook_base_url` config setting | Env var configuration [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `twilio.RequestValidator` | Custom HMAC-SHA1 | No reason -- SDK handles URL normalization (port stripping, etc.) for free |
| Database idempotency table | Redis SET NX with TTL | Database is simpler, durable, and already the source of truth; Redis adds a dependency for no benefit |

**Installation:** No new packages needed -- `twilio>=9.10.4` already installed.

## Architecture Patterns

### Recommended Project Structure
```
app/
  api/v1/
    webhooks.py          # Webhook route handlers (mounted at /webhooks/twilio)
  services/
    twilio_config.py     # EXISTING -- credentials_for_org()
    twilio_webhook.py    # NEW -- signature validation, org resolution, idempotency check
  models/
    org_phone_number.py  # EXISTING -- phone_number -> org_id lookup
    webhook_event.py     # NEW -- idempotency tracking table
  schemas/
    webhook.py           # NEW -- Pydantic models for webhook payloads
alembic/versions/
    031_webhook_events.py  # NEW -- migration for webhook_events table
```

### Pattern 1: Twilio Signature Validation Dependency
**What:** A FastAPI dependency that validates `X-Twilio-Signature` before the route handler executes. [CITED: https://www.twilio.com/docs/usage/webhooks/webhooks-security]
**When to use:** Every Twilio webhook endpoint.
**Example:**
```python
# Source: Twilio webhook security docs + codebase pattern
from fastapi import Depends, HTTPException, Request
from twilio.request_validator import RequestValidator

from app.core.config import settings

async def verify_twilio_signature(
    request: Request,
    org: Organization = Depends(resolve_org_from_phone),
) -> None:
    """Validate X-Twilio-Signature using public URL + org auth token."""
    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature:
        raise HTTPException(status_code=403, detail="Missing signature")

    # Reconstruct the URL Twilio signed against (public, not internal)
    public_url = settings.webhook_base_url.rstrip("/") + request.url.path
    if request.url.query:
        public_url += "?" + request.url.query

    creds = TwilioConfigService().credentials_for_org(org)
    if creds is None:
        raise HTTPException(status_code=403, detail="Twilio not configured")

    validator = RequestValidator(creds.auth_token)

    # For form-encoded POST (standard Twilio webhooks)
    form_data = await request.form()
    params = dict(form_data)

    if not validator.validate(public_url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")
```

### Pattern 2: Phone Number to Org Resolution
**What:** Look up the inbound phone number (`To` or `Called` param) in `org_phone_numbers` to determine which org owns it.
**When to use:** Before signature validation (need org to get auth token).
**Example:**
```python
async def resolve_org_from_phone(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    """Resolve org from the Twilio 'To' phone number."""
    form_data = await request.form()
    to_number = form_data.get("To") or form_data.get("Called") or ""

    result = await db.execute(
        select(OrgPhoneNumber)
        .options(joinedload(OrgPhoneNumber.org))  # if relationship exists
        .where(OrgPhoneNumber.phone_number == to_number)
    )
    phone_record = result.scalar_one_or_none()
    if not phone_record:
        raise HTTPException(status_code=404, detail="Unknown number")

    # Load the org
    org = await db.get(Organization, phone_record.org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    return org
```

### Pattern 3: SID-Based Idempotency
**What:** Use Twilio's `CallSid` / `MessageSid` as a natural deduplication key in a `webhook_events` table. [CITED: https://www.twilio.com/docs/events/event-delivery-and-duplication]
**When to use:** Every webhook handler that creates or updates records.
**Example:**
```python
async def check_idempotency(
    db: AsyncSession,
    provider_sid: str,
    event_type: str,
) -> bool:
    """Return True if this event was already processed (duplicate)."""
    stmt = (
        pg_insert(WebhookEvent)
        .values(provider_sid=provider_sid, event_type=event_type)
        .on_conflict_do_nothing(index_elements=["provider_sid", "event_type"])
    )
    result = await db.execute(stmt)
    if result.rowcount == 0:
        return True  # Already exists -- duplicate
    return False  # New event -- proceed
```

### Pattern 4: Request Body Caching for Signature + Handler
**What:** FastAPI consumes the request body stream once. Webhook validation reads form data, then the handler also needs it. Cache the body so both can access it.
**When to use:** When signature validation and the route handler both need form data.
**Example:**
```python
# FastAPI's Request.form() caches internally after first call,
# so calling await request.form() in both the dependency and the
# handler returns the same parsed data without re-reading the stream.
# No custom body caching middleware needed.
```
[VERIFIED: FastAPI source -- `Request._form` is cached after first parse]

### Anti-Patterns to Avoid
- **Using `request.url` directly for signature validation:** The internal URL seen by FastAPI (e.g., `http://api:8000/api/v1/webhooks/twilio/voice/status`) does NOT match the public URL Twilio signed against (`https://run.civpulse.org/api/v1/webhooks/twilio/voice/status`). Always reconstruct from `webhook_base_url` config. [CITED: https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/handle-ssl-termination-twilio-node-js-helper-library]
- **Decoding/re-encoding URL parameters before validation:** Twilio signs the exact URL including any percent-encoded characters. Re-encoding changes the signature base. [CITED: https://www.twilio.com/docs/usage/webhooks/webhooks-security]
- **Returning non-200 for duplicate webhooks:** Twilio interprets non-2xx as failure and retries. Return 200 OK even when discarding duplicates. [CITED: https://www.twilio.com/docs/events/event-delivery-and-duplication]
- **Building RLS policies without FORCE:** All tables must use both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` (learned from migration 026). [VERIFIED: codebase]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA1 signature validation | Custom hmac.new() + URL manipulation | `twilio.request_validator.RequestValidator` | Handles port normalization, both with-port and without-port validation, URL encoding edge cases [VERIFIED: Twilio SDK source] |
| Webhook event deduplication | In-memory sets or Redis caches | PostgreSQL UNIQUE constraint + ON CONFLICT DO NOTHING | Durable across restarts, transactional with business logic, no extra infrastructure |
| Phone number normalization | Regex-based E.164 cleanup | Store and match in E.164 format consistently | Twilio always sends E.164 (`+1XXXXXXXXXX`); match as-is against `org_phone_numbers.phone_number` |

**Key insight:** The Twilio SDK's `RequestValidator` does more than HMAC -- it handles URL port normalization (validates both with and without port), query parameter sorting, and body hash validation for JSON payloads. Reimplementing this correctly is error-prone.

## Common Pitfalls

### Pitfall 1: URL Mismatch Behind Reverse Proxy
**What goes wrong:** Signature validation always fails in production because the app sees `http://api:8000/...` but Twilio signed against `https://run.civpulse.org/...`. [CITED: https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/handle-ssl-termination-twilio-node-js-helper-library]
**Why it happens:** SSL termination at Traefik changes protocol and host.
**How to avoid:** Use `webhook_base_url` config setting (e.g., `https://run.civpulse.org`) to reconstruct the public URL. Never use `request.url` for Twilio validation.
**Warning signs:** All webhook signature validations fail in staging/production but pass in local dev.

### Pitfall 2: Org Auth Token Used for Wrong Account
**What goes wrong:** Multi-tenant system uses one org's auth token to validate a webhook from a different org's Twilio account.
**Why it happens:** Org resolution fails or uses wrong phone number field.
**How to avoid:** Always resolve org FIRST from the `To`/`Called` phone number, THEN use that org's auth token. Each org has its own Twilio account and auth token.
**Warning signs:** Intermittent 403s that correlate with which org's number received the call/SMS.

### Pitfall 3: Consuming Request Body Twice
**What goes wrong:** Validation dependency reads the request body stream, leaving nothing for the route handler.
**Why it happens:** ASGI request body is a one-shot stream.
**How to avoid:** FastAPI's `Request.form()` caches the parsed form data after first access. Call it in both dependency and handler -- it returns the cached result. [VERIFIED: FastAPI internals]
**Warning signs:** Empty `form_data` dict in handler after signature validation passes.

### Pitfall 4: Returning Non-2xx for Duplicate Events
**What goes wrong:** Idempotency check detects duplicate, handler returns 409 Conflict, Twilio retries creating an infinite loop.
**Why it happens:** Treating idempotency as an error condition.
**How to avoid:** Always return 200 OK (or 204 No Content with empty TwiML) when discarding a duplicate. Twilio retries on non-2xx responses.
**Warning signs:** Exponentially growing webhook traffic for the same SID.

### Pitfall 5: RLS Context Not Set for Webhook Routes
**What goes wrong:** Webhook handlers write to campaign-scoped tables but forget to call `set_campaign_context()`, causing RLS policy violations.
**Why it happens:** Webhooks don't have JWT auth, so the normal `get_campaign_db` dependency path isn't used.
**How to avoid:** After resolving org -> campaign from the phone number, explicitly call `set_campaign_context(session, campaign_id)` before any campaign-scoped writes.
**Warning signs:** `permission denied for table` errors from PostgreSQL.

### Pitfall 6: Missing Index on Phone Number Lookup
**What goes wrong:** Every webhook triggers a sequential scan on `org_phone_numbers` for phone number lookup.
**Why it happens:** No index on `phone_number` column.
**How to avoid:** Add a unique index on `(phone_number)` in the migration. Phone numbers should be unique across the system (one org per number). [VERIFIED: `OrgPhoneNumber` model has no unique constraint on `phone_number`]
**Warning signs:** Slow webhook response times under load.

## Code Examples

### Webhook Events Idempotency Table (Migration)
```python
# Source: Codebase pattern from alembic/versions/002_voter_data_models.py
def upgrade() -> None:
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider_sid", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("org_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload_summary", sa.JSON(), nullable=True),  # Optional debug info
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("provider_sid", "event_type", name="uq_webhook_events_sid_type"),
    )
    op.create_index("ix_webhook_events_created_at", "webhook_events", ["created_at"])
    # No RLS needed -- org_id scoped, not campaign_id scoped
    # Grant to app_user for consistency
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO app_user")
```

### Config Setting
```python
# Source: Existing app/core/config.py pattern
class Settings(BaseSettings):
    # ... existing settings ...

    # Webhook infrastructure
    webhook_base_url: str = "http://localhost:8000"  # Override in production
```

### Webhook Router Skeleton
```python
# Source: Existing app/api/v1/router.py pattern
from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse

router = APIRouter()

@router.post(
    "/voice/status",
    response_class=PlainTextResponse,
    dependencies=[Depends(verify_twilio_signature)],
)
async def voice_status_callback(request: Request):
    """Receive voice call status updates from Twilio.
    
    Placeholder -- Phase 91 implements the actual handler logic.
    """
    return ""  # Empty TwiML response

@router.post(
    "/sms/inbound",
    response_class=PlainTextResponse,
    dependencies=[Depends(verify_twilio_signature)],
)
async def sms_inbound_callback(request: Request):
    """Receive inbound SMS from Twilio.
    
    Placeholder -- Phase 92 implements the actual handler logic.
    """
    return ""  # Empty TwiML response
```

### TwiML Response Pattern
```python
# Twilio expects TwiML (XML) or empty string responses from webhooks.
# For status callbacks, return empty string (no TwiML instructions needed).
# For inbound SMS/voice that need response, return TwiML:
from twilio.twiml.messaging_response import MessagingResponse

def empty_response():
    """Return empty TwiML -- acknowledge receipt, no action."""
    return PlainTextResponse("", media_type="text/xml")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single global auth token for validation | Per-org auth token validation | Multi-tenant requirement | Each org has its own Twilio account; validator must use org-specific token |
| `X-Forwarded-Proto` header reconstruction | Explicit `webhook_base_url` config | Best practice for proxy scenarios | More reliable than trusting proxy headers; explicit URL avoids header-stripping issues |
| Fire-and-forget webhook handling | Idempotent with `I-Twilio-Idempotency-Token` header support | Twilio added in recent SDK versions | Use provider SID as primary key; `I-Twilio-Idempotency-Token` as secondary signal |

**Deprecated/outdated:**
- Using `request.url` for validation behind proxies -- always fails with SSL termination

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `webhook_events` table should be org-scoped (not campaign-scoped) since webhooks arrive at the org level, not campaign level | Architecture Patterns | If campaign-scoped, need RLS policy + campaign resolution logic from phone number; adds complexity |
| A2 | Phone numbers in `org_phone_numbers` are stored in E.164 format matching Twilio's `To`/`Called` parameter format | Architecture Patterns | If format differs, phone number lookup fails silently -- need normalization |
| A3 | Webhook routes should be under `/api/v1/webhooks/twilio/` prefix | Architecture Patterns | URL prefix affects Twilio console configuration; any prefix works as long as it's consistent |
| A4 | Twilio sends standard form-encoded POST for voice/SMS webhooks (not JSON) | Architecture Patterns | If JSON, need `validateRequestWithBody` instead of form params validation |
| A5 | A `UNIQUE(phone_number)` constraint is safe -- no phone number is shared across orgs | Common Pitfalls | If shared numbers exist, unique constraint causes insert failures; but CONTEXT.md requirement says numbers are org-isolated |

## Open Questions

1. **Campaign resolution from phone number**
   - What we know: Org is resolved from `org_phone_numbers.org_id`. Some webhook data may need campaign context for RLS.
   - What's unclear: How to map org -> campaign for webhook writes. An org can have multiple campaigns.
   - Recommendation: For Phase 90 infrastructure, resolve org only. Campaign resolution is a Phase 91/92 concern -- voice callbacks will have campaign context from the outgoing call record, SMS from the conversation thread.

2. **Phone number uniqueness across orgs**
   - What we know: Out-of-scope list says "Shared sender numbers across organizations" is excluded. `org_phone_numbers` has `org_id` FK but no unique constraint on `phone_number`.
   - What's unclear: Whether the seed data or existing code enforces uniqueness.
   - Recommendation: Add a unique index on `phone_number` in the migration. This aligns with the explicit out-of-scope decision.

3. **Webhook event retention / cleanup**
   - What we know: Idempotency records accumulate forever without cleanup.
   - What's unclear: Acceptable retention window.
   - Recommendation: Add `created_at` index to support future cleanup jobs. Don't implement cleanup in this phase -- it's an operational concern deferred per CONTEXT.md.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio (auto mode) |
| Config file | `pyproject.toml` (pytest section) |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-02 | Signature validation accepts valid signatures and rejects invalid ones | unit | `uv run pytest tests/unit/test_twilio_webhook.py::test_signature_validation -x` | Wave 0 |
| SEC-02 | Public URL reconstruction uses webhook_base_url, not request.url | unit | `uv run pytest tests/unit/test_twilio_webhook.py::test_url_reconstruction -x` | Wave 0 |
| SEC-03 | Duplicate SID inserts are idempotent (no error, returns duplicate flag) | unit | `uv run pytest tests/unit/test_twilio_webhook.py::test_idempotency -x` | Wave 0 |
| SEC-04 | RLS policy on new tables follows ENABLE + FORCE + USING pattern | integration | `uv run pytest tests/integration/test_webhook_rls.py -x` | Wave 0 |
| ORG-03 | Phone number resolves to correct org | unit | `uv run pytest tests/unit/test_twilio_webhook.py::test_org_resolution -x` | Wave 0 |
| ORG-03 | Unknown phone number returns 404, not 500 | unit | `uv run pytest tests/unit/test_twilio_webhook.py::test_unknown_number -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_twilio_webhook.py -x -q`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_twilio_webhook.py` -- covers SEC-02, SEC-03, ORG-03
- [ ] `tests/integration/test_webhook_rls.py` -- covers SEC-04 (requires DB)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Twilio `X-Twilio-Signature` HMAC-SHA1 validation (not JWT -- webhook-specific) |
| V3 Session Management | no | Webhooks are stateless -- no session |
| V4 Access Control | yes | Org isolation via phone number routing; RLS on campaign-scoped data |
| V5 Input Validation | yes | Validate presence of required Twilio params (`To`, `CallSid`/`MessageSid`, `CallStatus`/`SmsStatus`); Pydantic schemas for payload parsing |
| V6 Cryptography | no | Auth token decryption uses existing Fernet infrastructure (Phase 88) |

### Known Threat Patterns for Twilio Webhook Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook requests | Spoofing | HMAC-SHA1 signature validation via `RequestValidator` |
| Replay attacks (retried webhooks) | Tampering | SID-based idempotency table prevents duplicate processing |
| Cross-org data leakage | Information Disclosure | Phone number -> org routing ensures webhook data stays in correct org |
| URL manipulation to bypass signature check | Tampering | Use server-side `webhook_base_url` config, never client-supplied URL |
| Rate-based DoS on webhook endpoints | Denial of Service | IP-based rate limiting via slowapi (`get_real_ip` key function) |
| Timing attacks on signature comparison | Information Disclosure | Twilio SDK uses `hmac.compare_digest` internally for constant-time comparison [VERIFIED: Twilio SDK source uses `compare` helper] |

## Sources

### Primary (HIGH confidence)
- Twilio Python SDK 9.10.4 source code -- `RequestValidator.validate()`, `compute_signature()` internals [VERIFIED: installed package inspection]
- Project codebase -- `app/services/twilio_config.py`, `app/models/org_phone_number.py`, `app/db/rls.py`, `app/core/config.py`, `alembic/versions/026_rls_hardening.py` [VERIFIED: direct file reads]

### Secondary (MEDIUM confidence)
- [Twilio Webhooks Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) -- Signature validation protocol, URL requirements
- [Twilio Webhooks Connection Overrides](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides) -- Retry behavior (0-5 retries, `I-Twilio-Idempotency-Token` header)
- [Twilio SSL Termination Blog](https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/handle-ssl-termination-twilio-node-js-helper-library) -- URL reconstruction behind reverse proxy
- [Twilio Event Delivery & Duplication](https://www.twilio.com/docs/events/event-delivery-and-duplication) -- Deduplication on event ID/SID

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in codebase
- Architecture: HIGH -- follows established codebase patterns (router, RLS, config, deps)
- Pitfalls: HIGH -- URL mismatch issue well-documented by Twilio; other pitfalls verified against codebase patterns

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable infrastructure domain, Twilio SDK changes infrequently)
