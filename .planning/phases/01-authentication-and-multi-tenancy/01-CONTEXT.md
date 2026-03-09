# Phase 1: Authentication and Multi-Tenancy - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can authenticate via ZITADEL, create and manage campaigns, and operate within role-based, tenant-isolated boundaries. Each campaign maps to a ZITADEL organization with PostgreSQL Row-Level Security enforcing data isolation. Voter data, canvassing, phone banking, volunteer management, and dashboards are separate phases.

</domain>

<decisions>
## Implementation Decisions

### ZITADEL-to-Campaign Mapping
- 1 ZITADEL organization = 1 campaign (native tenant isolation at auth layer)
- Campaign creation auto-provisions ZITADEL org via Management API (no manual setup)
- Dedicated ZITADEL service account (machine user) with IAM-level privileges for admin operations (org creation, role grants, invitations)
- Campaign tenant derived from JWT org claim — the org_id in the token maps to a campaign
- Platform-level superadmin via ZITADEL IAM roles (not per-org)
- Fail-fast on ZITADEL outage — return 503 with clear error, roll back local DB transaction
- Compensating transaction for campaign creation: create ZITADEL org first, then local record; if local fails, delete the ZITADEL org
- Campaign deletion = soft-delete local record + deactivate ZITADEL org (not destroy)

### Campaign Model
- Local campaigns table with domain fields alongside zitadel_org_id foreign key
- Fields: id (UUID), zitadel_org_id, name, type (enum), jurisdiction_fips, jurisdiction_name, election_date, status, candidate_name, party_affiliation (optional), created_at, updated_at
- Campaign types enum: federal, state, local, ballot
- Jurisdiction: FIPS codes (state/county/place) + free-text label
- Status lifecycle: active → suspended (freeze ops), active → archived (post-election, read-only), suspended → active (resume), any → soft-deleted (invisible, recoverable)

### Row-Level Security
- RLS enforced via PostgreSQL session variable: middleware sets `SET app.current_campaign_id` on each request's DB session
- RLS policies reference `current_setting('app.current_campaign_id')::uuid`
- All tenant-scoped tables (voters, turfs, etc.) have campaign_id column with RLS policy
- Users table is also RLS-protected via campaign_members join table
- Full RLS verification in integration tests (create data in Campaign A, verify invisible from Campaign B)

### Role System
- Five roles in strict hierarchy: viewer < volunteer < manager < admin < owner
- Roles stored as ZITADEL project roles within each org — JWT claims include the user's role
- Role enforcement via FastAPI `Depends(require_role("manager"))` on route definitions
- Single owner per campaign (ownership transferable but not shared)
- Only owner can manage admin-level roles (promote to admin, remove admins)
- Admins can invite/remove users at manager level and below
- Permission summary:
  - owner = admin + delete campaign, transfer ownership
  - admin = manager + invite users, assign roles, manage settings
  - manager = volunteer + create turfs, assign volunteers, view reports
  - volunteer = viewer + record door knocks, log calls, update voter contacts
  - viewer = read-only access to campaign data

### Campaign Invite Flow
- API generates single-use invite links tied to a specific email address
- Invite tokens expire after 7 days; admins can revoke pending invites
- New users (no ZITADEL account) are redirected to ZITADEL signup, then auto-accept the invite
- ZITADEL sends invite emails using its built-in notification templates (SMTP configured in ZITADEL)
- POST /campaigns/{id}/invites creates invite with email + role; returns invite URL

### User Identity
- Local users table with ZITADEL subject UUID as primary key
- Fields: id (ZITADEL sub), display_name, email, created_at, updated_at
- User record created/updated on first authentication (synced from JWT claims)
- campaign_members join table for RLS filtering: user_id + campaign_id + synced_at (no role column — role comes from JWT)
- Membership record created on invite acceptance AND upserted on first authenticated request (belt and suspenders)
- /me endpoint reads from local users table
- /me/campaigns endpoint returns all campaigns the user has access to (queried via ZITADEL org memberships)

### JWT Validation
- JWKS-based validation with in-memory caching (fetch from ZITADEL OIDC well-known endpoint)
- Refresh JWKS on unknown key ID (handles key rotation)
- Validate: signature, expiry, issuer
- Extract: sub, org_id, roles from claims
- Token refresh is the client's responsibility (standard OIDC refresh_token flow with ZITADEL)
- Auth library: Authlib (mature, general OIDC — not the newer fastapi-zitadel-auth)

### API Conventions
- URL versioning: /api/v1/ prefix for all business endpoints
- Public routes (no auth): /health, /docs, /openapi.json
- Error format: RFC 9457 Problem Details (application/problem+json) with type, title, status, detail, instance
- Pagination: cursor-based with limit (opaque cursor tokens, {items, pagination: {next_cursor, has_more}})
- Response format: single resources returned directly, lists wrapped in {items, pagination}

### Claude's Discretion
- ZITADEL JWKS cache TTL and refresh strategy details
- Exact invite token format and storage mechanism
- Database migration ordering within Alembic
- Logging verbosity and structured log field choices
- Exact compensating transaction error handling edge cases

</decisions>

<specifics>
## Specific Ideas

- ZITADEL org-to-campaign mapping should be prototype-validated early (flagged as a risk in STATE.md)
- Campaign types should cover all US political campaign types including ballot measures for nonpartisan inclusivity
- The permission hierarchy preview (owner > admin > manager > volunteer > viewer) should be the canonical reference for all future phases

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield project with only a placeholder main.py

### Established Patterns
- FastAPI + SQLAlchemy async + Pydantic stack declared in pyproject.toml
- Conventions documented in .planning/codebase/CONVENTIONS.md (naming, imports, error handling, docstrings)
- Recommended app structure: app/ package with api/, schemas/, models/, services/, db/, core/ subdirectories
- Google-style docstrings, ruff formatting, async-first patterns

### Integration Points
- pyproject.toml has all core dependencies declared (FastAPI, SQLAlchemy, asyncpg, Pydantic, Alembic, Loguru, Typer)
- Authlib needs to be added as a dependency
- Docker Compose needed for local PostgreSQL (postgis/postgis:17-3.5)
- Production ZITADEL at auth.civpulse.org used for local dev (with a dev org)

</code_context>

<testing>
## Testing Approach

- pytest + pytest-asyncio + httpx AsyncClient
- Unit tests: mock JWT validation via FastAPI dependency override (inject fake user)
- Integration tests: real JWT from dev ZITADEL org, hit endpoints end-to-end
- RLS tests: full database-level verification (create data in Campaign A, verify invisible from Campaign B context)
- Local dev database: Docker PostgreSQL with PostGIS (docker-compose.yml)
- Local ZITADEL: use production auth.civpulse.org with dedicated dev org (no local ZITADEL container)

</testing>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-authentication-and-multi-tenancy*
*Context gathered: 2026-03-09*
