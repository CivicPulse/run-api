# Phase 98: ZITADEL Delivery Setup & Support Boundary - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase configures and documents ZITADEL's own auth/system email path so it
stays separate from CivicPulse-owned invite delivery. The repo needs concrete
environment wiring for self-hosted ZITADEL SMTP settings plus an operator
runbook that explains sender alignment, smoke tests, and which system owns
which kind of email failure.

This phase does not route ZITADEL mail through CivicPulse runtime code and does
not expand the app into general outbound email tooling.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** ZITADEL auth/system mail will use ZITADEL's `DefaultInstance.SMTPConfiguration` path, exposed through repo-managed environment variables for local/shared environments.
- **D-02:** The repo will document Mailgun SMTP as the first-class production example, including US/EU host selection and sender-domain alignment guidance.
- **D-03:** The support boundary must be explicit: CivicPulse owns invite mail; ZITADEL owns password reset, verification, and auth/system mail.
- **D-04:** Validation for this phase is configuration/rendering oriented, so `docker compose config` plus documentation review is sufficient unless code behavior changes require more.

</decisions>

<specifics>
## Specific Ideas

- Add optional `ZITADEL_SMTP_*` passthrough variables in `.env.example` and `docker-compose.yml`.
- Expand the admin guide with a dedicated ZITADEL email-delivery section.
- Add a standalone runbook that support can use during incidents.

</specifics>
