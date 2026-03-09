# Phase 1: Authentication and Multi-Tenancy - Research

**Researched:** 2026-03-09
**Domain:** ZITADEL OIDC authentication, PostgreSQL RLS multi-tenancy, FastAPI RBAC
**Confidence:** MEDIUM-HIGH

## Summary

This phase implements the foundational authentication and multi-tenancy layer for the CivicPulse Run API. The core challenge is integrating ZITADEL as an external OIDC provider where each campaign maps to a ZITADEL organization, with PostgreSQL Row-Level Security enforcing data isolation at the database level. The five-role hierarchy (owner > admin > manager > volunteer > viewer) is stored as ZITADEL project roles and enforced via FastAPI dependencies.

The ZITADEL integration requires two distinct interaction modes: (1) JWT validation for incoming requests using Authlib's JOSE library with JWKS fetching, and (2) server-to-server Management API calls for provisioning organizations, assigning roles, and managing invitations. The Python `zitadel-client` library is incubating and may have gaps; a direct HTTP client approach (httpx) calling ZITADEL's REST API is the safer path for production code.

**Primary recommendation:** Use Authlib for JWT/JWKS validation, httpx for ZITADEL Management API calls (not the incubating zitadel-client), `set_config()` for async-safe RLS session variables, and `fastapi-problem-details` for RFC 9457 error responses.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 1 ZITADEL organization = 1 campaign (native tenant isolation at auth layer)
- Campaign creation auto-provisions ZITADEL org via Management API (no manual setup)
- Dedicated ZITADEL service account (machine user) with IAM-level privileges for admin operations (org creation, role grants, invitations)
- Campaign tenant derived from JWT org claim -- the org_id in the token maps to a campaign
- Platform-level superadmin via ZITADEL IAM roles (not per-org)
- Fail-fast on ZITADEL outage -- return 503 with clear error, roll back local DB transaction
- Compensating transaction for campaign creation: create ZITADEL org first, then local record; if local fails, delete the ZITADEL org
- Campaign deletion = soft-delete local record + deactivate ZITADEL org (not destroy)
- Local campaigns table with domain fields alongside zitadel_org_id foreign key
- Campaign fields: id (UUID), zitadel_org_id, name, type (enum), jurisdiction_fips, jurisdiction_name, election_date, status, candidate_name, party_affiliation (optional), created_at, updated_at
- Campaign types enum: federal, state, local, ballot
- Status lifecycle: active, suspended, archived, soft-deleted
- RLS enforced via PostgreSQL session variable: middleware sets `SET app.current_campaign_id` on each request's DB session
- RLS policies reference `current_setting('app.current_campaign_id')::uuid`
- All tenant-scoped tables have campaign_id column with RLS policy
- Users table is also RLS-protected via campaign_members join table
- Five roles in strict hierarchy: viewer < volunteer < manager < admin < owner
- Roles stored as ZITADEL project roles within each org -- JWT claims include the user's role
- Role enforcement via FastAPI `Depends(require_role("manager"))` on route definitions
- Single owner per campaign (ownership transferable but not shared)
- Only owner can manage admin-level roles; admins can invite/remove users at manager level and below
- API generates single-use invite links tied to a specific email address (7-day expiry)
- ZITADEL sends invite emails using its built-in notification templates
- Local users table with ZITADEL subject UUID as primary key
- campaign_members join table for RLS filtering: user_id + campaign_id + synced_at (no role column -- role comes from JWT)
- JWKS-based validation with in-memory caching; refresh JWKS on unknown key ID
- Auth library: Authlib (not fastapi-zitadel-auth)
- URL versioning: /api/v1/ prefix for all business endpoints
- Error format: RFC 9457 Problem Details (application/problem+json)
- Pagination: cursor-based with limit
- Response format: single resources returned directly, lists wrapped in {items, pagination}

