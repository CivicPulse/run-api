# Phase 99: Deliverability Hardening & Operations - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase closes the milestone with operator-facing production readiness for
transactional email. The remaining work is documentation and operational
guidance: DNS and sender prerequisites, monitoring split, smoke tests, and
retry/remediation expectations that keep CivicPulse invite mail distinct from
ZITADEL auth mail.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** Phase 99 is documentation and operations hardening, not new runtime behavior.
- **D-02:** The admin guide should document both CivicPulse Mailgun settings and the ZITADEL runbooks.
- **D-03:** The milestone-close runbook must state what to check when invite mail fails, when auth mail fails, and when both fail together.

</decisions>
