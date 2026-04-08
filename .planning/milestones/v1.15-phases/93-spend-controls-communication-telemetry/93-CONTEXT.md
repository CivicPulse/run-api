# Phase 93: Spend Controls & Communication Telemetry - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds org-level spend visibility, soft budget configuration, and durable communication telemetry over the Twilio voice and SMS flows already shipped in phases 91 and 92.

The phase stops at platform-side soft limits and reporting-ready metadata. It does not introduce hard financial controls inside Twilio, billing exports, invoice generation, or downstream analytics dashboards beyond the minimum org settings visibility needed to operate safely.

</domain>

<decisions>
## Implementation Decisions

### Budget scope and enforcement
- Budgets are org-scoped, not campaign-scoped, because Twilio billing is anchored to the org-owned account and phone inventory.
- Implement soft limits only in this phase: block new billable actions when the configured threshold is exceeded, but do not attempt retroactive cancellation of in-flight provider work.
- Check soft budgets before initiating any billable voice or SMS action:
  - browser voice call start
  - single SMS send
  - bulk SMS queue launch
- When over budget, fail fast with a clear, machine-readable reason that both API clients and the UI can display.

### Spend source of truth
- Persist communication telemetry in the platform database rather than depending on live Twilio usage polling for operator views.
- Use append-only ledger/event rows derived from known voice and SMS records as the spend and audit foundation.
- Store enough metadata to answer future questions by org, campaign, voter, channel, and outcome without re-parsing provider payloads later.

### Pricing and accuracy
- Treat provider-supplied price fields as the canonical source when Twilio callbacks include them.
- Support provisional or unknown cost values until a terminal callback or later reconciliation fills them in.
- Do not block sends just because final provider pricing has not arrived yet; use the best-known running total with explicit "pending" treatment where necessary.

### Operator surface
- Put budget configuration and spend visibility in org settings, alongside the Twilio configuration surface.
- Keep the UI operational and compact: summary cards, threshold settings, recent billable activity, and over-budget warnings.
- Surface over-budget errors inline in the sending/calling workflows, not only in admin settings.

### the agent's Discretion
- Exact ledger table names and whether channel-specific event tables or a single unified ledger is the better fit.
- Exact soft-limit defaults when an org has never configured thresholds.
- Exact org settings layout and chart/table presentation, provided it stays restrained and operational.

</decisions>

<canonical_refs>
## Canonical References

### Requirements and roadmap
- `.planning/ROADMAP.md` - phase 93 goal and success criteria
- `.planning/REQUIREMENTS.md` - BUD-01 and OBS-01

### Prior phase outputs
- `.planning/phases/91-browser-voice-calling/91-VERIFICATION.md` - voice record and webhook facts already in place
- `.planning/phases/92-two-way-sms-opt-out-handling/92-CONTEXT.md` - SMS send and webhook model now established
- `.planning/phases/92-two-way-sms-opt-out-handling/92-VERIFICATION.md` - confirmed SMS storage, queueing, and inbox coverage

### Research notes
- `.planning/research/SUMMARY.md` - spend ledger recommendation and soft-budget gating sequence

### Reusable backend seams
- `app/models/call_record.py` - existing voice billable event surface
- `app/models/sms_message.py` - existing SMS billable event surface
- `app/services/voice.py` - voice call start path to gate on budget
- `app/services/sms.py` - SMS send paths to gate on budget
- `app/api/v1/org.py` and `app/routes/org/settings` patterns - org-scoped admin surface

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Voice already persists call records with Twilio SIDs and lifecycle state.
- SMS already persists outbound and inbound message rows plus provider status.
- Org settings already contain Twilio configuration and phone-number management entry points that can host spend controls.

### Established Patterns
- Budget or compliance blocks should return structured error reasons and let the frontend explain the failure.
- Background work is queued with Procrastinate and should not be cancelled after launch by this phase.
- Append-only records are preferred when later reporting depends on historical auditability.

### Integration Points
- Voice token/TwiML initiation and SMS send endpoints are the gating choke points.
- Twilio callback handlers are the best place to refine provisional cost/metadata into final ledger facts.
- Org settings is the natural admin home for threshold configuration and spend visibility.

</code_context>

<specifics>
## Specific Ideas

- Operators should be able to tell the difference between "budget exceeded", "budget nearly exceeded", and "cost still pending".
- Bulk SMS should refuse to queue when the org is already over its soft limit instead of failing recipient-by-recipient after submission.
- Recent activity should show both voice and SMS in one place so admins can understand spend composition quickly.

</specifics>

<deferred>
## Deferred Ideas

- Hard caps enforced inside Twilio billing or account controls
- Invoice exports and finance tooling
- Historical analytics dashboards beyond the immediate org settings view
- Lookup validation and cache reuse for phase 94

</deferred>
