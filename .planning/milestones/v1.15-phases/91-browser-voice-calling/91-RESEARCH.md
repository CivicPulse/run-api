# Phase 91: Browser Voice Calling - Research

**Researched:** 2026-04-07
**Domain:** Twilio Voice SDK browser-based calling, WebRTC, call logging, compliance guardrails
**Confidence:** HIGH

## Summary

Phase 91 replaces `tel:` links in the phone banking flow with browser-based Twilio Voice SDK calls when the org has Twilio configured and the browser supports WebRTC. The architecture follows a well-established pattern: the frontend obtains a short-lived Access Token from the backend, initializes a Twilio `Device`, and calls `device.connect()` to place outbound calls via a TwiML App. Twilio POSTs to the TwiML App's Voice URL, which returns `<Dial><Number>` TwiML to bridge the call to the voter's phone. Call status webhooks update a new campaign-scoped `call_records` table.

The backend work requires: (1) storing Twilio API Key credentials on the org model (needed for Access Token signing -- distinct from the Auth Token), (2) a TwiML App SID on the org, (3) a token generation endpoint, (4) a TwiML Voice URL endpoint, (5) a call status webhook handler, (6) a `call_records` migration with RLS, and (7) calling-hours columns on the campaign model. The frontend work requires: adding `@twilio/voice-sdk`, a React hook wrapping the Device lifecycle, modifying `PhoneNumberList` to support browser call mode, and building the `CallStatusBar` inline UI.

**Primary recommendation:** Use Twilio API Keys (not Auth Tokens) for Access Token signing, keep token TTL at 600 seconds with automatic refresh, and validate destination numbers server-side in the TwiML handler before connecting.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace the `tel:` link in `PhoneNumberList` component with an in-browser call button when Twilio is configured and WebRTC is available.
- Show a minimal inline status bar below the phone number during a call: call duration timer + hang-up button. Volunteer stays on the same screen.
- Browser audio through device speakers/headset with a mute toggle. Twilio Voice SDK handles WebRTC audio automatically.
- When a call ends, auto-advance to the outcome recording step (same flow as after current `tel:` call).
- Detect support by checking both WebRTC availability (`navigator.mediaDevices.getUserMedia`) AND org Twilio configuration. Both must be true for in-browser calling.
- When in-browser calling is unavailable, preserve the existing `tel:` link behavior unchanged.
- Show a small badge/indicator on the call button: "Browser Call" vs "Phone" so the volunteer knows which method will be used.
- Mode is auto-detected -- no manual toggle between browser call and tel: link.
- Log call metadata: Call SID, duration, status, from/to numbers, org_id, campaign_id, caller_user_id, started_at, ended_at.
- New `call_records` table (campaign-scoped with RLS) -- separate from `webhook_events` which is org-scoped.
- Check DNC list before allowing call initiation -- block the call button if voter's number is on DNC. Use existing `DNCService.is_dnc_number()`.
- Enforce calling-hours guardrails: check against configurable calling hours (default 9am-9pm local time) before allowing call. Block with clear message. Calling hours stored as campaign setting.

### Claude's Discretion
- Twilio Voice SDK token generation endpoint design (TwiML App SID, capability token vs access token)
- Exact TwiML application configuration for outbound calls
- Call status webhook handler implementation (building on Phase 90 webhook infrastructure)
- Specific React component structure for the call control UI
- Calling hours storage schema (campaign-level setting columns vs separate config table)

