# Phase 41: Organization Data Model & Auth - Research

**Researched:** 2026-03-24
**Domain:** SQLAlchemy async models, FastAPI auth dependencies, Alembic data migrations
**Confidence:** HIGH

## Summary

This phase adds org-level roles (org_owner, org_admin) to the existing multi-tenant campaign platform. The work is entirely backend: a new `organization_members` table, an `OrgRole` StrEnum, modifications to `resolve_campaign_role()` for additive org role resolution, a new `require_org_role()` dependency factory, three read-only org API endpoints, and a seed migration promoting org creators to org_owner.

The existing codebase already has all the infrastructure patterns needed. The `CampaignMember` model provides the template for `OrganizationMember`. The `require_role()` factory in `security.py` provides the template for `require_org_role()`. The `014_backfill_campaign_members.py` migration provides the data migration pattern. The primary complexity is in modifying `resolve_campaign_role()` to add the org role lookup step while maintaining backward compatibility with existing campaign-scoped auth.

**Primary recommendation:** Follow existing project patterns exactly. The OrganizationMember model mirrors CampaignMember, OrgRole is a separate StrEnum (not IntEnum), and resolve_campaign_role() gets a new step 1.5 between CampaignMember lookup and JWT fallback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Two org roles only: org_owner and org_admin
- D-02: org_admin maps to campaign ADMIN-equivalent permissions
- D-03: org_owner maps to campaign OWNER-equivalent permissions
- D-04: Org ownership is transferable
- D-05: Campaign creators always get explicit CampaignMember(OWNER) record
- D-06: Org roles grant implicit campaign access -- no CampaignMember record required
- D-07: Resolution order: (1) explicit CampaignMember role, (2) OrganizationMember-derived campaign equivalent, (3) deny. JWT role fallback dropped
- D-08: Org roles are additive: max(campaign_role, org_role_equivalent)
- D-09: Seed migration promotes only Organization.created_by to org_owner
- D-10: Minimal endpoints: GET /api/v1/org, GET /api/v1/org/campaigns, GET /api/v1/org/members
- D-11: JWT org_id is authoritative for org scoping
- D-12: require_org_role() validates JWT org_id against DB Organization record, then checks OrganizationMember
- D-13: Org-level endpoints bypass campaign RLS; use regular get_db() with org_id filter
- D-14: organization_members table schema: id, user_id, organization_id, role, invited_by, joined_at, created_at, updated_at
- D-15: Separate OrgRole StrEnum with org_owner and org_admin values, stored as VARCHAR (native_enum=False)
- D-16: Unique constraint on (user_id, organization_id)
- D-17: No RLS policies on organization_members; application-level filtering by org_id

### Claude's Discretion
- Migration file naming and revision chain (follows existing alembic pattern)
- OrgRole enum placement (new file vs existing security.py)
- require_org_role() implementation details (factory pattern matching require_role())
- Org service class design (new OrgService or extend CampaignService)
- Test structure for org role resolution edge cases

### Deferred Ideas (OUT OF SCOPE)
- Org member CRUD endpoints -- Phase 43
- Org settings update endpoint -- Phase 43
- Org switcher UI -- Phase 43
- Org-level RLS policies -- not needed per D-17
- Campaign creation gating -- Phase 43
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-01 | `organization_members` table stores org-level roles (`org_owner`, `org_admin`) per user per org | OrganizationMember model mirrors CampaignMember pattern; OrgRole StrEnum with native_enum=False; Alembic migration creates table with all D-14 columns |
| ORG-02 | Seed migration promotes existing org `created_by` users to `org_owner` | Data migration pattern from 014_backfill_campaign_members.py; INSERT from organizations.created_by into organization_members with role='org_owner' |
| ORG-03 | `resolve_campaign_role()` returns max(campaign role, org role equivalent) -- org roles are additive, never restrictive | New step between CampaignMember lookup and deny; OrganizationMember lookup maps org_admin->ADMIN, org_owner->OWNER; Python max() on IntEnum values |
| ORG-04 | `require_org_role()` auth dependency gates org-level endpoints | Factory pattern matching require_role(); validates JWT org_id against Organization table, then checks OrganizationMember.role; returns 403 if no org role |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** Always use `uv` (not pip/poetry)
- **Python linting:** `uv run ruff check .` / `uv run ruff format .`
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008 for FastAPI Depends)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` (asyncio_mode=auto)
- **Commit style:** Conventional Commits
- **Context7 MCP:** Use for library documentation lookups

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | >=2.0.48 | Async ORM for OrganizationMember model | Project standard, mapped_column pattern |
| FastAPI | >=0.135.1 | API endpoints and Depends() auth chain | Project standard |
| Alembic | >=1.18.4 | Migration for organization_members table + seed data | Project standard |
| Pydantic | >=2.12.5 | Request/response schemas | Project standard |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| asyncpg | >=0.31.0 | Async PostgreSQL driver | All DB operations |
| pytest | >=9.0.2 | Unit tests for role resolution | All test files |
| pytest-asyncio | >=1.3.0 | Async test support | All async test functions |

No new dependencies are required for this phase.

## Architecture Patterns

### Recommended File Structure
```
app/
  core/
    security.py          # Add OrgRole StrEnum, modify resolve_campaign_role(), add require_org_role()
  models/
    organization_member.py  # New OrganizationMember model
    __init__.py             # Export OrganizationMember
  db/
    base.py              # Import organization_member for Alembic detection
  api/
    v1/
      org.py             # New org router (3 GET endpoints)
      router.py          # Register org router
  schemas/
    org.py               # New org schemas (OrgResponse, OrgMemberResponse, OrgCampaignResponse)
  services/
    org.py               # New OrgService class
