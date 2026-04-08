# Phase 96: Async Delivery Core & Invite Dispatch - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase wires the existing invite flows onto a real transactional email delivery path. Invite creation must finish its durable domain write first, then enqueue a background send through the app-owned transactional email foundation from phase 95. The phase includes the public invite-link path recipients use to land in the existing auth/acceptance flow, plus guardrails so revoked, expired, or already-accepted invites do not keep generating misleading email sends.

This phase does not add support-grade delivery history, provider webhook reconciliation, or ZITADEL-owned mail configuration. Those belong to phases 97 and 98. Phase 96 only needs enough durable dispatch state to make queueing and retries safe for invite sends.

</domain>

<decisions>
## Implementation Decisions

### Async dispatch contract
- **D-01:** Invite creation remains the source of truth for domain state. The API returns only after the invite row is committed, and email work is queued strictly after that commit succeeds.
- **D-02:** Queue one background job per invite send attempt using the existing Procrastinate infrastructure on the `communications` queue rather than sending inline from the route or service.
- **D-03:** The queued job must be keyed by invite identity, not just recipient email, so retries and resends stay tenant-safe and do not collide across orgs or campaigns.
- **D-04:** Worker execution reloads the invite and campaign/org context from durable storage before sending so it can no-op cleanly when the invite is missing, revoked, expired, or already accepted.

### Idempotency and resend behavior
- **D-05:** Resend/retry behavior must reuse the same invite domain record when the underlying invite is still valid; do not create a second pending invite row just to trigger another email.
- **D-06:** Queue deduplication should prevent duplicate active jobs for the same invite send intent, following the existing `queueing_lock` pattern used elsewhere in the app.
- **D-07:** This phase may add minimal durable send-intent tracking tied to the invite if needed for retry safety, but it should stop short of the broader audit timeline and provider outcome model reserved for phase 97.

### Invite email content and supported flows
- **D-08:** Campaign member invites from the existing campaign settings flow are the primary path and must send real email in this phase.
- **D-09:** Any other existing flows that currently promise an email invite should be routed through the same invite-email service instead of bespoke provider calls or placeholder toasts.
- **D-10:** Invite emails must clearly state the inviter, organization, campaign, granted role/access level, and expiry time using the phase 95 code-owned template foundation.

### Public acceptance path
- **D-11:** Invite links should target the configured `app_base_url` and land on a same-origin frontend invite entry path, not directly on a backend API URL.
- **D-12:** The frontend invite entry path is responsible for guiding unauthenticated users into the existing auth flow, preserving the invite token through login, and then calling the authenticated accept endpoint.
- **D-13:** Recipients need explicit user-facing states for valid, expired, revoked, already-accepted, and email-mismatch cases so the email link never drops them into a dead end.

### Safety and scope boundaries
- **D-14:** The send path stays single-recipient and invite-scoped. No batching, no campaign-authored email, and no general-purpose outbound email UI belong in this phase.
- **D-15:** Any user-visible success messaging in existing UI should shift from "invite stored" to "invite queued/sent" semantics that match asynchronous dispatch without promising immediate provider delivery.
- **D-16:** Provider delivery truth remains "submitted to provider" in this phase. Delivered/bounced/complained states are deferred until webhook reconciliation exists.

### the agent's Discretion
- Exact module split between invite-domain service code, queue task code, and any small helper for public invite URL construction.
- Whether resend is exposed via an explicit API in this phase or limited to safe retry mechanics behind existing flows, as long as duplicate pending invite state is not created.
- The precise frontend route name and UI copy for the public invite acceptance screen, as long as it is same-origin and compatible with the current auth redirect model.

</decisions>

<specifics>
## Specific Ideas

- Follow the import flow pattern: commit durable state first, then call `defer_async` with a queueing lock keyed to the durable entity.
- Model the invite-email worker after the SMS task pattern: load scoped DB state inside the task, abort quietly if prerequisite entities are gone, and keep provider logic out of route handlers.
- Use `app_base_url` as the canonical public link root so emails work across local, preview, and production environments without reconstructing URLs from request headers.
- The frontend route can be lightweight, but it should be a real page with clear status copy instead of relying on a raw `/invites/{token}/accept` API call from the email itself.

</specifics>

<canonical_refs>
## Canonical References

### Requirements and roadmap
- `.planning/ROADMAP.md` - phase 96 goal, scope, success criteria, and UI hint
- `.planning/REQUIREMENTS.md` - EML-04, INV-01, INV-02, INV-03, and INV-04
- `.planning/STATE.md` - prior milestone decisions and current v1.16 context

### Existing invite and email foundation
- `app/services/invite.py` - current invite lifecycle and durability rules that email dispatch must follow
- `app/api/v1/invites.py` - current invite create/list/revoke/accept route surface
- `app/services/email_provider.py` - provider abstraction introduced in phase 95
- `app/services/email_types.py` - typed transactional email and invite template contracts
- `app/services/email_templates.py` - code-owned invite template rendering

### Existing async execution patterns
- `app/tasks/procrastinate_app.py` - shared background task infrastructure
- `app/tasks/sms_tasks.py` - communications-queue worker pattern for provider work
- `app/api/v1/imports.py` - post-commit enqueue plus queueing-lock pattern for durable async work

### Existing frontend/auth touchpoints
- `web/src/routes/campaigns/$campaignId/settings/members.tsx` - existing invite UI and current user messaging
- `web/src/routes/__root.tsx` and `web/src/routes/callback.tsx` - current auth redirect handling that public invite acceptance must integrate with
- `docs/ui-api-gap-analysis.md` - existing documented gap around a standalone invite acceptance page

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/invite.py` already owns role validation, duplicate pending-invite protection, expiry, revoke, and accept semantics.
- `app/services/email_provider.py`, `app/services/email_types.py`, and `app/services/email_templates.py` provide the provider-agnostic email seam introduced in phase 95.
- `app/tasks/procrastinate_app.py` and `app/tasks/sms_tasks.py` show the standard pattern for queueing communication work and reloading DB state inside workers.

### Established Patterns
- Durable state is committed before async work is deferred when the background job depends on that state.
- Procrastinate queueing locks are the repo’s existing deduplication primitive for avoiding duplicate queued work.
- Frontend auth already preserves same-origin redirects through login, so invite acceptance should fit into that pattern rather than inventing a separate external handoff.

### Integration Points
- `POST /api/v1/campaigns/{campaign_id}/invites` is the primary entry point that needs post-commit email queueing.
- `POST /api/v1/invites/{token}/accept` is the authenticated endpoint the public invite route should call after auth.
- The members settings UI currently shows send/fail toasts and will need to reflect async invite dispatch semantics once real email is wired in.

</code_context>

<deferred>
## Deferred Ideas

- Provider delivery status history, bounce/complaint handling, and resend/remediation tooling beyond minimal retry safety.
- Rich operational UI for invite-email outcomes inside campaign settings.
- Campaign-authored email, bulk email, or reusable non-invite transactional templates beyond what phase 96 needs.

</deferred>

---

*Phase: 96-async-delivery-core-invite-dispatch*
*Context gathered: 2026-04-08*