### Deferred Ideas (OUT OF SCOPE)
- Call recording (audio) -- requires additional compliance considerations.
- Voicemail drop -- explicitly out of scope per PROJECT.md.
- Predictive/auto-dialer -- explicitly out of scope per PROJECT.md.
- Call quality metrics (MOS scores, jitter) -- future observability concern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Phone bankers can place browser-based click-to-call calls from the existing phone banking flow when Twilio Voice is configured | Twilio Voice SDK `Device.connect()` with Access Token + TwiML App; `PhoneNumberList` modification; token generation endpoint |
| VOICE-02 | Users on unsupported browsers or orgs without Twilio Voice configuration fall back cleanly to the existing `tel:` behavior | `Device.isSupported` static check + `navigator.mediaDevices.getUserMedia` probe + org config query; conditional rendering in PhoneRow |
| VOICE-03 | Call state, duration, and final outcome are captured so future reporting can measure answer and completion rates per voter and campaign | `call_records` table with RLS; voice status webhook handler updates records; frontend captures started_at/ended_at |
| VOICE-04 | Calls are blocked when the voter is on DNC or outside allowed calling hours, with clear operator feedback | Pre-call DNC check via existing `DNCService.check_number()`; calling hours columns on campaign model; frontend banner components |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Always use `uv` for Python operations, never system python
- Always use `ruff` to lint before commits
- Git commits on branches, conventional commit messages
- Never push unless requested
- After UI changes, visually verify with Playwright MCP
- Frontend: React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS v4
- Backend: Python 3.13, FastAPI, SQLAlchemy async, PostgreSQL + PostGIS
- E2E tests via `web/scripts/run-e2e.sh`

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@twilio/voice-sdk` | 2.18.1 | Browser WebRTC calling via Twilio | Official Twilio SDK for browser voice; TypeScript types included [VERIFIED: npm registry] |
| `twilio` (Python) | 9.10.4 | Access Token generation, TwiML responses, REST API | Already installed; provides `AccessToken`, `VoiceGrant`, `VoiceResponse` [VERIFIED: pyproject.toml + uv run import] |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cryptography` (Fernet) | installed | Encrypt API Key secrets | Follows existing pattern from `TwilioConfigService` [VERIFIED: codebase] |
| `zustand` | 5.0.11 | Optional call state store | If call state needs sharing across components beyond prop drilling [VERIFIED: package.json] |
| `sonner` | 2.0.7 | Toast notifications for errors/fallbacks | Already used in calling flow [VERIFIED: package.json] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@twilio/voice-sdk` | Twilio REST API `calls.create()` | REST API places calls server-side (not browser audio); doesn't meet "browser-based" requirement |
| Zustand for call state | React context or useState | useState in PhoneRow is simpler; Zustand only if multiple components need call state |

**Installation:**
```bash
cd web && npm install @twilio/voice-sdk
```

No new Python packages needed -- `twilio` 9.10.4 already includes `jwt.access_token` module.

## Architecture Patterns

### Recommended Project Structure
```
app/
├── api/v1/
│   ├── voice.py              # Token generation + TwiML voice URL endpoint
│   └── webhooks.py           # Existing -- add voice status handler logic
├── models/
│   └── call_record.py        # New CallRecord model
├── services/
│   ├── twilio_config.py      # Existing -- extend for API key credentials
│   ├── twilio_webhook.py     # Existing -- reuse idempotency check
│   └── voice.py              # New VoiceService (token gen, call records, compliance checks)
├── schemas/
│   └── voice.py              # Pydantic schemas for token response, call records
alembic/versions/
│   └── 032_call_records.py   # Migration for call_records + campaign calling hours

web/src/
├── hooks/
│   └── useTwilioDevice.ts    # React hook wrapping Twilio Device lifecycle
├── components/field/
│   ├── PhoneNumberList.tsx    # Modified -- conditional browser call vs tel:
│   ├── CallStatusBar.tsx      # New -- inline timer + hang-up + mute
│   ├── CallModeIndicator.tsx  # New -- badge showing call mode
│   ├── DncBlockBanner.tsx     # New -- DNC block message
│   └── CallingHoursBanner.tsx # New -- calling hours block message
├── types/
│   └── voice.ts              # New -- Twilio call state types
```

### Pattern 1: Access Token Generation Flow
**What:** Backend generates short-lived Twilio Access Token with VoiceGrant scoped to the org's TwiML App.
**When to use:** Every time the frontend needs to initialize or refresh the Twilio Device.

```python
# Source: twilio Python SDK + Twilio Access Token docs
# [VERIFIED: uv run python inspect of AccessToken/VoiceGrant signatures]
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant

