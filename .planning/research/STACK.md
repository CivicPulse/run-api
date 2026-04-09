# Stack Research

**Domain:** Campaign-scoped volunteer self-signup and approval links
**Researched:** 2026-04-09
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| FastAPI + SQLAlchemy async | existing | Public join endpoints, manager link management, approval actions | Already powers CivicPulse API patterns, validation, RLS-aware services, and transaction boundaries without adding a second backend surface. |
| PostgreSQL | existing | Durable invite-link records, pending applications, approval audit state | Link rotation, per-link attribution, and approval decisions need authoritative server-side state rather than self-contained tokens. |
| React + TanStack Query/Router | existing | Public application page plus manager review/link admin UI | Matches the existing web app architecture and supports pending/active state transitions without introducing a separate frontend stack. |
| ZITADEL | existing | Create or attach identity only after approval | Existing auth system already owns user identity and campaign role assignment, so approval should gate when those org-scoped roles are granted. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Python `secrets` / `hashlib` stdlib | Python 3.13+ | Opaque link token generation and optional hashed token storage | Use for non-guessable invite/application tokens without bringing in JWT-style complexity. |
| Existing mail pipeline (`app/services/invite_email.py`, Mailgun provider seam) | existing | Optional applicant confirmation and manager notification emails | Use if the milestone includes “application received” or “approved” transactional mail. |
| Existing rate limiting middleware | existing | Abuse protection on public application endpoints | Required because public links are intentionally shareable and can be abused. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Alembic migration flow | Schema changes | Add dedicated signup-link and application tables or extend current join-related models with reversible migrations. |
| Existing Playwright + backend tests | Verification | Cover public application, existing-account apply flow, approval, rejection, link disable/regenerate, and source attribution display. |

## Installation

```bash
# No new core packages required for the recommended baseline.
# Reuse the current FastAPI / SQLAlchemy / React / ZITADEL stack.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| DB-backed opaque signup links | Self-contained JWT invite links | Only use JWT links if offline verification or cross-service validation is required. That is not needed here and makes revocation/regeneration harder. |
| Approval-gated membership creation | Immediate `CampaignMember` creation on apply | Only use immediate membership when the product explicitly wants open self-join without staff review. That conflicts with this milestone goal. |
| Existing-account detection during apply | Force every applicant through full signup/profile entry | Only use the full form for anonymous first-time applicants. Returning users should not create duplicate accounts or re-enter known identity fields. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| URL slug alone as the public signup secret | Campaign slug is already public and cannot support per-link controls or attribution | Dedicated per-link token/code records tied to a campaign |
| Stateless invite codes with no DB record | Cannot cleanly disable, rotate, cap uses, or attribute applicants to a specific source | Server-side link rows with status and metadata |
| Granting ZITADEL campaign role before approval | Violates the requirement that applicants see nothing until approved | Create pending application first, assign membership/role only after approval |

## Stack Patterns by Variant

**If the applicant is anonymous:**
- Show the public campaign signup landing page.
- Capture application details first, then route to account creation/sign-in only when needed to complete the application.

**If the applicant already has a CivicPulse account but lacks campaign membership:**
- Reuse the existing identity.
- Prefill or suppress identity fields already known from the account.
- Create a pending application bound to that existing user record.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Existing FastAPI API layer | Existing SQLAlchemy async session / Alembic | No stack change required; milestone is primarily new data model and workflow logic. |
| Existing React app | Existing TanStack Query / Router setup | Public join and manager review screens fit the current frontend patterns. |

## Sources

- Existing codebase: `app/api/v1/join.py`, `app/services/join.py`, `app/api/v1/volunteers.py`, `app/services/volunteer.py` — verified the current join flow creates immediate membership and that volunteer status already supports `pending`.
- Slack Help Center — https://slack.com/help/articles/360060363633-Manage-pending-invitations-and-invite-links-for-your-workspace — official example of invite-link lifecycle controls such as viewing, deactivating, renewing, and managing pending invitations.
- Discord Support — https://support.discord.com/hc/en-us/articles/208866998-Invites-101 — official example of per-link controls like expiration, max uses, and generating a new link.
- Google for Developers — https://developers.google.com/identity/gsi/web/guides/personalized-button — official sign-in guidance showing better returning-user flows when a system recognizes an existing account instead of forcing duplicate account creation.

---
*Stack research for: campaign-scoped volunteer self-signup and approval links*
*Researched: 2026-04-09*
