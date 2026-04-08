---
gsd_state_version: 1.0
milestone: v1.16
milestone_name: Email Delivery Foundation
status: defining requirements
stopped_at: milestone kickoff before requirements and roadmap
last_updated: "2026-04-08T12:00:00Z"
last_activity: 2026-04-08 -- started v1.16 Email Delivery Foundation milestone
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** defining requirements for v1.16 Email Delivery Foundation

## Current Position

Phase: Not started (defining requirements)
Plan: -
Status: Defining requirements
Last activity: 2026-04-08 -- Milestone v1.16 started

Progress: [░░░░░░░░░░] 0%

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

## Pending Todos

None yet.

## Blockers/Concerns

- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-08
Stopped at: milestone kickoff before requirements and roadmap
Resume file: .planning/PROJECT.md