def generate_voice_token(
    account_sid: str,
    api_key_sid: str,
    api_key_secret: str,
    twiml_app_sid: str,
    identity: str,
    ttl: int = 600,
) -> str:
    token = AccessToken(
        account_sid=account_sid,
        signing_key_sid=api_key_sid,
        secret=api_key_secret,
        identity=identity,
        ttl=ttl,
    )
    voice_grant = VoiceGrant(
        outgoing_application_sid=twiml_app_sid,
        incoming_allow=False,  # No inbound calls in this phase
    )
    token.add_grant(voice_grant)
    return token.to_jwt()
```

**Key details:**
- `identity` must be alphanumeric + underscores only (Twilio Voice requirement) [CITED: docs.twilio.com/iam/access-tokens]
- Use `api_key_sid` / `api_key_secret`, NOT `auth_token` for signing (security best practice) [CITED: Twilio Access Tokens docs]
- TTL 600s (10 min) with frontend refresh via `tokenWillExpire` event [CITED: Twilio best practices]

### Pattern 2: TwiML Voice URL Handler
**What:** Twilio POSTs to this endpoint when a browser call is initiated. Returns TwiML instructions to dial the voter.
**When to use:** Called by Twilio (not by our frontend directly) for every outbound call.

```python
# Source: Twilio TwiML Dial docs + verified VoiceResponse API
# [VERIFIED: uv run python inspect of VoiceResponse.dial and Dial.number signatures]
from twilio.twiml.voice_response import VoiceResponse

async def handle_voice_url(request: Request) -> str:
    form = await request.form()
    to_number = form.get("To")
    from_number = form.get("From") or form.get("Caller")
    
    response = VoiceResponse()
    if to_number:
        # Server-side validation: check DNC, calling hours, campaign membership
        dial = response.dial(
            caller_id=org_default_voice_number,
            action="/api/v1/webhooks/twilio/voice/status",
            # status_callback for real-time status updates
        )
        dial.number(
            to_number,
            status_callback_event="initiated ringing answered completed",
            status_callback="/api/v1/webhooks/twilio/voice/status",
        )
    else:
        response.say("Invalid call request")
        response.hangup()
    return str(response)
```

### Pattern 3: Frontend Device Lifecycle Hook
**What:** React hook managing Twilio Device initialization, token refresh, call placement, and cleanup.
**When to use:** In the phone banking call page when browser calling is available.

```typescript
// Source: Twilio Voice JS SDK docs
// [CITED: twilio.com/docs/voice/sdks/javascript/twiliodevice]
import { Device, Call } from '@twilio/voice-sdk';

// Key Device events to handle:
// - 'registered': Device ready for calls
// - 'error': Display error, potentially fallback to tel:
// - 'tokenWillExpire': Fetch new token, call device.updateToken()

// Key Call events to handle:
// - 'ringing': Update status bar to "Ringing"
// - 'accept': Call connected, start duration timer
// - 'disconnect': Call ended, trigger auto-advance
// - 'error': Show error toast
// - 'mute': Update mute toggle state

