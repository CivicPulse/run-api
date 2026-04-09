---
gsd_state_version: 1.0
milestone: v1.16
milestone_name: Email Delivery Foundation
status: completed
stopped_at: Session resumed; awaiting next action from archived v1.16 state
last_updated: "2026-04-09T18:16:44Z"
last_activity: 2026-04-09
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 7
  completed_plans: 7
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** v1.16 archived; ready to define the next milestone

## Current Position

Phase: Complete
Plan: Complete
Status: Milestone v1.16 archived
Last activity: 2026-04-09

Progress: [██████████] 100%

## Accumulated Context

### Decisions

- v1.15: Org-scoped Twilio credentials (Account SID, Auth Token) — billing isolated per org, not per campaign.
- v1.15: Click-to-call uses Twilio Voice SDK (WebRTC); mobile/unsupported browsers fall back to existing tel: link behavior.
- v1.15: SMS is both bulk outreach and conversational — reply inbox for volunteers to follow up.
- v1.15: Phone numbers are BYO + platform-provisioned (org settings UI for Twilio number search/rent).
- v1.15: Spend limits enforced at both platform level (soft gates) and Twilio account level (surfaced in org settings).
- v1.15: TCPA/A2P 10DLC compliance is org responsibility; platform provides opt-out tooling, not carrier registration.
- v1.15: SMS opt-out state is channel-specific and must not mutate the voice DNC list.
- v1.15: Bulk SMS uses the existing Procrastinate queue pattern and must remain observable to staff.
- v1.15: SMS sends require explicit eligibility or consent signals; imported voter numbers alone are not text-eligible.
- v1.15: Phase 92 UI contract keeps SMS inside the campaign phone-banking workflow with a campaign-level Messages inbox, inline consent/opt-out banners, and queued bulk-send status cards.
- v1.15: Phase 92 is complete with campaign-scoped SMS conversation storage, webhook threading, STOP/START enforcement, and a Messages route in phone banking.
- v1.15: Spend controls will be org-scoped soft limits enforced before new voice/SMS billable actions, backed by append-only communication telemetry.
- v1.15: Phase 93 UI contract keeps spend controls in org settings as a compact Twilio Spend & Telemetry card with summary chips, threshold inputs, recent activity for both voice and SMS, and org-admin editable soft budgets.
- v1.15: Phase 93 planning uses a unified communication ledger plus a shared budget gate applied to both voice and SMS launch paths.
- v1.15: Phase 93 is complete with org budget fields, append-only communication telemetry, pre-launch budget blocks, webhook reconciliation, and inline spend state in org settings plus phone-banking routes.
- v1.15: Phase 94 uses a campaign-scoped `phone_validations` cache with a 90-day TTL instead of mutating voter contact source data with Twilio-derived line-type intelligence.
- v1.15: Contact save remains available when Twilio Lookup fails; stale or pending validation surfaces as warning state plus manual refresh.
- v1.15: SMS eligibility now consumes cached lookup summaries and blocks landline, stale, and review-needed numbers before send.
- v1.16: Transactional email will use a provider abstraction with Mailgun first so CivicPulse can add providers without rewriting invite flows.
- v1.16: This milestone covers transactional/system email only, including existing invite flows and ZITADEL auth/system delivery setup.
- v1.16: ZITADEL scope is configure-and-document email delivery, not CivicPulse-managed auth templating or branding tooling.
- v1.16: Basic email delivery/audit metadata is in scope; inboxes, campaign email, and advanced analytics remain out of scope.
- [Phase 95]: Phase 95 established a typed transactional email seam with Mailgun selected by settings and code-owned HTML/text invite templates. — This keeps invite-domain logic provider-agnostic and gives later async, audit, and ZITADEL phases a stable foundation.
- [Phase 96]: Phase 96 moved invite delivery behind a post-commit communications task with invite-keyed idempotency, same-origin invite entry, and persisted queue-failure state instead of false request failures. — This gives phase 97 a stable submission record and phase 98/99 a real app-owned invite path to document and harden.
- [Phase 97]: Phase 97 added canonical invite-email attempt audit rows plus authenticated Mailgun webhook reconciliation keyed by provider message id. — This gives support a truthful latest outcome per invite and keeps future resend/deliverability work grounded in durable attempt history.
- [Phase 98]: Phase 98 documented and wired ZITADEL's own SMTP notification path separately from CivicPulse invite delivery, including a runbook for sender alignment and support triage. — This keeps auth/system mail ownership explicit and gives phase 99 a clear shared-ops boundary to harden.
- [Phase 99]: Phase 99 added the production operations runbook for Mailgun DNS prerequisites, monitoring split, and remediation expectations across CivicPulse invite mail and ZITADEL auth mail. — The milestone is now ready for milestone audit and archive steps.
- [Phase 100]: Phase 100 realigned the pending-invites frontend with the backend invite contract and surfaced delivery status, latest error, and last-event timing in the campaign members UI. — This closes the remaining AUD-04 admin visibility gap identified by the milestone audit.

## Pending Todos

None yet.

## Blockers/Concerns

- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-09T18:16:44Z
Stopped at: Session resumed; awaiting next action from archived v1.16 state
Resume file: .planning/milestones/v1.16-MILESTONE-AUDIT.md
