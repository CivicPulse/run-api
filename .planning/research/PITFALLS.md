# Domain Pitfalls: Easy Volunteer Invites

**Domain:** Campaign-scoped volunteer signup links with pending approval
**Project:** CivicPulse Run API
**Researched:** 2026-04-09
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Public link submits directly create campaign membership
**What goes wrong:** The public flow bypasses approval and writes `CampaignMember` rows immediately, similar to the current join flow.
**Why it is likely here:** `app/services/join.py` already does immediate member creation and active volunteer creation.
**Consequences:** Unapproved users gain campaign access.
**Prevention:** Keep public signup submission and approval in separate services and tables. Only approval can grant membership.

### Pitfall 2: Reusing `invites` for signup links
**What goes wrong:** One-person role-grant invites are forced to represent shareable public application links.
**Why it is likely here:** Existing invite token, revoke, and email flows are attractive to reuse.
**Consequences:** Wrong semantics, hard-to-model attribution, and confusing revoke/accept behavior.
**Prevention:** Use a dedicated signup-link model and service; reuse patterns, not the record type.

### Pitfall 3: No clean duplicate handling
**What goes wrong:** Applicants can create multiple pending applications, or existing users are blocked awkwardly.
**Why it is likely here:** The current code has separate volunteer, member, and invite concepts with different dedupe logic.
**Consequences:** Staff confusion, accidental double approvals, inconsistent applicant UX.
**Prevention:** Define explicit dedupe rules for active member, pending application, rejected application, existing account not in campaign, and existing volunteer record with no user link.

### Pitfall 4: Existing-account flow creates a second identity
**What goes wrong:** A person with a CivicPulse account is pushed through “new signup” behavior and ends up duplicated.
**Why it is likely here:** The product currently distinguishes invite acceptance, self-register, and staff-created volunteer records.
**Consequences:** Duplicate user/volunteer records and broken approval semantics.
**Prevention:** Approval flow must reconcile against existing user identity first and attach campaign membership to that identity.

### Pitfall 5: Link regeneration does not truly invalidate old links
**What goes wrong:** Staff regenerate or disable a link, but old URLs still resolve or submit successfully.
**Why it is likely here:** Token rotation can be implemented as “create another token” without enforcing old-token invalidation.
**Consequences:** Abuse controls are false confidence.
**Prevention:** Treat rotation as explicit invalidation of the old token and ensure public lookup enforces active status.

### Pitfall 6: Attribution is stored only as free text
**What goes wrong:** Source data becomes inconsistent and unusable operationally.
**Why it is likely here:** The requirement is phrased as “track how someone found the link.”
**Consequences:** Low-quality reporting and no dependable per-link counts.
**Prevention:** Attribute by durable link id first, display link label/source second.

### Pitfall 7: Public endpoints leak campaign or applicant data
**What goes wrong:** Public lookup reveals too much campaign data or applicant status to unauthenticated users.
**Why it is likely here:** New public routes will sit outside normal campaign-member RLS flows.
**Consequences:** Privacy leaks and tenancy regressions.
**Prevention:** Public endpoints should expose only safe campaign metadata and coarse application outcomes.

### Pitfall 8: Approval action is not idempotent
**What goes wrong:** Double-clicks or retries create multiple memberships, volunteers, or notifications.
**Why it is likely here:** Approval spans volunteer state, campaign membership, and possibly email/role side effects.
**Consequences:** Data corruption and inconsistent access.
**Prevention:** Use one approval transaction with uniqueness checks and idempotent status transitions.

## Recommended Mitigations

1. Separate models for signup links and applications.
2. Explicit lifecycle states: link active/inactive; application pending/approved/rejected.
3. Approval-only membership creation.
4. Existing-account reconciliation before any new user/account creation path.
5. Durable link-id attribution instead of text-only source fields.
6. Public endpoint tests for inactive, rotated, duplicate, and cross-campaign edge cases.

## Sources

- `.planning/PROJECT.md`
- `app/services/join.py`
- `app/services/volunteer.py`
- `app/api/v1/volunteers.py`
- `app/services/invite.py`
