# Phase 93: Spend Controls & Communication Telemetry - Research

**Researched:** 2026-04-08
**Domain:** Twilio spend controls, communication telemetry, org settings administration
**Confidence:** HIGH

## Summary

Phase 93 should build on the communication primitives already in place instead of introducing a second billing model. The repo now has billable voice records in `call_records`, canonical outbound/inbound SMS records in `sms_messages`, org-scoped Twilio credentials in `organizations`, and operator-facing settings UI in `web/src/routes/org/settings.tsx`. The missing capability is an org-scoped control plane that can answer two questions before new work starts:

1. Is this org already beyond its soft budget for Twilio communication work?
2. What durable telemetry should be recorded now so later reporting does not need to reconstruct history from raw provider callbacks?

The cleanest fit is:

1. **Org-scoped spend policy fields** on `organizations` for soft budget configuration and warning thresholds.
2. **A unified append-only communication ledger** that stores one row per billable or potentially billable voice/SMS event with enough dimensions for future reporting.
3. **A shared budget service** that computes best-known spend totals, distinguishes pending from final cost, and gates new voice/SMS work before launch.
4. **A compact org settings surface** that exposes threshold inputs, summary chips, and recent voice/SMS activity without becoming a full analytics dashboard.

## Locked Decisions

- Budgets are org-scoped because Twilio billing and phone inventory are org-owned.
- This phase enforces soft limits only. It blocks new work when over budget but does not cancel already-running provider actions.
- Budget checks happen before browser voice call start, single SMS send, and bulk SMS queue launch.
- Telemetry is platform-owned and append-only; Twilio callbacks refine provisional rows rather than replacing the ledger model.
- Operator-facing admin UI lives inside `org/settings` as a compact `Twilio Spend & Telemetry` card.

## Requirements Coverage

| ID | Description | Research Support |
|----|-------------|------------------|
| BUD-01 | Org admins can see Twilio spend and configure platform soft limits that gate billable communication actions before overspend | Org fields + shared budget service + org settings card + budget gate hooks |
| OBS-01 | Call and message metadata is stored with enough structure to support future per-voter, per-campaign, and per-org effectiveness reporting | Unified communication ledger keyed by org/campaign/voter/channel/provider sid |

## Recommended Architecture

### Pattern 1: Unified Communication Ledger

Use one append-only table such as `communication_ledgers` rather than separate voice and SMS spend tables. Each row should include:

- `org_id`
- `campaign_id`
- `voter_id`
- `channel` (`voice`, `sms`)
- `event_type` (`voice.call.started`, `voice.call.completed`, `sms.outbound.queued`, `sms.outbound.sent`, `sms.outbound.delivered`)
- `provider_sid`
- `status`
- `estimated_price_cents`
- `final_price_cents`
- `cost_pending`
- `occurred_at`

This keeps reporting simple and lets the budget service aggregate by org while preserving campaign/voter drill-down.

### Pattern 2: Soft-Budget Gate Before Work Launch

Voice and SMS should both call the same budget service before work starts:

- voice browser-call creation
- single SMS send
- bulk SMS queue launch

The gate should return structured reasons such as `budget_over_limit`, `budget_near_limit`, and `cost_pending`. UI clients should never need to parse freeform error strings.

### Pattern 3: Provisional Then Final Cost

Twilio pricing may not be known at initiation time. The ledger should accept provisional rows with `cost_pending=true` and fill `final_price_cents` later from terminal voice/SMS callbacks when price information is available. Budget checks should use the best-known total: final cost where present, otherwise estimated/provisional cost.

### Pattern 4: Org Settings Reuse

The existing org settings page already hosts Twilio readiness and phone inventory. Phase 93 should extend that surface rather than add a new route:

- soft budget input
- warning threshold input or derived near-limit status
- summary chips/cards for healthy / near limit / over budget / pending cost
- recent communication activity list across voice and SMS

## Existing Code Seams

### Backend

- `app/models/call_record.py` already stores `price_cents` and Twilio call status on voice records.
- `app/models/sms_message.py` already stores Twilio message SID and send status on SMS records.
- `app/services/voice.py` is the budget choke point for browser call start.
- `app/services/sms.py` is the budget choke point for single-send and bulk-send.
- `app/api/v1/org.py`, `app/schemas/org.py`, and `app/services/org.py` already expose the org settings API surface.
- `app/api/v1/webhooks.py` is the correct place to refine provisional telemetry with terminal provider status and pricing.

### Frontend

- `web/src/routes/org/settings.tsx` is already the compact admin surface for Twilio configuration.
- `web/src/routes/campaigns/$campaignId/phone-banking/sessions/$sessionId/call.tsx` already handles operator-facing call failures and can surface budget blocks inline.
- `web/src/routes/campaigns/$campaignId/phone-banking/messages.tsx` and SMS hooks are the right place to surface send and queue blocks inline.

## Common Pitfalls

### Pitfall 1: Mixing spend policy with provider billing

This phase should not attempt to configure Twilio-side budget controls or suspend the account. Keep the platform budget as advisory enforcement before new work.

### Pitfall 2: Recording only final provider cost

If the ledger stores rows only when Twilio sends back final price, operator views cannot explain current usage during active work. Provisional rows are required.

### Pitfall 3: Gating only one communication channel

Budget enforcement must apply consistently to both voice and SMS. A shared service is required so limits do not drift between channel-specific implementations.

### Pitfall 4: Burying the block reason in toasts

Both the org settings card and the call/message workflows need machine-readable reasons so blocked actions can be explained inline.

## Recommended Plan Split

| Plan | Wave | Why it exists |
|------|------|----------------|
| 93-01 | 1 | Add org budget fields, communication ledger model/migration, and the shared budget/telemetry service foundation |
| 93-02 | 2 | Integrate budget gating and telemetry writes into voice, SMS, callbacks, and org API responses |
| 93-03 | 3 | Add the org settings spend/telemetry UI and inline budget-block surfaces for calling and messaging workflows |

Wave 2 depends on the shared ledger + service foundation from Wave 1. Wave 3 depends on the new API fields and enforcement signals from Wave 2.