### Claude's Discretion
- ZITADEL JWKS cache TTL and refresh strategy details
- Exact invite token format and storage mechanism
- Database migration ordering within Alembic
- Logging verbosity and structured log field choices
- Exact compensating transaction error handling edge cases

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can authenticate via ZITADEL OpenID Connect and receive a JWT | Authlib JWT/JWKS validation pattern, ZITADEL OIDC claims structure |
| AUTH-02 | Campaign admin can create a campaign with name, type, jurisdiction, and election date | ZITADEL Management API org creation, compensating transaction pattern |
| AUTH-03 | Campaign admin can update and delete campaigns they own | Campaign model with soft-delete, ZITADEL org deactivation API |
| AUTH-04 | Campaign data is isolated via PostgreSQL Row-Level Security on campaign_id | RLS policy SQL, `set_config()` async pattern, database role separation |
| AUTH-05 | Campaign admin can assign roles to users within a campaign | ZITADEL project role assignment API, role hierarchy enforcement |
| AUTH-06 | API endpoints enforce role-based permissions per campaign context | FastAPI dependency injection pattern for role checking |
| AUTH-07 | Campaign admin can invite users to a campaign with a specific role via invite link | ZITADEL CreateInviteCode API, invite token storage, acceptance flow |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.135.1 | API framework | Already in pyproject.toml |
| SQLAlchemy | >=2.0.48 | Async ORM with mapped_column | Already in pyproject.toml |
| asyncpg | >=0.31.0 | PostgreSQL async driver | Already in pyproject.toml |
| Alembic | >=1.18.4 | Database migrations | Already in pyproject.toml |
| Pydantic | >=2.12.5 | Schema validation | Already in pyproject.toml |
| pydantic-settings | >=2.13.1 | Settings from env | Already in pyproject.toml |
| Authlib | ~=1.6 | JWT/JWKS validation, OIDC | CONTEXT.md locked decision; mature JOSE implementation |
| httpx | >=0.27 | Async HTTP client for ZITADEL API | Standard async HTTP client; needed for Management API calls |
| fastapi-problem-details | >=0.1.4 | RFC 9457 error responses | Auto-formats HTTPException and validation errors to Problem Details |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| loguru | >=0.7.3 | Structured logging | Already in pyproject.toml |
| uvicorn | >=0.41.0 | ASGI server | Already in pyproject.toml |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| httpx for ZITADEL API | zitadel-client (PyPI) | zitadel-client is incubating, API may break; httpx is stable and gives full control |
| Authlib | fastapi-zitadel-auth | Explicitly rejected in CONTEXT.md; Authlib is more mature |
| fastapi-problem-details | Manual exception handlers | Library handles all edge cases (validation errors, unhandled exceptions); less custom code |

**Installation:**
```bash
uv add authlib httpx fastapi-problem-details
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── api/
│   ├── __init__.py
│   ├── v1/
│   │   ├── __init__.py
│   │   ├── router.py           # Aggregates all v1 routers
│   │   ├── campaigns.py        # Campaign CRUD endpoints
│   │   ├── invites.py          # Invite management endpoints
│   │   ├── members.py          # Campaign membership endpoints
│   │   └── users.py            # /me endpoints
│   └── health.py               # Public health check
├── core/
│   ├── __init__.py
│   ├── config.py               # Settings via pydantic-settings
│   ├── security.py             # JWT validation, JWKS fetching
│   └── errors.py               # Problem Details setup, custom exceptions
├── db/
│   ├── __init__.py
│   ├── session.py              # Async engine, session factory, RLS middleware
│   ├── base.py                 # DeclarativeBase
│   └── rls.py                  # RLS helper: set_config() execution
├── models/
│   ├── __init__.py
│   ├── campaign.py             # Campaign SQLAlchemy model
│   ├── user.py                 # User model (ZITADEL sub as PK)
│   └── campaign_member.py      # campaign_members join table
├── schemas/
│   ├── __init__.py
│   ├── campaign.py             # CampaignCreate, CampaignUpdate, CampaignResponse
│   ├── user.py                 # UserResponse
│   ├── invite.py               # InviteCreate, InviteResponse
│   └── common.py               # PaginatedResponse, CursorParams
├── services/
│   ├── __init__.py
│   ├── campaign.py             # Campaign business logic + compensating transactions
│   ├── zitadel.py              # ZITADEL Management API client (httpx)
│   └── invite.py               # Invite token generation and management
└── main.py                     # FastAPI app factory
```

