# Phase 95 Research

## Codebase Findings

### Existing invite flow
- `app/services/invite.py` currently creates and validates invites but never emits email.
- `app/api/v1/invites.py` returns invite metadata directly from the service, so provider integration should stay behind service-layer seams rather than route logic.
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` already promises invite email behavior in a later phase, which makes a reusable email foundation preferable to a one-off invite sender.

### Existing provider and secret patterns
- `app/core/config.py` is the standard place for environment-scoped provider settings.
- `app/services/twilio_config.py` is the closest precedent for secret-safe provider configuration, redaction helpers, and provider-specific credential resolution.
- `app/services/org.py` shows the current pattern of exposing only non-secret provider readiness or masked hints through API responses.

### Existing async execution path
- `app/tasks/procrastinate_app.py` already provides the shared Procrastinate app import point. Phase 95 should avoid queue coupling but should define request/provider contracts that phase 96 jobs can consume directly.

### Existing observability expectations
- `app/core/sentry.py` and `tests/test_observability.py` already scrub common PII from Sentry payloads.
- New email foundation logging should avoid raw payload dumps entirely; relying on scrubbing after the fact is weaker than logging only safe summaries.

## Implementation Direction

### Preferred foundation split
1. A typed transactional email contract layer with explicit template key, tenant context, recipient, sender, and render payload.
2. A code-owned template registry that returns both HTML and plain-text bodies.
3. A provider abstraction with a Mailgun implementation selected from settings.
4. Secret-safe Mailgun settings and service tests that prove no raw credentials or raw Authorization headers are exposed.

### Why this split
- It matches the repo’s existing service-boundary style.
- It keeps phase 96 focused on durable dispatch rather than inventing provider contracts mid-phase.
- It lets phase 97 add audit and webhook reconciliation on stable identifiers instead of retrofitting provider payload semantics later.

## Risks to Avoid

- Hard-coding Mailgun inside `InviteService`, which would make phase 96 retry and phase 97 audit work harder.
- Treating provider templates as source of truth, which would block code review and portability.
- Surfacing environment config or exception strings that accidentally include API keys or raw request headers.
- Designing multi-recipient payloads now; the milestone explicitly requires single-recipient tenant-safe sends.

## Chosen Planning Shape

- Plan 01: create the typed email contract, settings, provider factory, and code-owned template registry.
- Plan 02: implement the Mailgun adapter and secret-safe test coverage around configuration and outbound payload construction.
