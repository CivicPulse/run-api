# Phase 91: Browser Voice Calling - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase replaces the existing `tel:` link phone calling in the phone banking flow with Twilio Voice SDK browser-based calling when the org has Twilio configured and the browser supports WebRTC. Unconfigured orgs or unsupported browsers fall back to the existing `tel:` behavior. Call metadata is logged to a new campaign-scoped table with RLS, and pre-call DNC and calling-hours checks prevent non-compliant outreach.

</domain>

<decisions>
## Implementation Decisions

### Voice Call UX
- Replace the `tel:` link in `PhoneNumberList` component with an in-browser call button when Twilio is configured and WebRTC is available.
- Show a minimal inline status bar below the phone number during a call: call duration timer + hang-up button. Volunteer stays on the same screen.
- Browser audio through device speakers/headset with a mute toggle. Twilio Voice SDK handles WebRTC audio automatically.
- When a call ends, auto-advance to the outcome recording step (same flow as after current `tel:` call).

### Fallback & Compatibility
- Detect support by checking both WebRTC availability (`navigator.mediaDevices.getUserMedia`) AND org Twilio configuration. Both must be true for in-browser calling.
- When in-browser calling is unavailable, preserve the existing `tel:` link behavior unchanged — native dialer link and clipboard copy still work.
- Show a small badge/indicator on the call button: "Browser Call" vs "Phone" so the volunteer knows which method will be used.
- Mode is auto-detected — no manual toggle between browser call and tel: link.

### Call Logging & Compliance
- Log call metadata: Call SID, duration, status (initiated/ringing/in-progress/completed/failed/busy/no-answer), from/to numbers, org_id, campaign_id, caller_user_id, started_at, ended_at.
- New `call_records` table (campaign-scoped with RLS) — separate from `webhook_events` which is org-scoped.
- Check DNC list before allowing call initiation — block the call button if voter's number is on DNC. Use existing `DNCService.is_dnc_number()`.
- Enforce calling-hours guardrails: check against configurable calling hours (default 9am-9pm local time) before allowing call. Block with clear message. Calling hours stored as campaign setting.

### Claude's Discretion
- Twilio Voice SDK token generation endpoint design (TwiML App SID, capability token vs access token)
- Exact TwiML application configuration for outbound calls
- Call status webhook handler implementation (building on Phase 90 webhook infrastructure)
- Specific React component structure for the call control UI
- Calling hours storage schema (campaign-level setting columns vs separate config table)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/src/components/field/PhoneNumberList.tsx` — current `tel:` link component with clipboard fallback (line 138)
- `app/services/twilio_config.py` — `TwilioConfigService.get_twilio_client()` for Twilio REST API calls
- `app/services/twilio_webhook.py` — Phase 90 webhook infrastructure (signature validation, org resolution, idempotency)
- `app/api/v1/webhooks.py` — placeholder `/voice/status` endpoint ready for implementation
- `app/services/dnc.py` — `DNCService` with `is_dnc_number()` for pre-call checks
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx` — active calling page with state machine

### Established Patterns
- Phone banking flow: claim entry → show voter info → dial → record outcome → next entry
- State machine pattern in call.tsx: idle → claiming → claimed → recording → recorded → complete
- TanStack Query hooks for data fetching, mutations for actions
- Field mode components in `web/src/components/field/`

### Integration Points
- Twilio Voice SDK JS library needs to be added to frontend dependencies
- New backend endpoint for generating Twilio capability/access tokens
- Call status webhook handler in the existing `/api/v1/webhooks/twilio/voice/status` route
- New `call_records` table with campaign-scoped RLS policy
- Campaign settings extension for calling hours configuration

</code_context>

<specifics>
## Specific Ideas

- The call button should clearly distinguish between "Browser Call" (headphone icon?) and "Phone" (phone icon) modes.
- Call duration should update in real-time during the call.
- If the microphone permission is denied, gracefully fall back to `tel:` behavior with a toast explaining why.
- The calling-hours block message should show the allowed window: "Calling hours are 9 AM - 9 PM. Current time is X."

</specifics>

<deferred>
## Deferred Ideas

- Call recording (audio) — requires additional compliance considerations.
- Voicemail drop — explicitly out of scope per PROJECT.md.
- Predictive/auto-dialer — explicitly out of scope per PROJECT.md.
- Call quality metrics (MOS scores, jitter) — future observability concern.

</deferred>