### Pattern 1: JWT Validation with Authlib JWKS

**What:** Validate incoming JWTs against ZITADEL's JWKS endpoint with caching and automatic key rotation handling.
**When to use:** Every authenticated request.

```python
# app/core/security.py
from authlib.jose import jwt, JsonWebKey
import httpx

class JWKSManager:
    """Manages JWKS fetching with caching and rotation support."""

    def __init__(self, issuer: str):
        self.issuer = issuer
        self.jwks_uri = f"{issuer}/.well-known/openid-configuration"
        self._jwks: dict | None = None

    async def get_jwks(self, force_refresh: bool = False) -> dict:
        """Fetch JWKS, using cache unless force_refresh."""
        if self._jwks is None or force_refresh:
            async with httpx.AsyncClient() as client:
                # Fetch OIDC config to get jwks_uri
                oidc_config = (await client.get(self.jwks_uri)).json()
                jwks_response = await client.get(oidc_config["jwks_uri"])
                self._jwks = jwks_response.json()
        return self._jwks

    async def validate_token(self, token: str) -> dict:
        """Validate JWT, refreshing JWKS on unknown kid."""
        jwks = await self.get_jwks()
        try:
            claims = jwt.decode(token, JsonWebKey.import_key_set(jwks))
        except Exception:
            # Unknown kid -- try refreshing JWKS (key rotation)
            jwks = await self.get_jwks(force_refresh=True)
            claims = jwt.decode(token, JsonWebKey.import_key_set(jwks))
        claims.validate()
        return dict(claims)
```

**Discretion note (JWKS cache TTL):** Recommend a simple approach -- cache indefinitely until a decode failure triggers refresh. No TTL timer needed because ZITADEL key rotation is infrequent and the unknown-kid retry handles it automatically. This avoids background refresh complexity.

### Pattern 2: RLS Session Variable with Async SQLAlchemy

**What:** Set PostgreSQL session variable for RLS on each request using `set_config()` (not `SET` statement).
**When to use:** Every authenticated, campaign-scoped request.

**Critical finding:** With asyncpg, you CANNOT use `SET app.current_campaign_id = $1` because asyncpg uses server-prepared statements and PostgreSQL does not accept bound parameters in SET commands. Use `set_config()` instead.

```python
# app/db/rls.py
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

async def set_campaign_context(session: AsyncSession, campaign_id: str) -> None:
    """Set RLS campaign context for current transaction.

    Uses set_config() instead of SET because asyncpg uses server-side
    prepared statements which don't support bound parameters in SET.
    The third parameter (false) scopes to the current session.
    """
    await session.execute(
        text("SELECT set_config('app.current_campaign_id', :campaign_id, false)"),
        {"campaign_id": str(campaign_id)},
    )
```

### Pattern 3: Role-Based Access Control via FastAPI Dependencies

**What:** Extract role from JWT claims and enforce minimum role level.
**When to use:** On every protected endpoint.

```python
# app/core/security.py
from enum import IntEnum
from fastapi import Depends, HTTPException, status

class CampaignRole(IntEnum):
    """Role hierarchy -- higher value = more permissions."""
    VIEWER = 0
    VOLUNTEER = 1
    MANAGER = 2
    ADMIN = 3
    OWNER = 4

def require_role(minimum: str):
    """FastAPI dependency that enforces minimum role level."""
    min_level = CampaignRole[minimum.upper()]

    async def _check_role(current_user: AuthenticatedUser = Depends(get_current_user)):
        if current_user.role < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check_role
```

### Pattern 4: Compensating Transaction for Campaign Creation

**What:** Create ZITADEL org first, then local DB record. If DB fails, delete ZITADEL org.
**When to use:** Campaign creation endpoint.

