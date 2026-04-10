# Feature Landscape: Easy Volunteer Invites

**Domain:** Campaign-scoped volunteer signup links with pending approval
**Project:** CivicPulse Run API
**Researched:** 2026-04-09
**Overall confidence:** HIGH

## Scope Boundary

This milestone is about a campaign sharing one or more volunteer signup links so people can apply to join that campaign, remain pending until staff approval, and preserve attribution per link.

This milestone is not:

- general campaign-member invites for admins/managers
- a marketing lead funnel
- volunteer CRM scoring or automation
- organization-scoped shared signup portals

## Table Stakes

### Signup Links

| Feature | Why expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multiple signup links per campaign | Required for source tracking and channel-specific sharing | Medium | Each link needs label, token/slug, status, created/updated timestamps |
| Per-link label/source name | Core attribution requirement | Low | Example: `website`, `flyer`, `event-qr` |
| Disable/regenerate link | Required abuse control | Medium | Regeneration should invalidate old public URLs cleanly |
| Public link resolution page | People need a stable public destination | Medium | Should show campaign context and application state safely |

### Applications

| Feature | Why expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Public volunteer application form | Core entry point for new volunteers | Medium | Collect enough data for staff review and later volunteer workflows |
| Pending state after submit | Explicit user requirement | Low | No campaign access before review |
| Staff review queue | Required to turn pending applications into usable workflow | Medium | Needs filtering and attribution visibility |
| Approve or reject application | Core lifecycle action | Medium | Approval should be idempotent and traceable |

### Existing Account Handling

| Feature | Why expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Existing CivicPulse user can apply without creating another account | Explicit user requirement | Medium | Should recognize account and avoid duplicate signup |
| Reuse known profile info when possible | Required UX simplification | Medium | Existing user should not need to re-enter all fields |
| Existing account still requires approval for this campaign | Core permission boundary | Low | Existing identity does not imply campaign membership |

### Staff Visibility

| Feature | Why expected | Complexity | Notes |
|---------|--------------|------------|-------|
| See which link produced each application | Core attribution outcome | Low | Surface link label/source on each application |
| View pending vs approved/rejected counts by link | Useful baseline insight | Medium | Lightweight operational reporting, not full analytics |
| Link-level controls in campaign UI | Needed to manage abuse and rotation | Medium | Create, copy, disable, regenerate |

## Differentiators

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| Optional per-link expiry | Helps with event-specific links | Low | Good candidate if it fits without bloating v1.17 |
| Applicant confirmation and approval emails | Better UX and lower staff friction | Medium | Reuse Mailgun-backed email foundation |
| Duplicate-application guidance | Better handling for already-pending or already-active users | Medium | Important for clean UX when links are reused publicly |

## Anti-Features

| Anti-feature | Why avoid | What to do instead |
|-------------|-----------|--------------------|
| Auto-approve applicants from public links | Breaks the milestone’s permission boundary | Keep staff approval mandatory |
| Org-wide volunteer pools joined from one link | Not requested and complicates tenancy | Keep links campaign-scoped |
| Rich referral attribution/UTM dashboards | Over-scoped for “which link did they use?” | Store link id + label only |
| Public campaign browsing/discovery directory | Separate product surface | Require possession of a campaign-issued link |
| Volunteer application workflow builder | Too much configurability for first release | Use one fixed, product-owned application flow |

## Category Recommendations For Requirements

Use these requirement categories:

1. `LINK` — campaign signup-link lifecycle and controls
2. `APPL` — public application submission and applicant-state handling
3. `APRV` — staff review, approval, rejection, and gating
4. `ACCT` — existing-account recognition and account-to-membership conversion
5. `OBS` — attribution and operational visibility

## Sources

- `.planning/PROJECT.md`
- `app/services/join.py`
- `app/services/volunteer.py`
- `app/api/v1/volunteers.py`
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx`
