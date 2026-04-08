# Phase 92: Two-Way SMS & Opt-Out Handling - Research

**Researched:** 2026-04-07
**Domain:** Twilio Programmable Messaging, two-way SMS inboxes, compliance gating, campaign-scoped conversation storage
**Confidence:** HIGH

## Summary

Phase 92 can build directly on the Twilio foundation already in the codebase. The project now has org-scoped Twilio credentials, org phone-number inventory with `sms_capable` and `default_sms_number_id`, webhook signature validation keyed by the inbound `To` number, and voice-era webhook idempotency via `webhook_events`. The missing pieces are the SMS domain itself: campaign-scoped conversation/message persistence, compliance gating before send, Procrastinate-backed bulk send orchestration, inbound webhook processing for reply threading, and operator-facing inbox/send UI in the campaign phone-banking workflow.

The cleanest fit is a split architecture:

1. **Campaign-scoped storage** for `sms_conversations` and `sms_messages`, both protected by the existing campaign RLS pattern.
2. **Org-scoped compliance memory** for SMS opt-out / resume state keyed by `(org_id, normalized_phone_number)` so STOP/START semantics apply consistently across the org's messaging work without mutating voice DNC data.
3. **A dedicated SMS service layer** that owns eligibility checks, Twilio REST sends, conversation upserts, webhook idempotency, and optional voter-history summary events.
4. **Campaign UI** mounted inside the existing phone-banking shell as a `Messages` surface, using the same shadcn/TanStack patterns already established in the frontend.

**Primary recommendation:** plan the phase as four executable slices: data foundation, outbound send pipeline, inbound/threading pipeline, and frontend inbox/composer UI. This keeps the backend send path and inbound webhook path independently testable while preserving a single conversation model for the UI.

<user_constraints>
## User Constraints (from CONTEXT.md and UI-SPEC.md)

### Locked Decisions
- SMS stays inside the existing campaign phone-banking / voter workflow, not a separate communications product.
- The reply inbox is campaign-contextual and keyed to the voter and org phone number.
- Use the existing org phone-number inventory as the sender source; no Messaging Service pooling in this phase.
- The canonical message store is a dedicated SMS domain, not `voter_interactions`.
- SMS opt-out state is channel-specific and must not mutate voice DNC state.
- Outbound SMS must fail fast when explicit SMS eligibility or consent is missing.
- Bulk sends use the existing Procrastinate job pattern and must remain observable.
- Inbound webhook routing should reuse Phase 90 public webhook validation and org resolution.
- UI stays within the neutral shadcn/new-york contract: two-pane inbox on desktop, stacked layout on mobile, sticky composer, bulk-send sheet/dialog, and inline compliance banners.

### Claude's Discretion
- Exact table names and model boundaries within the SMS domain.
- Exact API route layout as long as it remains campaign-scoped for operator actions and webhook-scoped for Twilio callbacks.
- Exact copy for compliance, opt-out, and failure banners.
- Exact placement of the `Messages` route inside the phone-banking shell.

### Deferred Ideas (OUT OF SCOPE)
- Twilio Conversations API.
- 10DLC / Campaign Verify / registration workflows.
- Spend controls and communication telemetry (Phase 93).
- Lookup-based phone validation and cache enrichment (Phase 94).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMS-01 | Staff can send an individual SMS to a voter from the product only when that number is eligible for SMS outreach | Campaign send endpoint + eligibility gate + sender selection service |
| SMS-02 | Staff can launch bulk SMS outreach to a voter segment through the existing background-job infrastructure with observable send status | Procrastinate task + batch status rows + UI progress surface |
| SMS-03 | Staff can read and continue two-way SMS conversations in a reply inbox tied back to the voter and org phone number | `sms_conversations` + `sms_messages` + list/detail API + inbox UI |
| SMS-04 | Inbound STOP, START, and related opt-out keywords sync platform unsubscribe state so SMS outreach respects voter choice | Twilio inbound webhook parser + org-scoped SMS preference store + send-time gate |
| COMP-01 | SMS send flows gate on explicit eligibility or consent signals and surface compliance warnings for numbers without clear SMS consent | Service-level eligibility policy + disabled composer + warning banner |
| COMP-02 | The milestone does not introduce predictive dialing, ringless voicemail, or other explicitly out-of-scope auto-dialer behavior | Only staff-initiated sends and queued batch sends; no autodialer semantics |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `twilio` | installed | Outbound SMS create + webhook payload conventions | Already used for voice/Twilio integrations |
| `procrastinate` | existing | Bulk SMS fan-out job execution | Existing background-job standard in this repo |
| FastAPI + SQLAlchemy async | existing | API + persistence | Project standard |
| TanStack Query + TanStack Router + shadcn/ui | existing | Inbox/composer UI | Existing frontend standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `webhook_events` table | existing | Idempotent webhook delivery tracking | Every inbound/status webhook write path |
| `VoterInteractionService` | existing | Optional audit summary events in voter history | Mirror send/reply summaries without making it the source of truth |
| `OrgPhoneNumberService` / `OrgPhoneNumber` | existing | Default SMS sender resolution and capability flags | Sender selection and org routing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Internal conversation/message tables | Twilio Conversations API | Faster bootstrap, but adds external canonical state and reduces tenant-control clarity |
| Org-scoped SMS preference table | Campaign-only opt-out flags | Simpler schema, but weaker unsubscribe semantics when the same org texts the same voter across campaigns |
| Procrastinate bulk send tasks | Synchronous loop in request handler | Violates existing background-job pattern and makes large sends fragile |