```python
# app/services/campaign.py
async def create_campaign(
    db: AsyncSession,
    data: CampaignCreate,
    user: AuthenticatedUser,
    zitadel: ZitadelService,
) -> Campaign:
    """Create campaign with compensating transaction.

    Order: ZITADEL org first, then local record.
    If local fails, delete the ZITADEL org.
    """
    # Step 1: Create ZITADEL org
    org = await zitadel.create_organization(data.name)
    try:
        # Step 2: Create local record
        campaign = Campaign(
            name=data.name,
            zitadel_org_id=org.id,
            type=data.type,
            # ... other fields
        )
        db.add(campaign)
        await db.commit()
        return campaign
    except Exception:
        # Compensate: delete the ZITADEL org
        await zitadel.delete_organization(org.id)
        raise
```

### Pattern 5: RFC 9457 Problem Details Error Responses

**What:** Automatic formatting of all errors as RFC 9457 Problem Details.
**When to use:** App initialization.

```python
# app/main.py
from fastapi import FastAPI
import fastapi_problem_details as problem

def create_app() -> FastAPI:
    app = FastAPI(title="CivicPulse Run API")
    problem.init_app(app)
    # ... register routers, middleware
    return app
```

### Anti-Patterns to Avoid
- **Using SET with asyncpg:** asyncpg uses server-prepared statements; SET does not accept bound parameters. Always use `set_config()`.
- **Storing roles in local DB:** Roles are authoritative in ZITADEL JWT claims only. The campaign_members table has no role column -- it exists purely for RLS join filtering.
- **Using superuser DB connection for app queries:** RLS is bypassed by superusers. The application must connect as a restricted database user.
- **Caching JWT claims beyond token lifetime:** Always validate token expiry on each request. Cache JWKS keys, not decoded tokens.
- **Using zitadel-client in production:** The library is incubating with potential breaking changes. Use httpx with direct REST API calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT validation | Custom JWT parser | Authlib `jwt.decode()` with `JsonWebKey` | Algorithm confusion attacks, kid matching, claim validation edge cases |
| JWKS key rotation | Manual key management | Authlib JWKS + retry-on-unknown-kid | Key rotation is infrequent but must be seamless |
| RFC 9457 errors | Custom exception handlers | `fastapi-problem-details` | Handles validation errors, HTTPException, unhandled exceptions uniformly |
| Password hashing | Any password logic | ZITADEL handles all credential management | Auth is fully externalized |
| Session management | Cookie/session system | ZITADEL OIDC tokens + standard refresh_token flow | Stateless JWT, client handles refresh |

**Key insight:** Authentication is fully externalized to ZITADEL. The API never touches passwords, sessions, or credential storage. The only auth-related code is JWT validation and ZITADEL API calls.

## Common Pitfalls

### Pitfall 1: asyncpg SET Statement Failure
**What goes wrong:** `SET app.current_campaign_id = $1` fails with syntax error because asyncpg uses server-prepared statements.
**Why it happens:** asyncpg sends parameters server-side; PostgreSQL SET does not accept parameterized values.
**How to avoid:** Always use `SELECT set_config('app.current_campaign_id', :val, false)` instead.
**Warning signs:** `syntax error at or near "$1"` in logs.

### Pitfall 2: RLS Bypassed by Superuser Connection
**What goes wrong:** All data visible regardless of campaign context.
**Why it happens:** PostgreSQL superusers and table owners bypass RLS by default.
**How to avoid:** Create a dedicated `app_user` database role with `NOINHERIT`. Run `ALTER TABLE ... FORCE ROW LEVEL SECURITY` if the table owner must also be subject to policies. Application connects exclusively as `app_user`.
**Warning signs:** Cross-tenant data leaking in integration tests.

