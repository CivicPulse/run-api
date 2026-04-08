# Phase 92: Two-Way SMS & Opt-Out Handling - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds campaign-scoped SMS outreach and reply handling: staff can send individual and bulk texts, inbound and outbound messages thread into a usable reply inbox, and SMS STOP/START semantics keep the platform compliant without weakening tenant isolation.

The phase stops at SMS messaging, threading, and opt-out enforcement. Twilio / Campaign Verify / 10DLC registration workflows, spend telemetry, and phone validation remain outside this phase.

</domain>

<decisions>
## Implementation Decisions

### Messaging surface
- Keep SMS inside the existing campaign phone-banking / voter workflow instead of creating a separate top-level communications product area.
- Surface the reply inbox in campaign context, keyed to the voter and org phone number, so operators can move between the send view and the active conversation without leaving the campaign.
- Use the existing org phone-number inventory as the sender source; do not introduce Twilio Messaging Service pooling in this phase.

### Message and thread model
- Use dedicated campaign-scoped SMS conversation and message tables as the system of record.
- Model one conversation per `(campaign_id, voter_id, org_phone_number_id)` with immutable inbound/outbound message rows underneath it.
- Track thread state that the inbox needs, such as last message, unread count, opt-out state, and delivery status, in the SMS domain instead of overloading `voter_interactions`.
- If a generic voter-history audit entry is useful, mirror it as a summary event rather than making `voter_interactions` the canonical message store.

### Opt-out semantics
- Treat SMS unsubscribe state as channel-specific. STOP / START handling must not automatically modify the voice DNC list.
- Keep voice DNC and SMS opt-out state separate so a voter who opts out of texts is still represented correctly for calling workflows.
- Handle Twilio's standard SMS keyword family in the inbound webhook, but keep the operator-facing language centered on STOP and START.
- Future outbound sends must fail fast when the conversation is opted out, with a clear operator-facing reason.

### Eligibility and compliance
- Block outbound SMS unless the destination has an explicit SMS eligibility or consent signal. Imported voter phone numbers alone are not enough.
- Surface a compliance warning in the send UI whenever eligibility is unclear so staff understand why a send is blocked.
- Require the org to already have the necessary Twilio and carrier readiness; do not build campaign verification or messaging registration flows here.

### Job execution and callbacks
- Use the existing Procrastinate background-job pattern for bulk SMS so queued sends are observable and do not block the request lifecycle.
- Keep Twilio callback handling on the existing public webhook layer and resolve org context from the Twilio phone number, consistent with the webhook infrastructure from Phase 90.
- Use Twilio Message SID idempotency so retries do not duplicate message rows or thread side effects.

### the agent's Discretion
- Exact inbox route, composer placement, and message list density.
- Exact SMS table names and column ordering, provided they remain campaign-scoped and support thread state, message history, and unread tracking.
- Exact copy for opt-out, consent, and failure warnings.

</decisions>

<canonical_refs>
## Canonical References

### Requirements and roadmap
- `.planning/ROADMAP.md` - phase 92 boundary, milestone goal, and success criteria.
- `.planning/REQUIREMENTS.md` - SMS-01 through SMS-04, COMP-01, COMP-02, SEC-04, and explicit out-of-scope items.

### Research notes
- `.planning/research/FEATURES.md` - opt-out management, consent warnings, and SMS feature expectations.
- `.planning/research/PITFALLS.md` - SMS STOP channel separation, shared-number risks, and TCPA / A2P pitfalls.
- `.planning/research/SUMMARY.md` - proposed SMS conversation / message architecture and idempotency strategy.
- `.planning/research/ARCHITECTURE.md` - webhook and STOP-processing patterns, including immediate opt-out handling.

### Reusable backend seams
- `app/api/v1/webhooks.py` - existing Twilio SMS webhook stubs and voice webhook patterns.
- `app/services/twilio_webhook.py` - signature validation, public URL reconstruction, and org resolution by Twilio phone number.
- `app/services/org_phone_number.py` - org default sender selection and capability checks.
- `app/services/dnc.py` - campaign DNC checks; use as the voice baseline, not the SMS opt-out system of record.
- `app/services/voice.py` - compliance-check and Twilio config access patterns to mirror for SMS send decisions.
- `app/models/voter_interaction.py` and `app/services/voter_interaction.py` - immutable event-log pattern for optional audit summaries, not the canonical conversation store.
- `app/models/webhook_event.py` - webhook idempotency table and conflict-avoidance pattern.

### Reusable frontend patterns
- `web/src/routes/campaigns/$campaignId/phone-banking.tsx` - existing campaign module nav shell where a messages or inbox view can fit.
- `web/src/components/field/PhoneNumberList.tsx` - existing compliance-aware phone action list pattern.
- `web/src/components/field/CallStatusBar.tsx` - compact in-progress communication status UI.
- `web/src/components/field/DncBlockBanner.tsx` and `web/src/components/field/CallingHoursBanner.tsx` - alert and banner patterns for blocked actions.
- `web/src/components/org/PhoneNumbersCard.tsx` and `web/src/routes/org/settings.tsx` - org default SMS sender and capability display patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/twilio_webhook.py` already resolves org context from Twilio phone numbers and validates signatures against the reconstructed public webhook URL.
- `app/api/v1/webhooks.py` already contains `/sms/inbound` and `/sms/status` placeholders for Phase 92.
- `app/services/org_phone_number.py` already provides the org's default SMS sender and capability validation path.
- `app/services/dnc.py` already provides campaign-scoped phone blocking, which is the baseline pattern for compliance gating.
- `web/src/components/org/PhoneNumbersCard.tsx` already shows default SMS number selection and capability badges in org settings.

### Established Patterns
- Background work uses Procrastinate and returns quickly from the request path.
- Campaign-scoped features generally resolve campaign context early, then keep all sender-specific operations isolated to that campaign.
- Existing UI uses concise alert banners and status chips for compliance and availability states.
- Twilio webhooks must be idempotent and safe under retries; `webhook_events` is the existing conflict-avoidance pattern.

### Integration Points
- SMS send logic should share the same org phone-number inventory as voice and webhooks.
- Inbound message handling should attach to the campaign and voter conversation state, then optionally record a summary event for the generic voter history timeline.
- The phone-banking module is the most likely place for a reply inbox entry point and quick-send affordance.

</code_context>

<specifics>
## Specific Ideas

- Operators need an immediate explanation when a number is blocked because it is opted out or lacks clear SMS consent.
- SMS sends should feel conservative by default: block first, then explain why.
- The reply inbox should remain inside the campaign workflow, not a separate admin console.

</specifics>

<deferred>
## Deferred Ideas

- Twilio / Campaign Verify / 10DLC registration workflows.
- Twilio Conversations API as the messaging layer.
- Spend controls and communication telemetry for Phase 93.
- Lookup-based number validation and caching for Phase 94.

</deferred>

