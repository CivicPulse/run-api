# Project Research Summary

**Project:** CivicPulse Run API
**Domain:** v1.16 transactional email delivery foundation
**Researched:** 2026-04-08
**Confidence:** HIGH

## Executive Summary

This milestone is not a general email platform. It is a narrow transactional-email foundation for an existing multi-tenant campaign operations product: app-owned invite emails plus ZITADEL-owned auth/system email delivery. The research is consistent that experts split those paths cleanly. CivicPulse should send its own invite flows through an internal provider seam with Mailgun as the first adapter, while ZITADEL continues to send password reset, verification, and related auth mail through its own SMTP configuration.

The recommended build is an async, audit-backed delivery path inside the existing FastAPI + Procrastinate architecture. Invite creation remains the durable system of record; email send is queued after commit, rendered from app-owned Jinja templates, submitted via Mailgun HTTP, and reconciled into normalized delivery states. The product boundary stays tight: transactional/system email only, no campaign-authored email, no editor, no analytics-driven engagement features.

The main risks are false delivery confidence, provider lock-in, and operational misconfiguration. The roadmap should explicitly guard against treating Mailgun acceptance as delivery, matching webhook events by recipient email, mixing Mailgun and ZITADEL ownership, or launching without domain/DNS/auth configuration. Requirements should treat final-state visibility, idempotent send behavior, explicit public URL config, and operator runbooks as first-class milestone outputs, not polish.

## Key Findings

### Recommended Stack

The stack change is intentionally small. Reuse the existing backend foundation and add only what the milestone needs: Jinja2 for app-owned templates, Mailgun HTTP via existing `httpx`, Procrastinate for async send/retry, and PostgreSQL tables for audit and idempotency. Do not add a Mailgun SDK, app-side SMTP adapter, new queue infrastructure, or provider-stored templates.

**Core technologies:**
- `httpx` — Mailgun HTTP client path; keeps the provider adapter thin and consistent with existing async integrations.
- `Jinja2>=3.1.6` — local text+HTML template rendering owned in Git, not in provider config.
- `procrastinate` — post-commit send execution, retry handling, and failure isolation without new infrastructure.
- PostgreSQL — `email_messages` / `email_events`, idempotency keys, and operator-facing audit state.
- Mailgun Email API — first provider implementation with region-aware config and webhook support.
- ZITADEL SMTP configuration — separate auth/system email path owned by ZITADEL operations, not by CivicPulse runtime.

