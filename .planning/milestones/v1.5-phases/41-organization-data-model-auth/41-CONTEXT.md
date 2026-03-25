# Phase 41: Organization Data Model & Auth - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The backend supports org-level roles and multi-campaign membership with correct permission resolution. This phase delivers the `organization_members` table, `OrgRole` enum, modified `resolve_campaign_role()` with org role integration, `require_org_role()` auth dependency, minimal org API endpoints, and a seed migration promoting org creators to org_owner. No frontend UI -- backend data model and auth only.

</domain>

<decisions>
## Implementation Decisions

### Org Role Hierarchy
- **D-01:** Two org roles only: `org_owner` and `org_admin`. Matches the "fixed 7-role hierarchy (5 campaign + 2 org)" constraint from REQUIREMENTS.md
- **D-02:** org_admin maps to campaign ADMIN-equivalent permissions on all campaigns in the org
- **D-03:** org_owner maps to campaign OWNER-equivalent permissions on all campaigns in the org
- **D-04:** Org ownership is transferable -- org_owner can transfer to another org_admin. Prevents orphaned orgs if the original creator leaves
- **D-05:** Campaign creators always get an explicit CampaignMember(OWNER) record regardless of org role. Keeps member listings consistent and every campaign has at least one explicit owner

### Role Resolution Logic
- **D-06:** Org roles grant implicit campaign access -- no CampaignMember record required. An org_admin can access any campaign in the org with ADMIN-equivalent permissions (ORG-03 success criteria #2)
- **D-07:** Resolution order: (1) explicit CampaignMember role, (2) OrganizationMember-derived campaign equivalent, (3) deny. JWT role fallback is dropped -- org roles formalize what JWT role was bootstrapping
- **D-08:** Org roles are additive, never restrictive. max(campaign_role, org_role_equivalent) -- a user with CampaignMember(VIEWER) and org_admin resolves to ADMIN, never VIEWER (ORG-03)
- **D-09:** Seed migration (ORG-02) promotes only Organization.created_by to org_owner. Other existing users keep their explicit CampaignMember roles -- org_admin is intentionally appointed later

### Org API Endpoints
- **D-10:** Minimal endpoint set for Phase 41: GET /api/v1/org (org details), GET /api/v1/org/campaigns (list campaigns in org), GET /api/v1/org/members (list org-level members). Full CRUD deferred to Phase 43
- **D-11:** JWT org_id is authoritative for org scoping. Multi-org switching happens at the ZITADEL level (user switches org context). No query param or header override
- **D-12:** `require_org_role()` validates the user's JWT org_id against a DB Organization record, then checks OrganizationMember for the user. Ensures org exists and user has explicit org role
- **D-13:** Org-level endpoints bypass campaign RLS entirely. They use a regular `get_db()` session and filter by org_id in service queries. Campaign-scoped endpoints continue using RLS as before (matches Phase 39 D-06 forward-compatible design)

### OrganizationMember Table Schema
- **D-14:** Stored as `organization_members` table with fields: id (UUID PK), user_id (FK users.id), organization_id (FK organizations.id), role (VARCHAR via OrgRole StrEnum), invited_by (FK users.id, nullable), joined_at (datetime, nullable), created_at, updated_at
- **D-15:** Separate `OrgRole` StrEnum with values `org_owner` and `org_admin`. Stored as VARCHAR (native_enum=False per project convention). Clean separation from CampaignRole
- **D-16:** Unique constraint on (user_id, organization_id) to prevent duplicate memberships. Matches CampaignMember pattern
- **D-17:** Application-level filtering by org_id in service queries -- no RLS policies on organization_members. Keeps RLS focused on campaign-scoped data

### Claude's Discretion
- Migration file naming and revision chain (follows existing alembic pattern)
- OrgRole enum placement (new file vs existing security.py)
- require_org_role() implementation details (factory pattern matching require_role())
- Org service class design (new OrgService or extend CampaignService)
- Test structure for org role resolution edge cases

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Organization Infrastructure
- `app/models/organization.py` -- Organization model (zitadel_org_id, name, created_by)
- `alembic/versions/009_organizations.py` -- Organizations table + campaign.organization_id FK
- `app/models/campaign.py` -- Campaign model with organization_id FK (nullable)

### Auth & Role Resolution
- `app/core/security.py` -- CampaignRole IntEnum, resolve_campaign_role(), require_role(), AuthenticatedUser, get_current_user()
- `app/api/deps.py` -- get_campaign_db(), ensure_user_synced(), campaign context dependencies
- `app/db/rls.py` -- set_campaign_context() for RLS

### Existing Member Pattern
- `app/models/campaign_member.py` -- CampaignMember model (pattern to follow for OrganizationMember)
- `alembic/versions/008_campaign_member_role.py` -- CampaignMember.role column migration
- `alembic/versions/014_backfill_campaign_members.py` -- Data migration pattern for backfilling membership records

### API Patterns
- `app/api/v1/router.py` -- V1 API router aggregation (add org router here)
- `app/api/v1/campaigns.py` -- Campaign list endpoint (pattern for org endpoints)
- `app/api/v1/members.py` -- Campaign members endpoint (pattern for org members)

### Requirements
- `.planning/REQUIREMENTS.md` -- ORG-01 through ORG-04 (lines 28-34)

### Prior Phase Context
- `.planning/phases/39-rls-fix-multi-campaign-foundation/39-CONTEXT.md` -- D-06: RLS forward-compatible with org context
- `.planning/phases/40-production-hardening-observability/40-CONTEXT.md` -- Observability infrastructure (structlog, Sentry)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Organization` model already exists with zitadel_org_id, name, created_by -- no model changes needed
- `Campaign.organization_id` FK already exists (nullable, migration 009)
- `resolve_campaign_role()` in security.py -- modify to add org role step between CampaignMember and deny
- `require_role()` factory pattern -- replicate for `require_org_role()`
- `CampaignMember` model -- structural template for OrganizationMember
- Alembic data migration pattern from 014_backfill_campaign_members.py -- reuse for ORG-02 seed migration

### Established Patterns
- StrEnum with native_enum=False for role columns (VARCHAR storage)
- FastAPI `Depends()` chain for auth -> role -> DB session
- Module-level service singletons in route files
- Pydantic Create/Update/Response schema pattern
- Cursor-based pagination via PaginatedResponse[T]

### Integration Points
- `app/core/security.py` -- Add OrgRole enum, modify resolve_campaign_role(), add require_org_role()
- `app/api/v1/router.py` -- Register new org router
- `app/db/base.py` -- Import new OrganizationMember model for Alembic detection
- `app/models/__init__.py` -- Export OrganizationMember in __all__
- `app/api/deps.py` -- ensure_user_synced() may need org member awareness

</code_context>

<specifics>
## Specific Ideas

- JWT role fallback is explicitly dropped in favor of org roles -- this is a deliberate simplification, not an oversight. The seed migration ensures existing org creators have OrganizationMember records so they don't lose access
- v1.5 Research decision confirmed: "Org endpoints use /api/v1/org (implicit org from JWT)" -- no path parameter for org_id
- Org ownership transfer follows the same pattern as campaign ownership transfer from v1.2 (type-to-confirm)
- All three extra fields on OrganizationMember (invited_by, joined_at, created_at/updated_at) were selected -- the table should be complete from the start even if invite flow isn't built until Phase 43

</specifics>

<deferred>
## Deferred Ideas

- **Org member CRUD endpoints** -- Phase 43 (POST/PATCH/DELETE org members, invite flow)
- **Org settings update endpoint** -- Phase 43 (PATCH /api/v1/org for name edit)
- **Org switcher UI** -- Phase 43 (ORG-12, frontend header component)
- **Org-level RLS policies** -- Not needed. Application-level filtering is sufficient per D-17
- **Campaign creation gating** -- Phase 43 (ORG-07, only org_admin+ can create campaigns)

</deferred>

---

*Phase: 41-organization-data-model-auth*
*Context gathered: 2026-03-24*
