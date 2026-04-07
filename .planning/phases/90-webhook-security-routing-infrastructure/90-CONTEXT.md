# Phase 90: Webhook Security & Routing Infrastructure - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

This phase adds the secure webhook ingress layer for Twilio callbacks: signature-validated routes, idempotent event processing, and org-safe routing. Voice (Phase 91) and SMS (Phase 92) phases will register specific callback handlers; this phase provides the shared foundation they both need.

The phase stops at infrastructure readiness. No voice calls or SMS messages are sent or received yet.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Use ROADMAP phase goal, success criteria (SEC-02, SEC-03, SEC-04, ORG-03), and codebase conventions to guide decisions.

Key constraints from requirements:
- **SEC-02**: Signature validation must use the public production URL (behind Traefik), not the internal container URL. The app runs behind `https://run.civpulse.org` in production — Twilio signs against the public URL shape.
- **SEC-03**: Idempotency on Twilio SID values — retried webhooks must not create duplicate records.
- **SEC-04**: Any new campaign-scoped tables must have RLS policies matching the existing pattern.
- **ORG-03**: Webhook routing resolves org from the registered phone number, keeping data isolated per org.

Patterns to follow from existing codebase:
- Routing: add to `app/api/v1/router.py` like other modules.
- Rate limiting: `@limiter.limit(...)` with `get_user_or_ip_key` (though webhooks use IP-only since no JWT).
- Config: extend `app/core/config.py` Settings for `webhook_base_url`.
- Org resolution: `org_phone_numbers.phone_number` → `org_phone_numbers.org_id` → org context.
- RLS: follow existing transaction-scoped `set_campaign_context` pattern for any campaign-scoped webhook data.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/twilio_config.py` — `TwilioConfigService.credentials_for_org()` provides auth token for signature validation.
- `app/models/org_phone_number.py` — `OrgPhoneNumber` model has `phone_number` and `org_id` for routing lookup.
- `app/core/rate_limit.py` — existing rate limiter infrastructure.
- `app/core/middleware/security_headers.py` — existing security middleware pattern.
- `twilio.request_validator.RequestValidator` — Twilio SDK's built-in signature checker.

### Established Patterns
- Router structure: module file in `app/api/v1/`, mounted in `router.py`.
- Org-scoped resolution: lookup via `zitadel_org_id` or org FK.
- Error mapping: `HTTPException` with safe status codes, no stack traces.
- Config via pydantic-settings: env vars → `Settings` class.

### Integration Points
- New webhook router mounted at `/api/v1/webhooks/twilio` (or similar).
- `webhook_base_url` config setting for signature validation URL construction.
- Idempotency table/check using Twilio CallSid/MessageSid as natural keys.
- Phone number → org lookup via `org_phone_numbers` table for routing.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

- Voice call status callbacks — Phase 91 responsibility.
- SMS delivery/reply callbacks — Phase 92 responsibility.
- Webhook retry monitoring/alerting — future operational concern.

</deferred>
