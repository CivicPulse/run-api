# Phase 97: Webhook Reconciliation & Audit Truth - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds truthful, tenant-safe delivery history on top of the async invite submission path from phase 96. The app must persist a support-grade record for each transactional email send attempt, then reconcile that record with authenticated Mailgun delivery events so staff can tell whether an invite email was merely submitted or actually delivered, bounced, complained, suppressed, or failed.

This phase does not broaden email scope into campaign-authored mail, general outbound messaging UI, or operator replay tooling. It only needs enough audit storage, webhook security, and support visibility to make invite-email outcomes trustworthy and actionable.

</domain>

<decisions>
## Implementation Decisions

### Durable audit model
- **D-01:** Phase 96 invite-row delivery fields are no longer sufficient as the source of truth. Phase 97 should add a dedicated append-oriented email delivery record keyed to a single send attempt, with tenant context, template key, recipient, provider, timestamps, provider message identity, and the originating invite ID.
- **D-02:** The durable email audit row must store both org and campaign context when available, plus invite identity, so reconciliation never relies on recipient email alone.
- **D-03:** The invite row may keep a lightweight "latest status" summary for fast reads, but the canonical reconciliation history belongs to the dedicated delivery record, not to repeated mutation of the invite row alone.
- **D-04:** One send attempt equals one durable delivery record. Retries or resends should create additional attempt rows linked back to the same invite so support can distinguish "latest attempt" from prior failures.

### Provider identity and event correlation
- **D-05:** Mailgun's message ID must be captured at submission time and stored on the delivery record as the primary correlation key for later webhook reconciliation.
- **D-06:** Reconciliation must never match webhook events by recipient address alone. Same-email invites across orgs or campaigns must remain unambiguous by using provider message identity plus tenant-scoped attempt records.
- **D-07:** If Mailgun webhook payloads expose multiple identifiers, the system should persist the smallest stable set needed to correlate events safely, without over-storing raw payload fields that add little support value.

### Webhook security and idempotency
- **D-08:** Mailgun webhook ingestion should follow the established Twilio pattern: authenticated provider verification first, then explicit idempotency protection before mutating delivery state.
- **D-09:** Signature verification must use server-configured public webhook URL and Mailgun signing configuration from backend settings, never request-derived host assumptions.
- **D-10:** Duplicate webhook deliveries must be harmless. Event ingestion should record an idempotency key or provider event fingerprint so repeated deliveries do not re-append or regress state.
- **D-11:** Invalid or unauthenticated webhook calls must be rejected without mutating invite or delivery records.

### Delivery state model
- **D-12:** Phase 97 should distinguish at least these outcomes where Mailgun provides them: submitted/accepted, delivered, failed, bounced, complained, and suppressed. These states are the support truth surfaced to staff.
- **D-13:** State transitions should be monotonic toward better-known truth. A later webhook must not move an attempt backward from a terminal outcome into a weaker earlier state unless the provider explicitly communicates that ordering.
- **D-14:** When webhook data arrives for a message the app cannot correlate, the event should be retained or logged for operator investigation rather than silently discarded, but it must not leak across tenants.

### Support-facing visibility
- **D-15:** Staff do not need a full mail operations console in this phase. They do need the latest invite-email outcome and failure reason visible from existing invite-management surfaces or invite-related APIs.
- **D-16:** The support view should answer four questions quickly: Was an email attempt created? What is the latest known status? What was the last failure reason or provider code? When did the latest transition happen?
- **D-17:** Visibility can remain invite-centric for now. Detailed per-attempt history may be API-backed first and kept lightweight in the UI as long as support can identify which invite needs resend or remediation.

### Scope boundaries
- **D-18:** This phase covers Mailgun-authenticated delivery truth for app-owned transactional invite mail only. ZITADEL auth/system mail remains phase 98 scope.
- **D-19:** Webhook handling should be generic enough to support additional transactional providers later, but phase 97 only needs the first Mailgun implementation.
- **D-20:** Replay, dead-letter tooling, bulk remediation dashboards, and campaign-authored email analytics remain out of scope for this phase.