alembic/
  versions/
    015_organization_members.py   # Table creation + seed migration
tests/
  unit/
    test_resolve_campaign_role.py  # Extend with org role resolution tests
    test_org_auth.py               # New: require_org_role() tests
    test_org_api.py                # New: org endpoint tests
```

### Pattern 1: OrganizationMember Model (mirrors CampaignMember)
**What:** SQLAlchemy model with UUID PK, FKs to users and organizations, VARCHAR role column
**When to use:** This is the only approach -- D-14 specifies the schema exactly
**Example:**
```python
# Based on existing CampaignMember pattern in app/models/campaign_member.py
class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_organization"),
        CheckConstraint(
            "role IN ('org_owner', 'org_admin')",
            name="ck_organization_members_role_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    invited_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
```

### Pattern 2: OrgRole StrEnum (separate from CampaignRole IntEnum)
**What:** A StrEnum for org roles, cleanly separated from the IntEnum campaign hierarchy
**When to use:** All org role comparisons and storage
**Example:**
```python
# In app/core/security.py
from enum import StrEnum

class OrgRole(StrEnum):
    ORG_OWNER = "org_owner"
    ORG_ADMIN = "org_admin"

# Mapping from OrgRole to CampaignRole equivalent for additive resolution
ORG_ROLE_CAMPAIGN_EQUIVALENT: dict[OrgRole, CampaignRole] = {
    OrgRole.ORG_ADMIN: CampaignRole.ADMIN,
    OrgRole.ORG_OWNER: CampaignRole.OWNER,
}
```

### Pattern 3: Modified resolve_campaign_role() with Org Step
**What:** Add org role lookup between CampaignMember check and JWT fallback
**When to use:** Every campaign-scoped auth check
**Example:**
```python
async def resolve_campaign_role(
    user_id: str,
    campaign_id: uuid.UUID,
    db: AsyncSession,
    jwt_role: CampaignRole,
    user_org_id: str | None = None,
) -> CampaignRole | None:
    # 1. Explicit CampaignMember role
    member_role = await db.scalar(
        select(CampaignMember.role).where(
            CampaignMember.user_id == user_id,
            CampaignMember.campaign_id == campaign_id,
        )
    )
    explicit_campaign_role = None
    if member_role:
        try:
            explicit_campaign_role = CampaignRole[member_role.upper()]
        except KeyError:
            pass

    # 2. Org role lookup -- find campaign's org, then check OrganizationMember
    org_derived_role = None
    if user_org_id:
        campaign = await db.scalar(select(Campaign).where(Campaign.id == campaign_id))
        if campaign and campaign.organization_id:
            org_member_role = await db.scalar(
                select(OrganizationMember.role).where(
                    OrganizationMember.user_id == user_id,
                    OrganizationMember.organization_id == campaign.organization_id,
                )
            )
            if org_member_role:
                try:
                    org_role = OrgRole(org_member_role)
                    org_derived_role = ORG_ROLE_CAMPAIGN_EQUIVALENT[org_role]
                except (ValueError, KeyError):
                    pass

    # 3. Additive resolution: max of explicit campaign + org-derived
    roles = [r for r in [explicit_campaign_role, org_derived_role] if r is not None]
    if roles:
        return max(roles)

    # 4. Deny (JWT fallback dropped per D-07)
    return None
```

### Pattern 4: require_org_role() Factory
**What:** FastAPI dependency factory that gates org-level endpoints
**When to use:** All three org endpoints (GET /api/v1/org, /api/v1/org/campaigns, /api/v1/org/members)
**Example:**
```python
def require_org_role(minimum: str):
    """Gate org-level endpoints by org role."""
    min_org_role = OrgRole(minimum)

    async def _check_org_role(
        current_user: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AuthenticatedUser:
        # Find org by JWT org_id
        org = await db.scalar(
            select(Organization).where(
                Organization.zitadel_org_id == current_user.org_id
            )
        )
        if not org:
            raise HTTPException(status_code=403, detail="Organization not found")

        # Check OrganizationMember
        org_member_role = await db.scalar(
            select(OrganizationMember.role).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.organization_id == org.id,
            )
        )
        if not org_member_role:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        # Validate role level (org_admin < org_owner)
        try:
            user_org_role = OrgRole(org_member_role)
        except ValueError:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        # OrgRole ordering: org_admin < org_owner
        org_role_levels = {OrgRole.ORG_ADMIN: 0, OrgRole.ORG_OWNER: 1}
        if org_role_levels[user_org_role] < org_role_levels[min_org_role]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        return current_user

    return _check_org_role
```

### Pattern 5: Seed Migration (data migration)
**What:** Alembic migration that creates the table AND inserts seed data
**When to use:** ORG-02 requirement
**Example:**
```python
# Based on 014_backfill_campaign_members.py pattern
def upgrade() -> None:
    # Create table
    op.create_table(
        "organization_members",
        sa.Column("id", sa.UUID(), nullable=False, default=uuid.uuid4),
        # ... all columns ...
    )
    # Seed: promote org creators to org_owner
    op.execute("""
        INSERT INTO organization_members (id, user_id, organization_id, role, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            o.created_by,
            o.id,
            'org_owner',
            NOW(),
            NOW()
        FROM organizations o
        ON CONFLICT DO NOTHING
    """)
```

### Anti-Patterns to Avoid
- **Modifying CampaignRole IntEnum for org roles:** CampaignRole is an IntEnum with ordered values 0-4. Org roles are a separate concept with different semantics. Keep them as separate types (D-15).
- **Adding RLS policies for organization_members:** D-17 explicitly says application-level filtering only. No RLS on this table.
- **JWT role fallback in resolve_campaign_role():** D-07 drops this. After adding org role step, the function should deny (return None) if neither CampaignMember nor OrganizationMember grants access. The current JWT fallback path must be removed.
- **Org endpoints using get_campaign_db():** D-13 says org endpoints bypass campaign RLS. Use regular `get_db()`.
- **Multiple invited_by ForeignKeys without disambiguation:** The OrganizationMember model has both user_id and invited_by pointing to users.id. SQLAlchemy needs explicit `foreign_keys` on any relationships to avoid ambiguity. Since we are not defining relationships on this model (just columns), this is not an issue for mapped_column -- but keep it in mind.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Role hierarchy comparison | Custom comparison logic | Python `max()` on CampaignRole IntEnum values | IntEnum supports natural ordering; max(VIEWER, ADMIN) = ADMIN |
| UUID generation in migrations | Python uuid4() calls | PostgreSQL `gen_random_uuid()` | Runs inside the DB migration context, no Python runtime needed |
| Org role ordering | Numeric comparison on StrEnum | Dict-based level mapping `{OrgRole.ORG_ADMIN: 0, OrgRole.ORG_OWNER: 1}` | StrEnum has no natural ordering; explicit mapping is clearer |
| Test JWT generation | Manual token crafting | Existing `make_jwt()` from tests/conftest.py | Already handles ZITADEL claim structure correctly |

## Common Pitfalls

### Pitfall 1: JWT Fallback Removal Breaking Existing Users
**What goes wrong:** Removing the JWT role fallback from resolve_campaign_role() means users who only had JWT-derived access (no CampaignMember.role set) will lose campaign access.
**Why it happens:** Existing CampaignMember records may have `role=NULL` -- they relied on JWT role.
**How to avoid:** The seed migration (ORG-02) creates OrganizationMember records for org creators. But other users in the org who have NULL CampaignMember.role need to either (a) get their CampaignMember.role backfilled, or (b) get org membership. Verify that ensure_user_synced() still creates CampaignMember records on login -- it does, but those records also have NULL role. The migration or the resolve function must handle NULL CampaignMember.role gracefully.
**Warning signs:** Users who previously could access campaigns get 403 after deployment.

**CRITICAL INSIGHT:** Looking at the current code, `resolve_campaign_role()` step 2 falls back to JWT role when the user's org matches. D-07 says to drop this JWT fallback. But if we remove it, users with NULL CampaignMember.role and no OrganizationMember record will be denied. The seed migration only promotes `created_by` users. Other org users with NULL roles need to still work. Two options:
1. The seed migration also backfills CampaignMember.role from JWT for all existing members (safer but heavier).
2. Accept that only org creators get promoted and other users continue to work because they DO have CampaignMember records (even with NULL role) -- and treat NULL role as VIEWER equivalent.

Recommendation: Treat NULL CampaignMember.role as VIEWER (existing behavior matches this -- the code does `member.role or "viewer"` in the members endpoint). In resolve_campaign_role(), when member_role is found but is None/NULL, return CampaignRole.VIEWER instead of falling through.

### Pitfall 2: OrgRole Comparison Semantics
**What goes wrong:** Using `>` or `<` operators on StrEnum values compares strings alphabetically, not hierarchy.
**Why it happens:** StrEnum doesn't have IntEnum's natural numeric ordering. "org_admin" < "org_owner" alphabetically, which happens to be correct, but this is coincidental and fragile.
**How to avoid:** Use an explicit level dict: `ORG_ROLE_LEVELS = {OrgRole.ORG_ADMIN: 0, OrgRole.ORG_OWNER: 1}`.
**Warning signs:** Role checks pass/fail unexpectedly when role names change.

### Pitfall 3: Circular Import with OrganizationMember in security.py
**What goes wrong:** resolve_campaign_role() already imports Campaign and CampaignMember inside the function body (deferred imports). Adding OrganizationMember follows the same pattern.
**Why it happens:** security.py is imported by models transitively through deps.
**How to avoid:** Keep OrganizationMember import inside the function body, matching the existing deferred import pattern already used for Campaign and CampaignMember.
**Warning signs:** ImportError on startup.

### Pitfall 4: Migration Revision Chain
**What goes wrong:** Alembic autogenerate creates the wrong down_revision if another migration is added concurrently.
**Why it happens:** Latest migration is 014_backfill_members. The new migration must be 015_organization_members with down_revision = "014_backfill_members".
**How to avoid:** Manually set revision and down_revision rather than using autogenerate.
**Warning signs:** Alembic "multiple heads" error.

### Pitfall 5: Org Endpoints Returning Cross-Campaign Data Without RLS
**What goes wrong:** Org endpoints (D-13) use regular get_db() without RLS. If the service queries accidentally join campaign-scoped tables without org_id filtering, they could leak data from other orgs.
**Why it happens:** No RLS safety net on these endpoints.
**How to avoid:** Every query in OrgService MUST filter by organization_id explicitly. Code review must verify no unscoped joins.
**Warning signs:** Org endpoint returns data from campaigns not belonging to the user's org.

## Code Examples

### Existing Pattern: CampaignMember (to replicate for OrganizationMember)
```python
# From app/models/campaign_member.py -- the pattern to follow
class CampaignMember(Base):
    __tablename__ = "campaign_members"
    __table_args__ = (
        UniqueConstraint("user_id", "campaign_id", name="uq_user_campaign"),
        CheckConstraint(
            "role IS NULL OR role IN "
            "('viewer', 'volunteer', 'manager', 'admin', 'owner')",
            name="ck_campaign_members_role_valid",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"), nullable=False)
    role: Mapped[str | None] = mapped_column(String(50), nullable=True)
```

### Existing Pattern: require_role() Factory (to replicate for require_org_role())
```python
# From app/core/security.py -- the factory pattern to follow
def require_role(minimum: str):
    min_level = CampaignRole[minimum.upper()]

    async def _check_role(
        request: Request,
        current_user: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AuthenticatedUser:
        # ... role resolution logic ...
        if effective_role < min_level:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user.model_copy(update={"role": effective_role})

    return _check_role
```

### Existing Pattern: Data Migration (seed migration template)
```python
# From alembic/versions/014_backfill_campaign_members.py
def upgrade() -> None:
    op.execute("""
        INSERT INTO campaign_members (id, user_id, campaign_id, synced_at)
        SELECT gen_random_uuid(), ..., NOW()
        FROM ...
        ON CONFLICT (user_id, campaign_id) DO NOTHING
    """)
```

### Existing Pattern: API Router Registration
```python
# From app/api/v1/router.py -- add org router here
router.include_router(org.router, prefix="/org", tags=["org"])
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | pyproject.toml [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-01 | OrganizationMember table exists with correct schema | unit (model) | `uv run pytest tests/unit/test_org_model.py -x` | Wave 0 |
| ORG-02 | Seed migration promotes created_by to org_owner | unit (migration logic) | Manual verification via `docker compose exec api alembic upgrade head` | Wave 0 |
| ORG-03a | resolve_campaign_role returns org_admin->ADMIN equivalent | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | Exists (extend) |
| ORG-03b | Additive: max(campaign VIEWER, org ADMIN) = ADMIN | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | Exists (extend) |
| ORG-03c | Additive: max(campaign OWNER, org ADMIN) = OWNER | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | Exists (extend) |
| ORG-03d | No CampaignMember + org_admin = ADMIN on any campaign in org | unit | `uv run pytest tests/unit/test_resolve_campaign_role.py -x` | Exists (extend) |
| ORG-04a | require_org_role denies user with no org membership (403) | unit | `uv run pytest tests/unit/test_org_auth.py -x` | Wave 0 |
| ORG-04b | require_org_role allows org_owner | unit | `uv run pytest tests/unit/test_org_auth.py -x` | Wave 0 |
| ORG-04c | require_org_role denies org_admin when org_owner required | unit | `uv run pytest tests/unit/test_org_auth.py -x` | Wave 0 |
| ORG-04d | GET /api/v1/org returns org details for org member | unit | `uv run pytest tests/unit/test_org_api.py -x` | Wave 0 |
| ORG-04e | GET /api/v1/org returns 403 for non-org-member | unit | `uv run pytest tests/unit/test_org_api.py -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_org_auth.py` -- covers ORG-04 (require_org_role tests)
- [ ] `tests/unit/test_org_api.py` -- covers ORG-04 (org endpoint tests)
- [ ] Extend `tests/unit/test_resolve_campaign_role.py` -- covers ORG-03 (org role additive resolution)

## Open Questions

1. **NULL CampaignMember.role handling after JWT fallback removal**
   - What we know: Current resolve_campaign_role() falls back to JWT role for same-org users. D-07 drops this. Many existing CampaignMember records have NULL role.
   - What's unclear: Whether NULL role should be treated as VIEWER or as "no explicit grant" (relying on org role only).
   - Recommendation: Treat NULL CampaignMember.role as CampaignRole.VIEWER for backward compatibility. This matches the current behavior where `member.role or "viewer"` is used in the members endpoint. The alternative (treating NULL as no-grant) would break users who have CampaignMember records but no explicit role.

2. **AuthenticatedUser model extension for org context**
   - What we know: AuthenticatedUser currently has `role: CampaignRole`. Org endpoints need org context.
   - What's unclear: Whether to add org_role field to AuthenticatedUser or keep it in a separate return from require_org_role().
   - Recommendation: Keep AuthenticatedUser unchanged for now. require_org_role() returns the existing AuthenticatedUser (org_id is already present). If downstream code needs the org role, it can query OrganizationMember. Adding org_role to AuthenticatedUser would require changes to get_current_user() which adds complexity for Phase 41's minimal scope.

## Sources

### Primary (HIGH confidence)
- `app/core/security.py` -- Current resolve_campaign_role(), require_role(), CampaignRole, AuthenticatedUser
- `app/models/campaign_member.py` -- CampaignMember model pattern
- `app/models/organization.py` -- Organization model (existing, no changes needed)
- `app/api/deps.py` -- get_campaign_db(), ensure_user_synced()
- `app/api/v1/router.py` -- Router registration pattern
- `app/api/v1/members.py` -- Members endpoint pattern for org members
- `app/api/v1/campaigns.py` -- Campaign list endpoint pattern
- `alembic/versions/014_backfill_campaign_members.py` -- Data migration pattern
- `app/schemas/member.py` -- Schema pattern (BaseSchema, field validators)
- `tests/unit/test_resolve_campaign_role.py` -- Existing role resolution test pattern
- `tests/conftest.py` -- JWT test fixture pattern (make_jwt, build_jwks)

### Secondary (MEDIUM confidence)
- Phase 41 CONTEXT.md -- All implementation decisions D-01 through D-17

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- all patterns directly observable in existing codebase
- Pitfalls: HIGH -- identified from reading actual code, especially the JWT fallback removal impact

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- internal codebase patterns, no external dependency changes)