## Architecture Patterns

### Recommended Project Structure

```text
app/
├── api/v1/
│   ├── sms.py                   # campaign-scoped send/inbox endpoints
│   └── webhooks.py              # existing Twilio webhook ingress, extended for SMS
├── models/
│   ├── sms_conversation.py      # campaign-scoped conversation aggregate
│   ├── sms_message.py           # immutable inbound/outbound message log
│   └── sms_opt_out.py           # org-scoped SMS preference state
├── schemas/
│   └── sms.py                   # inbox, send, bulk-send, webhook-facing schemas
├── services/
│   └── sms.py                   # eligibility, send orchestration, inbound threading
├── tasks/
│   └── sms_tasks.py             # Procrastinate batch send tasks
└── api/v1/router.py             # register campaign SMS routes

web/src/
├── hooks/
│   ├── useSmsInbox.ts
│   └── useSmsSend.ts
├── types/
│   └── sms.ts
├── components/field/
│   ├── SmsConversationList.tsx
│   ├── SmsThreadPanel.tsx
│   ├── SmsComposer.tsx
│   ├── SmsEligibilityBanner.tsx
│   └── SmsBulkSendSheet.tsx
└── routes/campaigns/$campaignId/phone-banking/messages.tsx
```

### Pattern 1: Conversation Aggregate + Immutable Message Rows

Use a stable conversation row per `(campaign_id, voter_id, org_phone_number_id)` with immutable child messages. Keep inbox-derived fields like `last_message_at`, `last_direction`, `last_status`, `unread_count`, and `opt_out_status` denormalized on the conversation row for fast list rendering.

### Pattern 2: Separate SMS Opt-Out from Voice DNC

Voice DNC already exists per campaign. SMS opt-out should live in a distinct SMS domain, keyed to the org and normalized phone number, and be surfaced back onto conversations for UI convenience. STOP/START processing updates SMS preference state only; outbound SMS gates consult both the campaign DNC rules (if required by campaign policy) and the SMS preference state, but do not write back to the voice DNC list.

### Pattern 3: Twilio SID Idempotency Everywhere

- Outbound message creation stores `MessageSid` on the canonical message row.
- Inbound webhook processing uses `MessageSid + sms.inbound` in `webhook_events`.
- Delivery-status callbacks use `MessageSid + sms.status.{MessageStatus}`.

This mirrors the voice/webhook pattern already implemented in [app/services/twilio_webhook.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/twilio_webhook.py).

### Pattern 4: Eligibility Gate Before Every Send

The repo currently has no first-class SMS consent field. The least risky phase-92 approach is to centralize eligibility in `SMSService.check_eligibility(...)` and make it explicit:

- allow only `VoterPhone` entries that are `type in {"cell", "mobile"}` or have high-confidence mobile metadata,
- reject sends when the number is SMS-opted-out,
- reject sends when no explicit SMS-eligible signal exists in a dedicated field or derived policy,
- return machine-readable reasons that the UI can show inline.

The plans should add an explicit field or preference record rather than leaving this purely heuristic.