### Pitfall 3: Missing RLS Default-Deny
**What goes wrong:** No policy on a table means no rows visible (default deny), causing silent empty results.
**Why it happens:** RLS is enabled but no policy is created, or policy is created with wrong column name.
**How to avoid:** Always pair `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with `CREATE POLICY`. Test both data-present and data-absent scenarios.
**Warning signs:** Queries returning empty when data exists.

### Pitfall 4: ZITADEL Scope for Management API
**What goes wrong:** `"No matching permissions found (AUTH-5mWD2)"` error when calling Management API.
**Why it happens:** The service account token is missing the `urn:zitadel:iam:org:project:id:zitadel:aud` scope.
**How to avoid:** Always include this scope when requesting tokens for the service account. The service account also needs IAM_OWNER role at the instance level.
**Warning signs:** 403 or permission errors on Management API calls.

### Pitfall 5: ZITADEL Role Claims Not in Token
**What goes wrong:** JWT has no role information; role checking always fails.
**Why it happens:** Project settings "Assert Roles on Authentication" or application settings "User Roles Inside ID Token" are not enabled.
**How to avoid:** Enable both settings in the ZITADEL project and application configuration. Also request the scope `urn:zitadel:iam:org:project:id:{projectId}:aud`.
**Warning signs:** Role claims absent from decoded JWT; all users appear to have no role.

### Pitfall 6: Campaign Context Not Set for Unauthenticated RLS Queries
**What goes wrong:** Database queries fail or return empty when `app.current_campaign_id` is not set.
**Why it happens:** Public endpoints or background tasks don't set the session variable.
**How to avoid:** Ensure the RLS variable has a safe default or that non-campaign-scoped queries bypass RLS by using the admin database connection.
**Warning signs:** Errors like `unrecognized configuration parameter "app.current_campaign_id"`.

## Code Examples

### ZITADEL JWT Claims Structure
ZITADEL JWT tokens include these relevant claims:

```json
{
  "sub": "user-uuid-here",
  "iss": "https://auth.civpulse.org",
  "aud": ["project-id", "client-id"],
  "exp": 1710000000,
  "iat": 1709996400,
  "urn:zitadel:iam:user:resourceowner:id": "org-id-here",
  "urn:zitadel:iam:user:resourceowner:name": "Campaign Name",
  "urn:zitadel:iam:org:project:223281986649719041:roles": {
    "admin": {
      "org-id-here": "campaign.auth.civpulse.org"
    }
  }
}
```

Key mappings:
- `sub` = user ID (maps to local users.id)
- `urn:zitadel:iam:user:resourceowner:id` = org ID (maps to campaigns.zitadel_org_id)
- `urn:zitadel:iam:org:project:{projectId}:roles` = role object (extract role key)

### RLS Policy SQL (for Alembic Migration)

```sql
-- Enable RLS on campaigns table
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Campaign isolation policy
CREATE POLICY campaign_isolation ON campaigns
    USING (id = current_setting('app.current_campaign_id')::uuid);

-- For tenant-scoped tables (e.g., future voters, turfs)
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_member_isolation ON campaign_members
    USING (campaign_id = current_setting('app.current_campaign_id')::uuid);
```

### Database User Setup (for Alembic or Init Script)

```sql
-- Create application user that is subject to RLS
CREATE ROLE app_user WITH LOGIN PASSWORD 'xxx' NOINHERIT;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO app_user;

