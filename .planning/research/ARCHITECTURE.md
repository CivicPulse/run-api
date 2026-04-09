# Architecture Research

**Domain:** Campaign-scoped volunteer self-signup and approval links
**Researched:** 2026-04-09
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Public Application UI                   │
├─────────────────────────────────────────────────────────────┤
│  Join landing  │  Apply form  │  Existing-account gate     │
└────────┬────────┴────────┬─────┴──────────────┬─────────────┘
         │                 │                    │
┌────────▼─────────────────▼────────────────────▼─────────────┐
│                     Join / Apply API Layer                  │
├─────────────────────────────────────────────────────────────┤
│  Link lookup  │  Application submit  │  Auth reconciliation │
└────────┬───────┴───────────────┬──────┴───────────────┬──────┘
         │                       │                      │
┌────────▼───────────────────────▼──────────────────────▼──────┐
│                 Approval / Membership Services              │
├─────────────────────────────────────────────────────────────┤
│  SignupLink service  │  Application review  │  Role grant   │
└────────┬──────────────┴───────────────┬──────┴───────────────┘
         │                              │
┌────────▼───────────────┐   ┌──────────▼──────────────────────┐
│ Signup link records    │   │ Volunteer applications          │
│ (token, status, source)│   │ (pending/approved/rejected)     │
└────────────────────────┘   └──────────┬──────────────────────┘
                                        │
                               ┌────────▼──────────────┐
                               │ CampaignMember +      │
                               │ Volunteer + ZITADEL   │
                               └───────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Signup link management | Creates, disables, regenerates, and lists campaign-scoped public links | Manager-only API + DB table keyed to campaign |
| Public application flow | Resolves a link, shows campaign context, captures application intent and applicant details | Public GET + submit POST endpoints with rate limiting |
| Approval workflow | Converts a pending application into campaign membership or records rejection | Manager-only review endpoints with transactional membership creation |
| Identity reconciliation | Detects whether the applicant is already a CivicPulse user and binds appropriately | Reuse existing auth/session + account lookup before final application creation |

## Recommended Project Structure

```text
app/
├── api/v1/
│   ├── join.py                # public link lookup / apply endpoints
│   ├── volunteers.py          # manager review endpoints if volunteer-owned
│   └── members.py             # membership approval integration if member-owned
├── services/
│   ├── join.py                # public apply orchestration
│   ├── volunteer.py           # approval state transitions
│   ├── invite_email.py        # optional notifications
│   └── invite.py              # existing invite patterns to borrow
├── models/
│   ├── volunteer*.py          # extend or add application/link models
│   └── campaign_member.py     # final access grant target
└── schemas/
    ├── join.py                # public schemas
    └── volunteer.py           # review/list/detail schemas

web/src/
├── routes/
│   ├── join/                  # public volunteer apply route(s)
│   └── campaign/volunteers/   # manager queue and link admin routes
├── features/volunteer-signup/ # link admin + application review components
└── lib/api/                   # query/mutation hooks
```

### Structure Rationale

- **Keep public apply logic in `join` paths:** the codebase already has a join surface; this milestone changes semantics from instant join to application + approval.
- **Keep approval and membership logic near volunteer/member services:** approval must reuse existing volunteer status and campaign membership patterns instead of inventing a parallel authorization system.

## Architectural Patterns

### Pattern 1: Opaque DB-backed link records

**What:** Each public signup URL resolves to a server-side record carrying campaign, source label, lifecycle state, and optional limits.
**When to use:** Whenever links must be independently disabled, rotated, or attributed.
**Trade-offs:** Slightly more schema/API work than using campaign slug alone, but vastly simpler revocation and reporting.

### Pattern 2: Application-before-membership

**What:** Public submissions create a pending application record first. Membership and ZITADEL role assignment occur only on approval.
**When to use:** Whenever applicants must not see protected campaign data before review.
**Trade-offs:** Requires one more state transition, but keeps authorization boundaries coherent.

### Pattern 3: Existing-account reconciliation

**What:** Treat account identity and campaign membership as distinct. Reuse an existing account if present; only create campaign access after approval.
**When to use:** In multi-tenant products where users may participate in many campaigns over time.
**Trade-offs:** Requires careful duplicate detection and UI branching, but avoids account fragmentation.

## Data Flow

### Request Flow

```text
[Applicant opens link]
    ↓
[Public join page]
    ↓
[GET signup link details]
    ↓
[POST application]
    ↓
[Pending application row + copied source metadata]
    ↓
[Manager review queue]
    ↓
[Approve / Reject]
    ↓
[If approved: create CampaignMember + Volunteer + ZITADEL role]
```

### State Management

```text
[Public join route]
    ↓
[Link detail query + apply mutation]

[Manager volunteer route]
    ↓
[Link list query + application queue query + review mutations]
```

### Key Data Flows

1. **Public application flow:** link token resolves to campaign + link policy, applicant submits details, server stores pending application with immutable source attribution copied from the link.
2. **Approval flow:** manager reviews pending applications, server atomically creates campaign membership/volunteer activation and grants the campaign role.
3. **Existing-account flow:** authenticated or recognized user skips redundant identity entry, but still lands in the same pending-application queue.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k applicants/campaign | Current monolith + PostgreSQL is sufficient |
| 1k-100k applicants/platform | Add indexes on link token, application status, campaign, and created_at; paginate review queue |
| 100k+ applicants/platform | Consider background notifications and analytics aggregation, but keep authoritative approval writes transactional |

### Scaling Priorities

1. **First bottleneck:** manager queue queries on pending applications by campaign — solve with proper campaign/status indexes and cursor pagination.
2. **Second bottleneck:** abuse or bot traffic on public links — solve with rate limits, link disable controls, and optional CAPTCHA only if needed later.

## Anti-Patterns

### Anti-Pattern 1: Reusing `Campaign.slug` as the only invite primitive

**What people do:** Treat the campaign slug as the public join key forever.
**Why it's wrong:** It cannot represent multiple sources, independent lifecycle controls, or abuse recovery.
**Do this instead:** Introduce separate signup-link records that point to the campaign.

### Anti-Pattern 2: Creating `CampaignMember` at submit time and hiding with status flags

**What people do:** Insert campaign membership immediately and rely on UI checks to hide access.
**Why it's wrong:** Authorization drift becomes likely because the user technically belongs to the campaign before approval.
**Do this instead:** Keep application state separate; create membership only on approval.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ZITADEL | Grant campaign role only during approval | Reuse the current org-scoped project-role assignment path from invites/join |
| Mailgun/email provider seam | Optional application receipt or approval notification | Reuse existing transactional email foundation; do not invent a second mail path |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `join` API ↔ join service | Direct service call | Public-facing validation, rate limits, and token resolution live here |
| join/apply service ↔ volunteer/member services | Direct service or thin orchestration layer | Approval must reuse existing membership and volunteer status logic |
| approval service ↔ ZITADEL | Existing service client | Role grant/removal should remain centralized |

## Sources

- Existing codebase: `app/api/v1/join.py`, `app/services/join.py`, `app/api/v1/volunteers.py`, `app/services/volunteer.py`
- Existing implementation notes: `reports/volunteer-join-flow-backend.md`
- Slack Help Center — https://slack.com/help/articles/360060363633-Manage-pending-invitations-and-invite-links-for-your-workspace
- Discord Support — https://support.discord.com/hc/en-us/articles/208866998-Invites-101
- Google for Developers — https://developers.google.com/identity/gsi/web/guides/personalized-button

---
*Architecture research for: campaign-scoped volunteer self-signup and approval links*
*Researched: 2026-04-09*