// Call lifecycle: device.connect({params: {To: e164}}) -> returns Call
// Call status values: "connecting" | "ringing" | "open" | "closed"
```

### Pattern 4: Call Status Webhook Processing
**What:** Process Twilio voice status callbacks to update `call_records` with final status and duration.
**When to use:** The existing `/api/v1/webhooks/twilio/voice/status` endpoint (currently a placeholder).

```python
# Twilio POSTs these form fields on voice status callbacks:
# CallSid, CallStatus, CallDuration, From, To, Timestamp, Direction
# CallStatus values: initiated, ringing, in-progress, completed, busy, no-answer, failed, canceled
# [CITED: twilio.com/docs/voice/twiml/dial#attributes-action]
```

### Anti-Patterns to Avoid
- **Signing Access Tokens with Auth Token:** Must use API Key SID + Secret. Auth Token in JWT is a security incident. [CITED: Twilio best practices + PITFALLS.md]
- **Trusting client-side phone number:** The TwiML handler MUST validate the destination number server-side. A compromised client could dial arbitrary numbers. [ASSUMED]
- **Long-lived tokens:** Do not use 1-hour (default) or 24-hour tokens. Use 600s with auto-refresh. [CITED: Twilio best practices]
- **Skipping `device.destroy()` on unmount:** Leaks WebRTC connections and media tracks. Must clean up in React useEffect cleanup. [CITED: Twilio best practices]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebRTC audio in browser | Custom WebRTC peer connections | `@twilio/voice-sdk` Device + Call | SRTP, STUN/TURN, codec negotiation, call quality monitoring are deeply complex |
| Access Token JWT signing | Manual JWT creation | `twilio.jwt.access_token.AccessToken` | Token format is Twilio-proprietary with specific grant structures |
| TwiML XML generation | String concatenation of XML | `twilio.twiml.voice_response.VoiceResponse` | Escaping, nesting, and attribute validation handled by SDK |
| Call status tracking | Polling Twilio REST API | Status callback webhooks | Webhooks are real-time and free; polling is delayed and counts as API usage |
| WebRTC support detection | Feature-sniffing individual APIs | `Device.isSupported` static property | SDK checks all required browser APIs internally |

**Key insight:** The Twilio Voice SDK abstracts the entire WebRTC stack. The only custom code needed is: token endpoint, TwiML endpoint, webhook handler, and React UI wrapper.

## Common Pitfalls

### Pitfall 1: API Key vs Auth Token Confusion
**What goes wrong:** Using the master Auth Token to sign Access Tokens exposes the account master secret if any JWT is intercepted.
**Why it happens:** Twilio quickstart examples sometimes use Auth Token for simplicity.
**How to avoid:** Org model must store `api_key_sid` and `api_key_secret_encrypted` separately. Token generation code must never accept Auth Token as a signing credential.
**Warning signs:** JWT `iss` field contains Account SID (AC...) instead of API Key SID (SK...).
[CITED: PITFALLS.md Pitfall 3]

### Pitfall 2: TwiML App Voice URL Mismatch
**What goes wrong:** The TwiML App's Voice Request URL must be publicly accessible by Twilio. If it doesn't match the webhook base URL or is unreachable, calls fail silently.
**Why it happens:** Dev environments are behind NAT/firewalls. TwiML App URL must be the public webhook URL.
**How to avoid:** TwiML App SID is configured per-org in the admin UI. The Voice URL should be `{webhook_base_url}/api/v1/voice/twiml` (public, signed).
**Warning signs:** Calls connect but immediately drop with no audio.

### Pitfall 3: Token Identity Format
**What goes wrong:** Twilio Voice SDK identity must contain only alphanumeric characters and underscores. If user IDs contain hyphens, dashes, or special characters, token generation fails silently or the SDK refuses to register.
**Why it happens:** ZITADEL user IDs are numeric strings (e.g., "291203456789"), which are safe. But if UUIDs are used as identity, hyphens cause failure.
**How to avoid:** Use `user_id.replace("-", "_")` or use the numeric ZITADEL user ID directly as identity. Validate identity format before token generation.
[CITED: twilio.com/docs/iam/access-tokens -- "identities may only contain alpha-numeric and underscore characters"]

### Pitfall 4: Microphone Permission Denial
**What goes wrong:** Browser blocks `getUserMedia()` on first visit or after user denies permission. Call fails with no feedback.
**Why it happens:** WebRTC requires explicit microphone permission. Mobile browsers are especially strict.
**How to avoid:** Check `navigator.permissions.query({name: "microphone"})` before attempting a call. If denied, gracefully fall back to `tel:` with a toast message. The CONTEXT.md specifies this exact behavior.
**Warning signs:** "Browser calling unavailable" errors on mobile devices.

### Pitfall 5: Calling Hours Timezone Confusion
**What goes wrong:** Calling hours enforcement uses server timezone instead of voter's local timezone. 9pm ET is 6pm PT -- callers in California get blocked 3 hours early.
**Why it happens:** Campaign stores calling hours as simple time-of-day without timezone context.
**How to avoid:** Store calling hours with a timezone field (default to campaign's jurisdiction timezone). Check against voter's timezone (derived from area code or address) for per-voter enforcement. For MVP, campaign-level timezone is sufficient.
[ASSUMED -- timezone strategy needs user confirmation]

### Pitfall 6: Double Call Records
**What goes wrong:** Both the frontend (via status events) and the webhook handler create/update `call_records`, leading to duplicates or conflicting state.
**Why it happens:** The Twilio SDK fires local events AND Twilio sends webhook callbacks.
**How to avoid:** Create the `call_records` row server-side when the token endpoint is called or the TwiML handler fires. Use `twilio_sid` UNIQUE constraint for idempotent webhook updates. Frontend never creates records -- it only reads them for display.

## Code Examples

### Backend: Token Generation Endpoint

```python
# app/api/v1/voice.py
# [VERIFIED: AccessToken constructor signature via uv run python inspect]
from fastapi import APIRouter, Depends
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant

