# Phase 94: Twilio Lookup Validation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Contact workflows can validate and cache Twilio Lookup intelligence for phone numbers used in voter contact flows. The phase covers create/edit validation and shared SMS-eligibility reads using cached carrier and line-type data. It does not add carrier registration, import-time bulk validation, or any new call/SMS sending surface beyond reusing the cached lookup result.

The cache is meant to reduce Twilio API churn while keeping contact CRUD available even when Twilio Lookup is slow or temporarily unavailable.

</domain>

<decisions>
## Implementation Decisions

### Cache model
- **D-01:** Use a dedicated `phone_validations` cache table instead of adding Twilio lookup fields to `VoterPhone`.
- **D-02:** Key cache rows by `(campaign_id, phone_number)` so validation is reusable within the campaign contact workflow and can be refreshed independently of the voter phone record.
- **D-03:** Persist both the normalized validation summary and the raw Twilio Lookup payload, including `valid`, `carrier_name`, `line_type`, `lookup_data`, and `validated_at`.
- **D-04:** Treat `VoterPhone.type` as import/source data only; do not overwrite it with Twilio's line-type classification.

### Validation flow
- **D-05:** Run Twilio Lookup on contact create/edit after local phone-format validation, not on every read.
- **D-06:** Reuse cached results until stale; refresh opportunistically when the cache is missing or older than the agreed TTL.
- **D-07:** Use a 90-day freshness window for cached lookup results, matching the research recommendation.
- **D-08:** A Twilio Lookup failure or outage must not block saving the contact; the record should stay editable and show validation as pending/unknown.

### SMS eligibility semantics
- **D-09:** Conservative classification wins: `mobile` is SMS-capable, `landline` is not, and `voip`/unknown results are not text-safe by default.
- **D-10:** SMS send eligibility checks should consume the same cached validation record so the UI can warn staff before they initiate a send.
- **D-11:** If cached data is stale at send time, revalidate once before deciding; do not churn repeated lookups on repeated reads.

### Operator surface
- **D-12:** The visible entry point remains the voter contact edit surface, with a validation badge or freshness state near the phone field.
- **D-13:** Any shared phone-number list or SMS-preflight surface should consume the same summary object rather than inventing a separate validation state machine.

### the agent's Discretion
- Exact badge labels, copy, and iconography.
- Whether stale cache refresh runs synchronously or is queued after a successful save.
- Whether the API exposes a compact summary shape or the raw payload directly, as long as the cache remains the source of truth.

</decisions>

<specifics>
## Specific Ideas

- Staff should be able to tell at a glance whether a number is valid, mobile, landline, or still awaiting lookup.
- Lookup usage should feel invisible during normal contact editing; the main signal is the badge and eligibility warning, not a new workflow.
- The lookup cache should be reusable by SMS eligibility checks so the same number is not validated repeatedly just because the UI revisits it.

</specifics>

<canonical_refs>
## Canonical References

### Requirements and roadmap
- `.planning/ROADMAP.md` - phase 94 goal, success criteria, and milestone placement
- `.planning/REQUIREMENTS.md` - LOOK-01 plus SMS-01, SMS-02, and COMP-01 boundary conditions

### Prior phase outputs
- `.planning/phases/92-two-way-sms-opt-out-handling/92-CONTEXT.md` - SMS eligibility and opt-out model this phase must not break
- `.planning/phases/92-two-way-sms-opt-out-handling/92-VERIFICATION.md` - confirms the SMS send and threading behavior already in place
- `.planning/phases/93-spend-controls-communication-telemetry/93-CONTEXT.md` - records the cache-first lookup deferral and spend-control boundary for billable Twilio actions

### Lookup research
- `.planning/research/SUMMARY.md` - cache-first recommendation, 90-day TTL, and `phone_validations` direction
- `.planning/research/FEATURES.md` - free basic validation, paid line-type intelligence, and not overwriting `VoterPhone.type`
- `.planning/research/PITFALLS.md` - cost explosion and stale-refresh cautions
- `.planning/research/ARCHITECTURE.md` - `phone_validations` schema direction and UI integration notes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/voter_contact.py` already owns phone add/update/delete flow, so it is the natural backend seam for validation hooks.
- `web/src/components/voters/ContactsTab.tsx` is the visible contact-edit surface where validation status can be shown inline.
- `web/src/components/field/PhoneNumberList.tsx` and SMS send gating paths can consume the same validation summary if the API exposes it.

### Established Patterns
- Contact CRUD should remain available even when external Twilio APIs are degraded; structured warnings are better than hard failures for lookup-only issues.
- The codebase already separates user-entered contact data from derived communication metadata, which fits a dedicated validation cache.
- Existing SMS eligibility logic can be extended by reading cached validation results rather than issuing ad hoc lookup calls.

### Integration Points
- Phone create/update API responses are the primary place to surface validation state back to the frontend.
- SMS preflight/eligibility checks are the second consumer of the cached lookup record.
- Any background refresh job should stay separate from the user-facing CRUD path so contact edits remain responsive.

</code_context>

<deferred>
## Deferred Ideas

- Batch validation during CSV import.
- Org-wide deduplicated lookup cache beyond campaign scope.
- Advanced carrier metadata such as CNAM or other enrichment beyond carrier and line type.
- Automated periodic refresh jobs outside the contact-edit and SMS-preflight paths.

</deferred>

---

*Phase: 94-twilio-lookup-validation*
*Context gathered: 2026-04-08*
