---
phase: 94
slug: twilio-lookup-validation
status: complete
created: 2026-04-08
---

# Phase 94 — Research Notes

## Objective

Add cached Twilio Lookup intelligence to voter-contact CRUD and SMS eligibility without turning contact editing into a provider-dependent workflow.

## Existing Seams

### Backend

- `app/services/voter_contact.py` already owns phone add/update/delete and is the correct insertion point for validation on create/edit.
- `app/models/voter_contact.py` currently stores source contact data only. It already carries `sms_allowed`, so lookup-derived intelligence should stay separate rather than mutating contact source fields.
- `app/api/v1/voter_contacts.py` and `app/schemas/voter_contact.py` control the request/response surface that can return validation summaries immediately after writes and on list reads.
- `app/services/sms.py` currently blocks SMS when `VoterPhone.type` is not `cell/mobile` or when consent is missing. That makes it the natural second consumer of cached lookup results.
- `app/services/twilio_config.py` already centralizes org-scoped Twilio credential resolution and client creation. Lookup should reuse that seam instead of instantiating Twilio clients ad hoc.

### Frontend

- `web/src/hooks/useVoterContacts.ts` and `web/src/types/voter-contact.ts` define the contact payload contract used by the UI.
- `web/src/components/voters/ContactsTab.tsx` is the primary phase-94 UI surface for inline badges, summaries, and refresh actions.
- `web/src/routes/campaigns/$campaignId/phone-banking/messages.tsx` already renders eligibility-driven warning states and is the correct SMS-preflight reuse point.

### Test Surfaces

- `tests/unit/test_voter_contacts.py` already covers `VoterContactService` phone CRUD and can absorb cache/refresh behavior.
- `tests/unit/test_sms_api.py` and SMS service tests already model eligibility decisions and should be extended for lookup-aware SMS safety.
- `web/src/components/voters/` currently lacks direct ContactsTab tests, so phase 94 should add focused component coverage instead of relying on broader route tests.

## Decisions Confirmed

- Use a dedicated `phone_validations` table keyed by `(campaign_id, phone_number)` rather than storing lookup output on `VoterPhone`.
- Cache summary fields plus raw payload so the platform can reuse lookup facts without reparsing provider output later.
- Use a 90-day freshness window; stale or missing cache can trigger a refresh, but contact save must still succeed when Twilio Lookup is unavailable.
- SMS should treat only `mobile` as text-safe by default. `landline`, `voip`, and unknown results stay blocked or review-needed.
- Do not overwrite `VoterPhone.type`; imported/source contact typing remains distinct from Twilio-derived classification.

## Recommended Implementation Shape

1. Add `PhoneValidation` storage and a small Twilio Lookup service that:
   - normalizes phone numbers
   - reuses `TwilioConfigService`
   - reads/writes cache rows
   - returns a compact summary object plus stale/pending/error state
2. Extend voter-contact service/API so phone add/update/list responses include validation summaries and a manual refresh entry point.
3. Update SMS eligibility to consume cached validation summaries, performing at most one refresh when the cache is stale at send time.
4. Add reusable frontend components for badge, summary, and warning surfaces, then wire them into `ContactsTab` and SMS preflight UI.

## Risks

- Twilio Lookup failures must not roll back otherwise valid contact edits.
- Campaign-scoped caching may duplicate numbers across campaigns by design; avoid accidentally widening the scope to org-wide reuse in this phase.
- SMS gating must combine existing consent/opt-out checks with lookup safety instead of replacing them.