### the agent's Discretion
- Whether the durable email-attempt model lives as a new table specific to transactional email or as a narrowly-scoped extension of an existing communication ledger pattern, provided email attempts remain tenant-safe and support-grade.
- The exact internal enum names and transition matrix for delivery statuses, as long as the support-facing semantics above are preserved.
- Whether the latest invite outcome is exposed by enriching existing invite responses, adding a focused invite-delivery endpoint, or both.

</decisions>

<specifics>
## Specific Ideas

- Mirror the Twilio webhook structure: one service for provider verification and idempotency, one ingress route for webhook callbacks, and one domain service that updates durable delivery records.
- Treat the Mailgun submission response in phase 96 as the point where the first delivery-attempt row is created or finalized with provider message identity.
- Add a support-friendly "latest invite delivery" projection derived from the durable attempt rows instead of overloading the invite table with every possible provider state transition.
- Store enough provider metadata to explain failures to staff, but prefer normalized status / reason fields over dumping raw webhook payloads into user-facing reads.

</specifics>

<canonical_refs>
## Canonical References

### Requirements and roadmap
- `.planning/ROADMAP.md` - phase 97 goal, scope, and success criteria
- `.planning/REQUIREMENTS.md` - AUD-01, AUD-02, AUD-03, AUD-04, and SEC-02
- `.planning/STATE.md` - v1.16 milestone state through phase 96 completion

### Existing invite email flow
- `app/services/invite.py` - invite lifecycle and current latest-status fields
- `app/tasks/invite_tasks.py` - async invite-email task that captures Mailgun message ID
- `app/services/invite_email.py` - invite email construction and provider submission
- `app/services/email_provider.py` - provider abstraction and Mailgun submission result shape
- `app/models/invite.py` - current invite-scoped email delivery summary fields

### Existing webhook and audit patterns
- `app/services/twilio_webhook.py` - signature verification and webhook idempotency pattern
- `app/api/v1/webhooks.py` - webhook route composition and duplicate-delivery handling
- `app/models/webhook_event.py` - provider-event idempotency storage shape
- `app/models/communication_ledger.py` - append-only communication telemetry pattern
- `app/services/communication_budget.py` - record/reconcile pattern for provider status updates
- `app/services/sms.py` - message status reconciliation into existing support-facing state

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The Twilio webhook infrastructure already solves three problems phase 97 also has: public-URL signature verification, duplicate event suppression, and thin ingress routes delegating to domain services.
- The communication ledger and SMS reconciliation code show how the repo models append-only provider events while still projecting a latest support-facing status onto user-visible resources.
- Phase 96 already stores `email_delivery_provider_message_id` on invites, so Mailgun submission identity is available to seed the phase 97 reconciliation model.

### Established Patterns
- Provider-facing callbacks are verified server-side before touching domain state.
- Duplicate provider callbacks are treated as normal and filtered through explicit idempotency records.
- Support-facing resources expose normalized status and reason fields rather than forcing UI code to interpret raw provider payloads.

### Integration Points
- `send_campaign_invite_email` in `app/tasks/invite_tasks.py` is the point where submission-time audit rows can be created or updated with provider message identity.
- Existing invite list/create responses in `app/api/v1/invites.py` are the most likely place to surface latest delivery outcome to staff.
- Mailgun webhook routes will likely sit alongside other provider callbacks under `app/api/v1/`, but must remain clearly separated from Twilio and from user-authenticated APIs.

</code_context>

<deferred>
## Deferred Ideas

- Operator-triggered resend/replay actions and dead-letter queue tooling
- Rich per-attempt delivery timeline UI beyond basic latest-status visibility
- Cross-provider transactional email analytics or campaign-authored email reporting

</deferred>

---

*Phase: 97-webhook-reconciliation-audit-truth*
*Context gathered: 2026-04-08*
