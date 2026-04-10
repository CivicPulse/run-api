# Architecture Research: Easy Volunteer Invites

**Domain:** Campaign-scoped volunteer signup links and approval workflow
**Project:** CivicPulse Run API
**Researched:** 2026-04-09
**Overall confidence:** HIGH

## Recommendation

Implement this milestone as a new public application flow, not as a minor variation of the existing immediate-join flow.

The architecture should separate:

1. public signup-link access
2. pending volunteer application persistence
3. staff approval/rejection actions
4. membership activation after approval

## Existing Integration Seams

| Component | Current role | Needed change |
|-----------|--------------|---------------|
| `app/services/join.py` | Public slug-based join directly creates membership + active volunteer | Replace direct activation path for volunteer signup links with pending application creation |
| `app/api/v1/volunteers.py` | Internal volunteer CRUD and authenticated self-registration | Add staff application-review endpoints or adjacent application endpoints |
| `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` | Mixed staff-create and self-register form | Split staff-facing volunteer creation from public volunteer application UX |
| `app/services/volunteer.py` | Volunteer CRUD and status transitions | Reuse status transitions when an approved application becomes active |
| `app/services/invite.py` patterns | Token lifecycle, revocation, delivery patterns | Reuse token-control ideas for signup links, but keep separate data model |

## Recommended Data Flow

### Public Applicant

1. Person opens a public campaign signup link.
2. Backend resolves link token and confirms the link is active and campaign-scoped.
3. Public page shows safe campaign context and application form.
4. Applicant submits form.
5. Backend creates a pending application tied to the campaign and the specific signup link.
6. No `CampaignMember` is created yet.
7. Staff later review the application.

### Approval

1. Staff opens campaign application queue.
2. Staff reviews pending application and sees source link attribution.
3. On approval, backend:
   - links to an existing user if one already exists
   - creates or activates campaign membership
   - creates or updates volunteer record
   - marks application approved
4. On rejection, backend records rejected state without campaign membership.

### Existing Account Case

1. Applicant already has a CivicPulse account but is not a member of the campaign.
2. Public flow recognizes the account by authenticated session or verified email reconciliation.
3. Application is still created as `pending`.
4. Approval grants campaign-specific access; existing global account remains unchanged.

## Boundary Decisions

### Signup Link vs Campaign Invite

Do not reuse `invites` directly.

### Application vs Volunteer Record

Keep a distinct application record before approval.

### Approval vs Membership Grant

Only approval should create campaign membership and any ZITADEL campaign role assignment.

## Suggested Build Order

1. Signup-link model and public resolution endpoint
2. Pending application model with dedupe rules and attribution
3. Public application form and submission flow
4. Staff review queue and detail view
5. Approval/rejection actions that create membership and volunteer linkage
6. Existing-account shortcuts and notification polish

## Sources

- `.planning/PROJECT.md`
- `app/services/join.py`
- `app/services/volunteer.py`
- `app/api/v1/volunteers.py`
- `app/services/invite.py`
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx`