### Pattern 5: Phone-Banking Shell Reuse

The existing phone-banking route tree already contains session-oriented routes and reusable field components. A sibling `messages` route under the campaign phone-banking shell is the lowest-friction way to add SMS without introducing another navigation model.

## Existing Code Seams

### Backend
- [app/api/v1/webhooks.py](/home/kwhatcher/projects/civicpulse/run-api/app/api/v1/webhooks.py) already contains `/sms/inbound` and `/sms/status` placeholders.
- [app/services/twilio_webhook.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/twilio_webhook.py) already validates signatures and resolves orgs from Twilio `To` numbers.
- [app/services/org_phone_number.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/org_phone_number.py) already knows default SMS numbers and capability checks.
- [app/models/voter_contact.py](/home/kwhatcher/projects/civicpulse/run-api/app/models/voter_contact.py) provides the `VoterPhone` model that send eligibility and conversation matching will use.
- [app/services/voter_interaction.py](/home/kwhatcher/projects/civicpulse/run-api/app/services/voter_interaction.py) is suitable for summary audit events only.

### Frontend
- [web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx](/home/kwhatcher/projects/civicpulse/run-api/web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx) shows the current phone-banking interaction model and field-component composition.
- [web/src/components/field/PhoneNumberList.tsx](/home/kwhatcher/projects/civicpulse/run-api/web/src/components/field/PhoneNumberList.tsx) already handles per-number compliance banners, which should be mirrored for SMS.
- [web/src/components/voters/HistoryTab.tsx](/home/kwhatcher/projects/civicpulse/run-api/web/src/components/voters/HistoryTab.tsx) is a useful pattern reference for timeline rendering, badges, and simple composer interactions.

## Common Pitfalls

### Pitfall 1: Treating imported phone numbers as SMS-consented
Imported `VoterPhone` rows only encode source/type/primary state today. Planning must introduce an explicit SMS eligibility source of truth rather than silently assuming all cell numbers can be texted.

### Pitfall 2: Using campaign-only opt-out state
Campaign-only STOP handling is easy to implement but weak on compliance semantics. The plans should keep the inbox campaign-scoped while storing the SMS unsubscribe preference at org scope.

### Pitfall 3: Letting inbound webhook matching create cross-campaign bleed
An org phone number may be reused inside the same org across campaigns. Inbound matching must choose a single campaign conversation deterministically, ideally from the most recent active conversation for that `(org_phone_number_id, voter_phone)` pair or an explicit outbound association.

### Pitfall 4: Updating status callbacks without guarding duplicates
Twilio retries aggressively. Delivery status updates must be idempotent and must not create duplicate unread counts or duplicate audit events.

### Pitfall 5: Building the UI before the inbox summary fields exist
The frontend needs stable list-query fields (`last_message_preview`, `unread_count`, `last_status`, `opt_out_status`, `last_direction`) to avoid expensive client-side reconstruction from the full message log.

## Validation Architecture

Phase 92 should validate along four boundaries:

1. **Persistence correctness**: model/migration tests for conversations, messages, opt-out preferences, and RLS.
2. **Service correctness**: eligibility gating, send orchestration, inbound threading, and STOP/START behavior.
3. **Webhook idempotency**: inbound + status callbacks remain safe under duplicate delivery.
4. **UI behavior**: inbox list/detail, composer gating, bulk-send progress, and mobile/desktop layout.

Recommended quick commands:

```bash
uv run pytest tests/unit/test_sms_models_schemas.py tests/unit/test_sms_service.py tests/unit/test_sms_api.py tests/unit/test_sms_webhooks.py -x -q
cd web && npm test -- --runInBand src/routes/campaigns/$campaignId/phone-banking/messages.test.tsx
```

## Recommended Plan Split

| Plan | Wave | Why it exists |
|------|------|----------------|
| 92-01 | 1 | Establish storage, schemas, and core service contracts |
| 92-02 | 2 | Outbound individual + bulk send backend on top of the new service layer |
| 92-03 | 2 | Inbound reply threading and STOP/START handling using the shared storage |
| 92-04 | 3 | Campaign UI once the list/detail/send APIs exist |

Wave 2 can run in parallel because outbound-send plumbing and inbound-threading plumbing both depend only on the shared Phase 92 data/service foundation from Wave 1.
