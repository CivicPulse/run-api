---
gsd_state_version: 1.0
milestone: v1.15
milestone_name: Twilio Communications
status: v1.15 milestone complete
stopped_at: v1.15 archived and phase directories moved to milestone storage
last_updated: "2026-04-08T02:10:00Z"
last_activity: 2026-04-08 -- v1.15 archived after passing milestone audit
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 21
  completed_plans: 21
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Any candidate, regardless of party or budget, can run professional-grade field operations from a single API.
**Current focus:** planning the next milestone after v1.15 closeout

## Current Position

Phase: milestone complete
Plan: 21 plans complete
Status: v1.15 archived after audit and cleanup
Last activity: 2026-04-08 -- v1.15 archived after passing milestone audit

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

## Pending Todos

None yet.

## Blockers/Concerns

- Campaign creation 500 in production — ZITADEL pod connectivity investigation remains an ops follow-up, not milestone scope.
- HSTS header — requires Cloudflare edge configuration outside this code milestone.

## Session Continuity

Last session: 2026-04-08
Stopped at: v1.15 archived and phase directories moved to `.planning/milestones/v1.15-phases/`
Resume file: .planning/PROJECT.md
