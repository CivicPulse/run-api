# Phase 95: Provider Foundation & Secret Hygiene - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase establishes the app-owned transactional email foundation only. It introduces a provider abstraction with Mailgun as the first implementation, code-owned template rendering in both HTML and plain text, and environment-scoped Mailgun configuration that does not leak secrets through API responses, logs, or frontend state.

The phase does not yet queue invite sends, persist delivery audit trails, reconcile provider webhooks, or configure ZITADEL-owned auth email. Those behaviors belong to later phases and should depend on this provider and template seam rather than bypassing it.

</domain>

<decisions>
## Implementation Decisions

### Provider seam
- **D-01:** Add a dedicated app-owned transactional email module rather than embedding provider calls inside `InviteService` or route handlers.
- **D-02:** Represent outbound mail as a typed single-recipient request object with explicit tenant context, template key, sender identity, subject, and merge data.
- **D-03:** Provider selection is environment-driven through app settings; Mailgun is the initial implementation behind the abstraction, but invite-domain code must depend only on the abstraction.
- **D-04:** Payload construction remains single-recipient only. No batching or multi-recipient APIs are allowed in this milestone foundation.

### Template ownership
- **D-05:** Transactional templates live in the CivicPulse repo and render both HTML and plain text from shared structured data.
- **D-06:** Start with invite-oriented template support, but shape the template registry so later transactional templates can be added without changing provider code.
- **D-07:** Template rendering should be deterministic and testable without making a network call or depending on provider-hosted templates.

### Secret and configuration handling
- **D-08:** Mailgun credentials and sender/domain configuration are app settings, scoped per environment, not org-configurable UI state in this phase.
- **D-09:** Mailgun settings should include at minimum API key, domain, sender email/name, and region/base URL selection.
- **D-10:** Secret-bearing settings must never be serialized into response schemas, logs, or user-visible status payloads.
- **D-11:** Non-secret operational metadata such as selected provider, domain, sender email, and readiness booleans may be surfaced where useful, but secret values and raw authorization headers must stay server-only.

### Tenant safety and observability
- **D-12:** The provider request contract must carry tenant identifiers explicitly so later audit/webhook phases can reconcile by message identity plus tenant scope instead of email address alone.
- **D-13:** Any provider-facing logging should use structured, redacted summaries and avoid raw payload dumps because template merge data may contain recipient and campaign details.
- **D-14:** The foundation should preserve compatibility with the existing PII scrubbing approach in Sentry and request logging.

### the agent's Discretion
- Exact module/file layout for email services and templates.
- Whether template rendering uses Jinja, simple string formatting, or another repo-native mechanism, as long as HTML and text outputs are code-owned and testable.
- Whether the provider factory is cached or instantiated per call, as long as configuration remains centralized and provider choice is not hard-coded into invite flows.

</decisions>

<specifics>
## Specific Ideas

- Mirror the Twilio config pattern where secrets are kept server-side and only redacted or readiness-safe metadata escapes.
- Prefer a provider request shape that can be reused later for async send jobs and webhook reconciliation without redesign.
- Include a stable template key enum or registry early so later phases can refer to templates consistently in jobs, audit records, and support tooling.

</specifics>

<canonical_refs>
## Canonical References

### Requirements and roadmap
- `.planning/ROADMAP.md` - phase 95 goal, scope, and success criteria
- `.planning/REQUIREMENTS.md` - EML-01, EML-02, EML-03, and SEC-01

### Existing communication/config patterns
- `app/services/twilio_config.py` - current encrypted-secret and redaction pattern for provider credentials
- `app/services/org.py` - example of returning only safe provider-readiness metadata
- `app/core/config.py` - existing environment-scoped settings approach
- `app/core/sentry.py` and `tests/test_observability.py` - existing PII scrubbing expectations that email foundation logging must respect

### Existing invite flow
- `app/services/invite.py` - current invite-domain entry point that later phases will wire onto the transactional email path
- `app/api/v1/invites.py` - create/list/revoke/accept invite route surface
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` - existing UI copy promising invite email behavior in a later phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/core/config.py` already centralizes environment settings and is the natural place for Mailgun configuration.
- `app/tasks/procrastinate_app.py` provides the queue integration that later phases can use once the provider seam exists.
- `app/services/twilio_config.py` demonstrates the existing standard for encryption, decryption, hints, and non-secret readiness signaling.

### Established Patterns
- External provider credentials are handled on the backend and surfaced as redacted metadata only.
- Service-layer modules own third-party integration details rather than exposing them to API routes.
- Tests emphasize explicit schemas and focused unit coverage around provider boundaries.

### Integration Points
- Later invite flows should consume a transactional email service instead of constructing provider payloads directly.
- Later audit and webhook phases should build on the provider request/template identity chosen here.
- Later ZITADEL setup docs should reference the app-owned provider settings without conflating CivicPulse mail with ZITADEL SMTP configuration.

</code_context>

<deferred>
## Deferred Ideas

- Per-org Mailgun credentials or sender identities.
- Provider failover or multiple active email providers.
- Open/click analytics, inbox handling, or campaign-authored email.
- Webhook reconciliation, retries, and resend operations beyond the typed foundation contract.

</deferred>

---

*Phase: 95-provider-foundation-secret-hygiene*
*Context gathered: 2026-04-08*
