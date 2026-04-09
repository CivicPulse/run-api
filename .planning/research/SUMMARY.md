# Project Research Summary

**Project:** CivicPulse Run API
**Domain:** v1.17 Easy Volunteer Invites
**Researched:** 2026-04-09
**Confidence:** HIGH

## Executive Summary

This milestone should be implemented as a campaign-scoped public application system, not as a small tweak to the current volunteer self-join flow. The codebase already has an immediate-access public join path in `app/services/join.py` and a separate internal volunteer lifecycle with `pending` status in `app/services/volunteer.py`. v1.17 needs to connect those worlds safely: public shareable links should create pending applications with attribution, and only staff approval should create campaign membership and active volunteer access.

The stack change is intentionally small. No new auth or referral platform is needed. The product should add dedicated signup-link and application records, reuse existing Mailgun/ZITADEL infrastructure where notifications are helpful, and preserve campaign scoping at every step. The main risks are bypassing approval, mishandling existing-account applicants, and building link controls that do not actually invalidate abused links.

## Key Findings

### Stack additions

- New signup-link and application persistence in PostgreSQL
- Public URL generation from explicit app config
- Public endpoint rate limiting and abuse controls
- Optional reuse of existing Mailgun-backed notification infrastructure

### Feature table stakes

- Multiple campaign-scoped signup links per campaign
- Per-link labels/source attribution
- Disable/regenerate controls per link
- Public application form that creates pending applications
- Staff review queue with approve/reject actions
- Existing CivicPulse users can apply without creating a second account
- Approval is required before campaign access is granted

### Watch out for

- Do not reuse campaign-member invites as volunteer signup links
- Do not allow public submit to create `CampaignMember` rows directly
- Do not lose attribution by storing only free-text source strings
- Do not duplicate identities for existing CivicPulse users
- Do not ship “regenerate” controls that leave old links active

## Implications For Requirements

Use these categories:

- `LINK` — signup-link lifecycle and controls
- `APPL` — public application submission and duplicate handling
- `APRV` — review, approval, rejection, and access gating
- `ACCT` — existing-account recognition and account-to-membership conversion
- `OBS` — attribution and staff visibility

## Recommended Phase Shape

1. Signup-link model and controls
2. Public application persistence and submission UX
3. Staff review and approval workflow
4. Existing-account reconciliation and access activation
5. Attribution, abuse hardening, and operational polish

## Sources

- [.planning/PROJECT.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/PROJECT.md)
- [.planning/research/STACK.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/STACK.md)
- [.planning/research/FEATURES.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/FEATURES.md)
- [.planning/research/PITFALLS.md](/home/kwhatcher/projects/civicpulse/run-api/.planning/research/PITFALLS.md)

---
*Research completed: 2026-04-09*
*Ready for requirements: yes*