router = APIRouter()

@router.post("/token")
async def generate_voice_token(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 1. Resolve org from campaign
    # 2. Get org's Twilio credentials (api_key_sid, api_key_secret, twiml_app_sid)
    # 3. Generate Access Token
    token = AccessToken(
        account_sid=creds.account_sid,
        signing_key_sid=creds.api_key_sid,
        secret=creds.api_key_secret,
        identity=str(user.id).replace("-", "_"),
        ttl=600,
    )
    grant = VoiceGrant(outgoing_application_sid=creds.twiml_app_sid)
    token.add_grant(grant)
    return {"token": token.to_jwt()}
```

### Backend: TwiML Voice URL Handler

```python
# app/api/v1/voice.py
# [VERIFIED: VoiceResponse/Dial API via uv run python inspect]
from twilio.twiml.voice_response import VoiceResponse

@router.post("/twiml")
async def voice_twiml_handler(
    request: Request,
    org: Organization = Depends(verify_twilio_signature),
    db: AsyncSession = Depends(get_db),
):
    form = await request.form()
    to_number = form.get("To")
    call_sid = form.get("CallSid")

    response = VoiceResponse()
    
    # Server-side validation
    if not to_number:
        response.say("No destination number provided.")
        response.hangup()
        return PlainTextResponse(str(response), media_type="text/xml")
    
    # Check DNC + calling hours server-side as defense-in-depth
    # (frontend also checks, but server is authoritative)
    
    # Create initial call_record
    # Dial the number
    dial = response.dial(caller_id=org_voice_number)
    dial.number(
        to_number,
        status_callback=f"{settings.webhook_base_url}/api/v1/webhooks/twilio/voice/status",
        status_callback_event="initiated ringing answered completed",
    )
    return PlainTextResponse(str(response), media_type="text/xml")
```

### Frontend: useTwilioDevice Hook (simplified)

```typescript
// web/src/hooks/useTwilioDevice.ts
// [CITED: twilio.com/docs/voice/sdks/javascript/twiliodevice]
import { Device, Call } from '@twilio/voice-sdk';
import { useRef, useEffect, useCallback, useState } from 'react';

type CallStatus = 'idle' | 'connecting' | 'ringing' | 'open' | 'closed' | 'error';

export function useTwilioDevice(token: string | null) {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!token) return;
    const device = new Device(token, {
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      closeProtection: "A call is in progress. Leaving will end it.",
    });
    deviceRef.current = device;

    device.on('tokenWillExpire', () => {
      // Fetch new token and call device.updateToken(newToken)
    });

    device.on('error', (error) => {
      console.error('Twilio Device error:', error);
      setCallStatus('error');
    });

    device.register();
    return () => { device.destroy(); };
  }, [token]);

  const connect = useCallback(async (toNumber: string) => {
    if (!deviceRef.current) return;
    const call = await deviceRef.current.connect({ params: { To: toNumber } });
    callRef.current = call;
    setCallStatus('connecting');

    call.on('ringing', () => setCallStatus('ringing'));
    call.on('accept', () => { setCallStatus('open'); /* start timer */ });
    call.on('disconnect', () => { setCallStatus('closed'); /* stop timer */ });
    call.on('error', () => setCallStatus('error'));
    call.on('mute', (isMuted: boolean) => setIsMuted(isMuted));
  }, []);

  const disconnect = useCallback(() => callRef.current?.disconnect(), []);
  const mute = useCallback((shouldMute?: boolean) => {
    callRef.current?.mute(shouldMute);
  }, []);

  return { callStatus, isMuted, duration, connect, disconnect, mute };
}
```

### Migration: call_records Table

```python
# alembic/versions/032_call_records.py
# Follows existing patterns from 031_webhook_events.py
# [VERIFIED: migration pattern from codebase]
def upgrade() -> None:
    op.create_table(
        "call_records",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("campaign_id", sa.Uuid(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("twilio_sid", sa.String(64), nullable=True),
        sa.Column("voter_id", sa.Uuid(), sa.ForeignKey("voters.id", ondelete="SET NULL"), nullable=True),
        sa.Column("caller_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("phone_bank_session_id", sa.Uuid(), sa.ForeignKey("phone_bank_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("direction", sa.String(10), nullable=False, server_default="outbound"),
        sa.Column("from_number", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="initiated"),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Unique on twilio_sid for idempotent webhook updates
    op.create_index("ix_call_records_twilio_sid", "call_records", ["twilio_sid"], unique=True, postgresql_where=sa.text("twilio_sid IS NOT NULL"))
    # Query indexes
    op.create_index("ix_call_records_campaign_voter", "call_records", ["campaign_id", "voter_id", "created_at"])
    op.create_index("ix_call_records_campaign_caller", "call_records", ["campaign_id", "caller_user_id", "created_at"])
    
    # RLS
    op.execute("ALTER TABLE call_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE call_records FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY call_records_isolation ON call_records "
        "USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON call_records TO app_user")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio Client JS SDK v1 (CDN) | `@twilio/voice-sdk` v2 (npm) | 2022 | v1 is deprecated; v2 is GA with TypeScript support [CITED: npm package page] |
| Capability Tokens | Access Tokens with grants | 2020+ | Access Tokens are the only supported method for Voice SDK v2 [CITED: Twilio Access Tokens docs] |

**Deprecated/outdated:**
- `twilio-client.js` (v1): Replaced by `@twilio/voice-sdk` (v2). Do not use. [CITED: twilio.com/docs/voice/sdks/javascript]
- Capability Tokens: Replaced by Access Tokens. VoiceGrant is the current mechanism. [CITED: Twilio docs]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Calling hours timezone should use campaign's jurisdiction timezone, not UTC or server time | Pitfalls | Callers blocked at wrong times; voter complaints about early/late calls |
| A2 | TwiML handler should validate destination number against campaign call list | Anti-Patterns | Low risk -- defense-in-depth; frontend already constrains numbers |
| A3 | User IDs from ZITADEL are numeric strings safe for Twilio identity | Pitfall 3 | Token generation fails if IDs contain special characters |
| A4 | Org model needs 3 new encrypted fields: api_key_sid, api_key_secret_encrypted, twiml_app_sid | Architecture | Cannot generate tokens without API Key credentials separate from Auth Token |

## Open Questions

1. **API Key Storage Location**
   - What we know: The org model already has `twilio_account_sid` and `twilio_auth_token_encrypted`. The ARCHITECTURE.md research proposed these in an `org_twilio_configs` table, but Phase 88 put them directly on the `organizations` table.
   - What's unclear: Should `api_key_sid`, `api_key_secret_encrypted`, and `twiml_app_sid` go on the `organizations` table (matching current pattern) or in a separate config table?
   - Recommendation: Add columns directly to `organizations` table to match the existing Phase 88 pattern. Three new columns: `twilio_api_key_sid`, `twilio_api_key_secret_encrypted`, `twilio_api_key_secret_key_id`, `twilio_twiml_app_sid`.

2. **TwiML App Provisioning**
   - What we know: Each org needs a TwiML App SID that points to our Voice URL endpoint.
   - What's unclear: Should we auto-create the TwiML App via API when org configures Twilio, or require manual creation in Twilio Console?
   - Recommendation: Auto-create via Twilio REST API during org Twilio setup (admin saves credentials). Store SID on org. This avoids manual steps for org admins.

3. **Calling Hours Granularity**
   - What we know: CONTEXT.md says "configurable calling hours, default 9am-9pm local time, stored as campaign setting."
   - What's unclear: What timezone? Per-voter timezone enforcement or just campaign-wide?
   - Recommendation: For v1, add `calling_hours_start` (TIME), `calling_hours_end` (TIME), `calling_hours_timezone` (VARCHAR) columns to `campaigns` table. Check against campaign timezone. Per-voter timezone is a v2 enhancement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `twilio` Python SDK | Token generation, TwiML | Yes | 9.10.4 | -- |
| `cryptography` | API Key secret encryption | Yes | installed | -- |
| `@twilio/voice-sdk` npm | Frontend browser calling | No (new dep) | 2.18.1 (npm) | `npm install` in plan |
| WebRTC browser support | Browser audio | N/A (runtime) | -- | `tel:` link fallback |
| Twilio API Key (per-org) | Access Token signing | N/A (org config) | -- | Cannot generate tokens without it |
| TwiML App (per-org) | Outbound call routing | N/A (org config) | -- | Must be created per-org |

**Missing dependencies with no fallback:**
- `@twilio/voice-sdk` must be installed as frontend dependency

**Missing dependencies with fallback:**
- None -- all other dependencies are already present or are runtime/config concerns

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (backend), vitest (frontend unit), playwright (e2e) |
| Config file | `pyproject.toml` [tool.pytest], `web/vitest.config.ts`, `web/playwright.config.ts` |
| Quick run command | `uv run pytest tests/unit/test_voice*.py -x` |
| Full suite command | `uv run pytest tests/ -x` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-01 | Token generation returns valid JWT with VoiceGrant | unit | `uv run pytest tests/unit/test_voice_token.py -x` | Wave 0 |
| VOICE-01 | TwiML handler returns valid Dial XML | unit | `uv run pytest tests/unit/test_voice_twiml.py -x` | Wave 0 |
| VOICE-02 | Token endpoint returns 404/empty when org has no Twilio config | unit | `uv run pytest tests/unit/test_voice_token.py::test_unconfigured_org -x` | Wave 0 |
| VOICE-03 | Voice status webhook creates/updates call_records | unit | `uv run pytest tests/unit/test_voice_webhook.py -x` | Wave 0 |
| VOICE-03 | call_records table has RLS policy | integration | `uv run pytest tests/integration/test_call_records_rls.py -x` | Wave 0 |
| VOICE-04 | DNC check blocks call initiation | unit | `uv run pytest tests/unit/test_voice_compliance.py::test_dnc_block -x` | Wave 0 |
| VOICE-04 | Calling hours check blocks outside window | unit | `uv run pytest tests/unit/test_voice_compliance.py::test_calling_hours -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_voice*.py -x`
- **Per wave merge:** `uv run pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_voice_token.py` -- covers VOICE-01, VOICE-02 (token generation)
- [ ] `tests/unit/test_voice_twiml.py` -- covers VOICE-01 (TwiML handler)
- [ ] `tests/unit/test_voice_webhook.py` -- covers VOICE-03 (webhook processing)
- [ ] `tests/unit/test_voice_compliance.py` -- covers VOICE-04 (DNC + calling hours)
- [ ] `tests/integration/test_call_records_rls.py` -- covers SEC-04 (RLS on call_records)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Access Token with short TTL (600s), signed with API Key not Auth Token |
| V3 Session Management | Yes | Token refresh via `tokenWillExpire` event; no persistent sessions |
| V4 Access Control | Yes | RLS on call_records; campaign membership check before token issuance |
| V5 Input Validation | Yes | Server-side validation of destination number in TwiML handler; zod on frontend |
| V6 Cryptography | Yes | Fernet encryption for API Key secrets (existing pattern) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token theft enables arbitrary calls | Elevation of Privilege | Short TTL (600s), identity bound to user, server-side number validation in TwiML handler |
| Webhook spoofing | Spoofing | Existing `verify_twilio_signature` dependency validates HMAC [VERIFIED: codebase] |
| Cross-org credential leakage | Information Disclosure | Org-scoped credential lookup, never platform-level Twilio account |
| DNC bypass via direct API | Tampering | Server-side DNC check in TwiML handler (defense-in-depth beyond frontend check) |
| Toll fraud (dialing premium numbers) | Denial of Service | Validate destination is in campaign call list; restrict to US numbers initially |

## Sources

### Primary (HIGH confidence)
- Twilio Voice JavaScript SDK docs: [twilio.com/docs/voice/sdks/javascript](https://www.twilio.com/docs/voice/sdks/javascript) -- Device/Call API
- Twilio Voice JS SDK API Reference: [twilio.com/docs/voice/sdks/javascript/twiliodevice](https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice) -- Device class
- Twilio Call API Reference: [twilio.com/docs/voice/sdks/javascript/twiliocall](https://www.twilio.com/docs/voice/sdks/javascript/twiliocall) -- Call events and methods
- Twilio Access Tokens: [twilio.com/docs/iam/access-tokens](https://www.twilio.com/docs/iam/access-tokens) -- VoiceGrant, identity requirements
- Twilio Best Practices: [twilio.com/docs/voice/sdks/javascript/best-practices](https://www.twilio.com/docs/voice/sdks/javascript/best-practices) -- Token refresh, cleanup
- npm registry: `@twilio/voice-sdk` v2.18.1 -- [npmjs.com/package/@twilio/voice-sdk](https://www.npmjs.com/package/@twilio/voice-sdk)
- Python `twilio` 9.10.4 -- AccessToken/VoiceGrant/VoiceResponse API verified via `uv run python` inspection
- Existing codebase: `TwilioConfigService`, `verify_twilio_signature`, `check_idempotency`, RLS patterns, `PhoneNumberList.tsx`, `call.tsx`

### Secondary (MEDIUM confidence)
- Twilio blog: [Make and Receive Phone Calls from Browser](https://www.twilio.com/en-us/blog/make-receive-phone-calls-browser-twilio-programmable-voice-python-javascript) -- End-to-end Python + JS example
- Twilio blog: [Generate Access Tokens in Python](https://www.twilio.com/en-us/blog/twilio-access-tokens-python) -- Python-specific patterns
- `.planning/research/ARCHITECTURE.md` -- call_records table schema
- `.planning/research/PITFALLS.md` -- Security pitfalls for Twilio integration

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- @twilio/voice-sdk is the only official SDK; twilio Python package already installed and verified
- Architecture: HIGH -- Follows well-documented Twilio patterns; existing codebase patterns for models, migrations, RLS, webhooks
- Pitfalls: HIGH -- Documented in both Twilio official docs and project's own PITFALLS.md research

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable -- Twilio Voice SDK v2 is GA with infrequent breaking changes)
