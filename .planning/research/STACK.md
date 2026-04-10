# Stack Research: Easy Volunteer Invites

**Domain:** Campaign-scoped volunteer signup links and approval-gated applications
**Project:** CivicPulse Run API
**Researched:** 2026-04-09
**Overall confidence:** HIGH

## Recommendation

The existing stack is already sufficient for this milestone. The work should extend current backend and frontend seams rather than add a new auth, invite, or forms subsystem.

Use:

- FastAPI + SQLAlchemy async for public application endpoints and staff approval actions
- PostgreSQL for durable signup-link and application records
- Existing ZITADEL auth for account recognition and post-approval campaign membership
- Existing Mailgun-backed invite/email foundation for confirmation and approval notifications when needed
- Existing React + TanStack Router/Query frontend for public application pages and staff management UI
- Existing Procrastinate queue only if notifications or abuse/audit tasks need async handling

Do not add:

- A second auth system or passwordless signup flow
- Public write access directly to `campaign_members`
- A marketing/referral platform or analytics service
- A third-party form builder
- Link-shortener or external attribution vendor dependencies

## Existing Seams To Reuse

| Component | What already exists | How this milestone should use it |
|-----------|---------------------|----------------------------------|
| `app/services/join.py` | Public campaign join flow by campaign slug, immediate `CampaignMember` creation, immediate `Volunteer(status='active')` creation | Replace or narrow the immediate-grant path for volunteer applications; new public links should create pending applications instead of active membership |
| `app/services/volunteer.py` | Manager-created volunteers default to `pending`; status transitions already enforce `pending -> active/inactive` | Reuse volunteer lifecycle semantics for application review and approval |
| `app/api/v1/volunteers.py` | Staff CRUD and self-register endpoints | Add staff review/approval actions and avoid the current authenticated self-register path for this milestone's public link flow |
| `app/services/invite.py` + invite model | Tokenized, revocable campaign invites with delivery metadata | Reuse link lifecycle ideas (token, revoke, rotate, delivery metadata patterns), but do not overload campaign member invites for volunteer applications |
| `app/services/email_delivery.py` and invite tasks | Async Mailgun-backed email delivery already exists | Reuse only for optional applicant/staff notifications |
| `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx` | Current volunteer registration form with staff and self-register modes | Split staff-facing volunteer creation from public application flow; current route should not remain the public entry point unchanged |

## Recommended Data Additions

Minimal new persistence is justified.

| Need | Recommendation | Why |
|------|----------------|-----|
| Campaign signup links | New table such as `volunteer_signup_links` | Multiple campaign-scoped links with labels, status, token/slug, attribution metadata, rotation, and abuse controls need their own durable records |
| Volunteer applications | New table such as `volunteer_applications` | Pending applications should be distinct from active campaign membership and from internal volunteer records until approved |
| Attribution | Store link id and source label on application | This satisfies “how did they find us?” without external analytics tooling |
| Approval audit | Store approver, approved/rejected timestamps, and resolution note | Staff actions need traceability and safe repeated review |

Prefer a distinct application record over trying to encode everything into `volunteers.status='pending'` alone. The current `volunteers` table is an internal campaign record and mixes too early with user/member semantics.

## Config and Integration Requirements

| Config / seam | Needed | Notes |
|---------------|--------|-------|
| Public app base URL | Yes | Public signup links must be built from explicit public URL config, not request headers |
| Rate limiting | Yes | Public application endpoints and link lookup endpoints need IP-aware limits |
| Abuse controls | Yes | Link disable/regenerate and staff-visible counts are part of the product requirement |
| Existing identity lookup | Yes | Existing CivicPulse users should be recognized by email/account and not forced through duplicate account creation |
| Notification templates | Optional but likely | Reuse app-owned Mailgun email system if applicant/staff notifications are sent |

## What Not To Add

| Avoid | Reason |
|------|--------|
| Public direct creation of `CampaignMember` rows | Violates the approval requirement |
| Automatic volunteer activation on application submit | Conflicts with pending-vs-active gate |
| Per-link deep analytics, cookies, or campaign tracking pixels | Over-scoped for “which link did they use?” |
| Requiring existing users to create a second account | Violates explicit milestone intent |

## Sources

- `.planning/PROJECT.md`
- `app/services/join.py`
- `app/services/volunteer.py`
- `app/api/v1/volunteers.py`
- `app/services/invite.py`
- `app/models/invite.py`
- `web/src/routes/campaigns/$campaignId/volunteers/register/index.tsx`
