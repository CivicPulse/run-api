# Project Research Summary

**Project:** CivicPulse Run API
**Domain:** Campaign-scoped volunteer self-signup and approval links
**Researched:** 2026-04-09
**Confidence:** HIGH

## Executive Summary

This milestone is not a net-new subsystem. CivicPulse already has a public join surface, volunteer records with `pending/active/inactive`, campaign membership, invite email infrastructure, and ZITADEL-backed role assignment. The main architectural correction is to replace the current instant-membership join flow with a managed signup-link and pending-application workflow that grants campaign access only after staff approval.

Research points to a straightforward approach: keep the existing FastAPI/PostgreSQL/React/ZITADEL stack, add dedicated campaign-scoped signup-link records plus pending application records, and treat approval as the moment that creates membership and campaign role assignment. Official invite-link products consistently expose link lifecycle controls such as disable/deactivate, renewal/regeneration, and optional expiry or usage limits; official sign-in guidance also favors recognizing returning users instead of forcing duplicate account creation.

The major risk is authorization drift. If pending applicants become `CampaignMember`s too early or inherit ZITADEL roles before review, the product breaks its core promise that applicants cannot see anything until approved. The roadmap should therefore establish data model and access boundaries first, then handle existing-account reconciliation, and only then add manager review polish and optional notifications/reporting.

## Key Findings

### Recommended Stack

No new platform stack is required. The existing FastAPI + SQLAlchemy async backend, PostgreSQL persistence, React/TanStack frontend, and ZITADEL auth stack are sufficient. This milestone is primarily about adding managed link/application models and correcting the join workflow boundary.

**Core technologies:**
- FastAPI + SQLAlchemy async: public link lookup, application submission, review actions
- PostgreSQL: authoritative state for link lifecycle, attribution, and approval
- React + TanStack Query/Router: public apply and manager review/link admin flows
- ZITADEL: identity stays external, but campaign role assignment moves to approval time

### Expected Features

The must-haves are multiple campaign-scoped signup links, per-link controls, a pending application queue, approval/rejection actions, and an existing-account apply path. Nice follow-ons include optional expiry/max-use controls, email confirmations, and link-level funnel reporting.

**Must have (table stakes):**
- Managed signup links with labels/source attribution
- Pending applications separate from campaign membership
- Approval/rejection queue for staff
- Existing-account application path
- Link disable/regenerate controls

**Should have (competitive):**
- Clear link-level reporting for recruitment channels
- Low-friction existing-user path in a multi-campaign product

**Defer (v2+):**
- Custom form builders
- Automated approval rules
- Broader cross-campaign volunteer profile workflows

### Architecture Approach

Use opaque DB-backed signup-link records rather than the campaign slug as the public secret. Public submissions should create pending application rows that copy source attribution from the link at submit time. Approval should atomically create `CampaignMember` access, activate or create the volunteer record, and grant the campaign role through ZITADEL.

**Major components:**
1. Managed signup-link service — create/list/disable/regenerate campaign-scoped links
2. Public application service — resolve link, capture application, reconcile existing accounts
3. Approval workflow service — approve/reject pending applications and grant access only on approval

### Critical Pitfalls

1. **Pre-approval access leakage** — keep application state separate from membership and defer ZITADEL role assignment until approval.
2. **Fake rotation** — regeneration must invalidate old tokens server-side, not just change visible metadata.
3. **Duplicate user identities** — reuse existing CivicPulse accounts rather than creating campaign-specific duplicates.
4. **Attribution drift** — copy source metadata onto the application at submission time.
5. **Public-link abuse** — ship rate limits and fast disable controls with the initial flow.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 101: Signup Link Foundation & Public Application Contract
**Rationale:** Everything else depends on having real managed links and a pending application record distinct from campaign membership.
**Delivers:** Signup-link model/API, public link lookup, pending application submit path, source attribution persistence
**Addresses:** managed links, attribution, pending applications
**Avoids:** fake rotation, attribution drift, pre-approval access

### Phase 102: Existing-Account Reconciliation & Approval Access Boundary
**Rationale:** Approval semantics and duplicate-account prevention are the highest-risk integration points.
**Delivers:** existing-account apply flow, approval/rejection actions, membership/role creation only on approval
**Uses:** existing ZITADEL role assignment, volunteer status, campaign membership patterns
**Implements:** application-before-membership boundary

### Phase 103: Manager Operations, Abuse Controls, and Verification
**Rationale:** Once the core flow works, staff need operational control and proof it is safe.
**Delivers:** link list/manage UI, disable/regenerate actions, review queue polish, rate-limit/duplication tests, optional notifications/reporting closure

### Phase Ordering Rationale

- Link and application primitives must exist before review or analytics are meaningful.
- Existing-account reconciliation must land before staff start approving real applications, or duplicate identities become expensive to unwind.
- Operational controls and verification belong after the core access boundary is correct, but they are still part of the same milestone because public links are abuse-prone by definition.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 102:** exact duplicate-account reconciliation rules and any ZITADEL edge cases for already-known users

Phases with standard patterns (skip research-phase):
- **Phase 101:** DB-backed link records and pending-application models are standard, well-understood patterns
- **Phase 103:** admin queue/list management and disable/regenerate controls follow established invite-link patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack is clearly sufficient; no platform migration needed |
| Features | HIGH | User goals are concrete and align with common invite/application patterns |
| Architecture | HIGH | Current codebase already exposes the exact join/membership seam that needs correction |
| Pitfalls | HIGH | Risks are directly implied by the current instant-join implementation and public-link patterns |

**Overall confidence:** HIGH

### Gaps to Address

- Exact applicant identity resolution policy when an anonymous applicant submits an email that already belongs to an existing CivicPulse account
- Whether expiry/max-use controls are required for MVP or can remain a phase-level stretch goal under the broader per-link controls umbrella

## Sources

### Primary (HIGH confidence)
- Existing codebase: `app/api/v1/join.py`, `app/services/join.py`, `app/api/v1/volunteers.py`, `app/services/volunteer.py`
- Existing implementation notes: `reports/volunteer-join-flow-backend.md`
- Slack Help Center — https://slack.com/help/articles/360060363633-Manage-pending-invitations-and-invite-links-for-your-workspace
- Slack Help Center — https://slack.com/help/articles/115005912706-Manage-Slack-Connect-channel-approval-settings-and-invitation-requests
- Discord Support — https://support.discord.com/hc/en-us/articles/208866998-Invites-101
- Google for Developers — https://developers.google.com/identity/gsi/web/guides/personalized-button

### Secondary (MEDIUM confidence)
- Inference from current CivicPulse code structure: the safest path is to preserve existing service boundaries and insert application-before-membership semantics rather than invent a parallel auth model.

### Tertiary (LOW confidence)
- None

---
*Research completed: 2026-04-09*
*Ready for roadmap: yes*