Critical config requirements:
- `APP_EMAIL_PROVIDER=mailgun`
- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION`
- derived Mailgun base URL from region
- `MAILGUN_WEBHOOK_SIGNING_KEY`
- `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`
- explicit public app base URL for invite links
- ZITADEL SMTP/custom-domain settings documented separately

### Expected Features

The milestone scope is transactional email only. The table stakes are real email for existing invite flows, provider-backed send and delivery metadata, idempotent resend behavior, stable accept-invite links into existing flows, and ZITADEL email configuration/runbooks. The research is aligned that app invite logic should be reused, not redesigned.

**Must have (table stakes):**
- Existing org/campaign/staff/volunteer invite flows send real email through the platform.
- Typed transactional email service with a provider abstraction and Mailgun-first implementation.
- App-owned templates with subject, HTML, and plain-text variants.
- Delivery/audit persistence tied to the invite or related domain record.
- Idempotent send/resend behavior keyed to the logical invite action.
- Final delivery state reconciliation through provider events/webhooks.
- ZITADEL SMTP/provider setup and operator documentation for auth/system mail.
- Deliverability prerequisites documented: sender identity, SPF/DKIM/DMARC, environment-specific domains.

**Should have (useful within milestone if time permits after table stakes):**
- Staff-visible resend action and last-send status.
- Delivery event timeline per invite/supportable send history.
- Simple template preview or test-send workflow.
- Suppression-aware resend UX for permanently failed recipients.

**Defer (explicitly out of scope):**
- Campaign-authored or bulk email.
- Marketing automation, segmentation, drip logic, or analytics-led engagement features.
- Rich editor / per-org template builder.
- In-app inbox or reply handling.
- Attachments, unsubscribe/preferences center, or broad open/click tracking.
- Multiple live providers or automatic provider failover.

### Architecture Approach

The architecture should mirror the existing Twilio and job-backed import patterns: domain write first, email queue second, provider send in the worker, webhook reconciliation later. The app owns invite email generation and normalized audit state; ZITADEL owns auth email delivery through separate SMTP configuration and docs.

**Major components:**
1. `EmailProvider` contract + `MailgunEmailProvider` — isolates provider-specific send and webhook verification behavior.
2. `EmailService` + template renderer — builds typed messages, creates idempotent audit rows, and queues jobs after commit.
3. `email_messages` / `email_events` models — normalized send attempts, provider message IDs, lifecycle states, and append-only events.
4. Procrastinate email tasks — asynchronous send, retry, status transitions, and replay-safe execution.
5. Mailgun webhook endpoint — signature verification and final-state reconciliation by local send ID / provider message ID.
6. Invite integration call sites — campaign invite first, then volunteer/staff/org variants on the same foundation.
7. ZITADEL operator docs/config — SMTP/custom-domain setup, ownership boundaries, and smoke-test runbook.

### Critical Pitfalls

1. **Treating provider acceptance as delivery** — require normalized states such as `queued`, `submitted`, `delivered`, `failed`, `bounced`, `complained`, `suppressed`, and do not surface “delivered” without webhook evidence.
2. **Mixing CivicPulse invite email with ZITADEL auth email ownership** — keep separate config, code paths, docs, and debugging boundaries from day one.
3. **No idempotency or sending before commit** — use an outbox/job pattern and unique logical send keys so retries do not create duplicate or orphaned invite emails.
4. **Reconciling events by recipient email** — join webhook events by local send-attempt identity and provider message ID, never by address alone.
5. **Region/domain/secret misconfiguration** — make Mailgun region first-class, isolate a transactional sending domain, separate API/webhook/SMTP secrets, and publish rotation/runbook guidance before go-live.
6. **Cross-tenant leakage through batching or metadata** — send one invite per recipient and keep provider tags/variables opaque and minimal.
7. **Wrong public links in emails** — generate invite URLs from explicit public config, not request headers or internal service hosts.

## Implications for Roadmap

Based on the combined research, the milestone should be decomposed into five build slices.

### Phase 1: Provider Foundation and Secret Hygiene
**Rationale:** Every later slice depends on a clean provider seam, explicit config, and safe operational boundaries.
**Delivers:** `EmailProvider` contract, Mailgun adapter, config surface, Jinja2 dependency, sender policy, region-aware base URL derivation, secret separation rules.
**Addresses:** provider-backed sending, template system foundation, environment-safe configuration.
**Avoids:** Mailgun lock-in, region/base-URL mismatch, secret sprawl, shared-domain mistakes.

### Phase 2: Persistence and Async Delivery Core
**Rationale:** Invite integration should not happen before the audit/idempotency model and queue semantics exist.
**Delivers:** `email_messages`, `email_events`, idempotency key strategy, `EmailService`, Procrastinate send task, retry rules, post-commit queueing.
**Addresses:** delivery metadata persistence, idempotent send behavior, resend-safe foundation.
**Avoids:** send-before-commit races, duplicate emails, boolean-only “sent” state.

### Phase 3: Invite Delivery Integration
**Rationale:** Existing product value comes from making already-present invite flows actually send email.
**Delivers:** campaign invite email path first, then volunteer/staff/org invite variants; stable accept-invite links; staff-visible resend/status hooks where already supported by UX.
**Addresses:** real invite emails, invite-context content, stable acceptance flow reuse.
**Avoids:** frontend/provider coupling, wrong public URLs, recipient batching, redesigning invite domain logic.

### Phase 4: Email Events, Webhooks, and Audit Visibility
**Rationale:** Milestone credibility depends on truthful delivery state, not just successful provider submission.
**Delivers:** Mailgun webhook ingress with signature verification, normalized event reconciliation, suppression-aware status updates, final-state visibility in operator-facing surfaces or APIs.
**Addresses:** final delivery status, failure visibility, bounce/complaint/suppression handling, support-grade audit trail.
**Avoids:** accepted-as-delivered bugs, event misattachment by email address, repeated sends to suppressed recipients, excess tracking PII.

### Phase 5: ZITADEL Delivery Setup and Operational Hardening
**Rationale:** The milestone is not complete until auth/system mail and operator runbooks are production-ready too.
**Delivers:** ZITADEL SMTP/custom-domain documentation, ownership boundaries, smoke-test checklist for verification/reset/auth mail, Mailgun DNS/domain runbooks, fallback/manual replay guidance, app-vs-ZITADEL monitoring boundaries.
**Addresses:** auth/system email readiness, deliverability prerequisites, go-live operations.
**Avoids:** leaving ZITADEL on default settings, blended monitoring/runbooks, undefined outage response.

### Phase Ordering Rationale

- Provider/config boundaries come first because they shape schema, queue behavior, and requirement wording.
- Persistence and async delivery must exist before wiring live invite flows; otherwise the team will either block request latency on Mailgun or lose auditability.
- Invite integration belongs before webhook polish because it is the direct product slice, but milestone acceptance should still require final-state reconciliation before closeout.
- ZITADEL work is separate from app code but should be a milestone phase, not post-milestone ops follow-up.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4:** Mailgun webhook event mapping and suppression-policy details should be verified against the exact event set and desired normalized states.
- **Phase 5:** ZITADEL SMTP/custom-domain operator steps need implementation-specific validation against the current deployed ZITADEL environment and secrets flow.

Phases with standard patterns (likely no separate research pass needed):
- **Phase 1:** Provider seam, config surface, and template ownership are already well-supported by the research.
- **Phase 2:** Async outbox-style send with Procrastinate fits existing platform patterns.
- **Phase 3:** Invite integration should mostly reuse existing invite models, tokens, and acceptance routes.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Backed by official Mailgun and ZITADEL docs and consistent with existing FastAPI/Procrastinate/httpx platform patterns. |
| Features | MEDIUM-HIGH | Table stakes are clear, but some operator UX recommendations are based on common practice rather than a single canonical source. |
| Architecture | HIGH | Strong alignment across research and with existing codebase seams for invite services, tasks, config, and integration style. |
| Pitfalls | HIGH | Risks are concrete, source-backed, and directly applicable to milestone sequencing and acceptance criteria. |

**Overall confidence:** HIGH

### Gaps to Address

- **Current invite surface inventory:** requirements should explicitly name which invite flows are in-scope on day one so roadmap phases do not drift.
- **Public URL ownership:** planning should confirm the canonical public app URL and how it will coexist with ZITADEL login/custom-domain URLs.
- **Operator ownership split:** clarify who owns Mailgun provisioning, DNS, Kubernetes secret injection, and ZITADEL SMTP activation before execution begins.
- **Delivery-status UX depth:** decide during requirements whether operator visibility is API-only, admin-surface status, or both.
- **Fallback policy:** define whether outage handling is queue-and-retry only or includes manual replay/resend workflow in this milestone.

## Sources

### Primary (HIGH confidence)
- [.planning/PROJECT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/PROJECT.md) — milestone scope, explicit out-of-scope boundaries, current invite/auth context
- [.planning/research/STACK.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/STACK.md) — stack and operational prerequisites
- [.planning/research/FEATURES.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/FEATURES.md) — table stakes, differentiators, and anti-features
- [.planning/research/ARCHITECTURE.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/ARCHITECTURE.md) — service boundaries, data flow, and build order
- [.planning/research/PITFALLS.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/PITFALLS.md) — delivery, tenancy, and operational risks
- Mailgun API/send/webhook/DNS docs — provider send path, regional endpoints, webhook security, deliverability constraints
- ZITADEL SMTP/default-settings/custom-domain docs — auth/system email ownership and operator configuration boundaries

### Secondary (MEDIUM confidence)
- Jinja2 PyPI metadata — current stable version guidance for template rendering dependency
- Mailgun Python SDK PyPI metadata — used only to justify avoiding SDK adoption in this milestone

---
*Research completed: 2026-04-08*
*Ready for roadmap: yes*