-- Grant table permissions (run after migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

### ZITADEL Management API Client (httpx)

```python
# app/services/zitadel.py
import httpx
from app.core.config import settings

class ZitadelService:
    """Client for ZITADEL Management API operations."""

    def __init__(self):
        self.base_url = settings.zitadel_issuer
        self._token: str | None = None

    async def _get_token(self) -> str:
        """Get service account access token via client credentials."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/oauth/v2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": settings.zitadel_service_client_id,
                    "client_secret": settings.zitadel_service_client_secret,
                    "scope": "openid urn:zitadel:iam:org:project:id:zitadel:aud",
                },
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            return self._token

    async def create_organization(self, name: str) -> dict:
        """Create a new ZITADEL organization.

        Uses Management API v1 (POST /management/v1/orgs).
        """
        token = await self._get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/management/v1/orgs",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"name": name},
            )
            resp.raise_for_status()
            return resp.json()
```

### FastAPI Dependency Chain

```python
# app/core/security.py
from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer_scheme = HTTPBearer()

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> AuthenticatedUser:
    """Extract and validate JWT, return authenticated user context."""
    token = credentials.credentials
    claims = await request.app.state.jwks_manager.validate_token(token)

    return AuthenticatedUser(
        id=claims["sub"],
        org_id=claims.get("urn:zitadel:iam:user:resourceowner:id"),
        role=_extract_role(claims),
        email=claims.get("email"),
        display_name=claims.get("name"),
    )
```

### Invite Token Storage

**Discretion recommendation:** Store invite tokens in a local `invites` table with columns: `id (UUID)`, `campaign_id`, `email`, `role`, `token (UUID v4)`, `expires_at`, `accepted_at`, `revoked_at`, `created_by`, `created_at`. The token is a random UUID included in the invite URL. On acceptance, the API verifies the token, creates/updates the user and campaign_member records, and assigns the ZITADEL project role. ZITADEL's own CreateInviteCode API handles the credential setup (password/passkey) for new users.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ZITADEL Management API v1 (AddOrg) | Organization Service v2beta | 2024-2025 | v1 still works but deprecated; v2beta for new features |
| `SET app.var = value` with psycopg2 | `SELECT set_config(...)` with asyncpg | Always for async | SET cannot take bound parameters with server-prepared statements |
| Authlib < 1.0 JOSE API | Authlib 1.6.x `jwt.decode()` + `JsonWebKey` | 2023 | Stable API for JWT validation |
| Manual error formatting | fastapi-problem-details | 2024 | Single `init_app()` call handles all error formatting |
| ZITADEL flat role claims | Both flat and nested supported | 2024 | Nested is default; flat available via settings |

**Note on ZITADEL API versions:** The Management API v1 (`/management/v1/orgs`) is deprecated but still functional. The v2beta Organization Service is the recommended replacement but may have less community documentation. Recommendation: start with v1 for org creation (well-documented, stable) and migrate to v2 when it reaches GA. The v2beta endpoint path is `/v2beta/organizations` but documentation is sparse.

## Open Questions

1. **ZITADEL v2beta vs v1 for org creation**
   - What we know: v1 is deprecated but works; v2beta is recommended but incubating
   - What's unclear: Whether the Python zitadel-client supports v2beta org creation
   - Recommendation: Use v1 via httpx for now; add a `ZitadelService` abstraction so the underlying API version can be swapped later

2. **ZITADEL project ID for role claims**
   - What we know: Role claims use `urn:zitadel:iam:org:project:{projectId}:roles` -- the project ID must be known
   - What's unclear: Whether a single ZITADEL project spans all orgs or each org gets its own project
   - Recommendation: Create one ZITADEL project at the instance level; all campaign orgs share it. Store the project ID in settings.

3. **RLS and `app.current_campaign_id` default**
   - What we know: If `app.current_campaign_id` is not set, `current_setting()` raises an error
   - What's unclear: Best handling for system-level queries that need to bypass RLS
   - Recommendation: Use `current_setting('app.current_campaign_id', true)` (the second parameter returns NULL on missing) in RLS policies. For admin operations, use a separate connection as the migrations/admin user.

4. **Service account token caching**
   - What we know: The service account needs to authenticate to ZITADEL for Management API calls
   - What's unclear: Token lifetime and optimal refresh strategy
   - Recommendation: Cache the token, refresh when expired or on 401 response. Use a simple "fetch on first use, refresh on expiry" pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | none -- see Wave 0 |
| Quick run command | `pytest tests/ -x -q --timeout=30` |
| Full suite command | `pytest tests/ -v --timeout=60` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | JWT validation accepts valid ZITADEL token, rejects invalid/expired | unit | `pytest tests/unit/test_security.py -x` | No -- Wave 0 |
| AUTH-02 | Campaign creation provisions ZITADEL org + local record | unit + integration | `pytest tests/unit/test_campaign_service.py -x` | No -- Wave 0 |
| AUTH-03 | Campaign update/delete restricted to owner; soft-delete deactivates ZITADEL org | unit | `pytest tests/unit/test_campaign_service.py -x` | No -- Wave 0 |
| AUTH-04 | RLS prevents cross-campaign data access | integration | `pytest tests/integration/test_rls.py -x` | No -- Wave 0 |
| AUTH-05 | Role assignment via ZITADEL API; role hierarchy enforced | unit | `pytest tests/unit/test_roles.py -x` | No -- Wave 0 |
| AUTH-06 | Endpoints enforce minimum role level | unit | `pytest tests/unit/test_api_campaigns.py -x` | No -- Wave 0 |
| AUTH-07 | Invite creation, token validation, acceptance flow | unit + integration | `pytest tests/unit/test_invites.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/ -x -q --timeout=30`
- **Per wave merge:** `pytest tests/ -v --timeout=60`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `pytest.ini` or `pyproject.toml [tool.pytest.ini_options]` -- pytest configuration
- [ ] `conftest.py` -- shared fixtures (mock JWT, test DB session, test client)
- [ ] `tests/unit/` directory structure
- [ ] `tests/integration/` directory structure
- [ ] pytest, pytest-asyncio, httpx (test client) as dev dependencies
- [ ] Docker Compose for test PostgreSQL

## Sources

### Primary (HIGH confidence)
- [Authlib JOSE JWT documentation](https://docs.authlib.org/en/latest/jose/jwt.html) - JWT decode, JWKS validation patterns
- [Authlib JWK documentation](https://docs.authlib.org/en/latest/jose/jwk.html) - JsonWebKey.import_key_set usage
- [PostgreSQL RLS documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) - Policy syntax, FORCE ROW LEVEL SECURITY, default deny behavior
- [SQLAlchemy asyncpg SET discussion](https://github.com/sqlalchemy/sqlalchemy/discussions/7673) - set_config() requirement for asyncpg

### Secondary (MEDIUM confidence)
- [ZITADEL Claims documentation](https://zitadel.com/docs/apis/openidoauth/claims) - JWT claim structure, org/role claims
- [ZITADEL Retrieve User Roles guide](https://zitadel.com/docs/guides/integrate/retrieve-user-roles) - Role claim JSON structure, scopes needed
- [ZITADEL Management API](https://zitadel.com/docs/apis/resources/mgmt) - API reference for org management
- [ZITADEL Python client](https://zitadel.com/docs/sdk-examples/client-libraries/python) - Client library status (incubating)
- [ZITADEL Organization creation discussion](https://github.com/zitadel/zitadel/discussions/8450) - Service account IAM_OWNER requirement
- [Tenant Isolation with PG RLS and SQLAlchemy](https://personal-web-9c834.web.app/blog/pg-tenant-isolation/) - Event listener and set_config patterns
- [fastapi-problem-details (PyPI)](https://pypi.org/project/fastapi-problem-details/) - RFC 9457 integration
- [ZITADEL User Onboarding guide](https://zitadel.com/docs/guides/integrate/onboarding/end-users) - Invite flow, CreateInviteCode

### Tertiary (LOW confidence)
- [ZITADEL v2beta Organization Service](https://zitadel.com/docs/apis/resources/org_service_v2beta/organization-service-create-organization) - v2beta endpoint details (documentation returned 404, sparse)
- [zitadel-client PyPI package](https://pypi.org/project/zitadel-client/) - Exact current version unknown, library is incubating

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All core libraries are declared in pyproject.toml; Authlib is mature and well-documented
- Architecture: MEDIUM-HIGH - RLS + SQLAlchemy async pattern is well-documented; ZITADEL org-per-campaign mapping needs prototype validation (flagged in STATE.md)
- Pitfalls: HIGH - asyncpg SET limitation is well-documented; RLS superuser bypass is fundamental PostgreSQL behavior
- ZITADEL integration: MEDIUM - JWT claims structure verified via docs; Management API v1 is clear; v2beta and Python client are less certain

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days -- stack is stable; ZITADEL v2 API may evolve)
