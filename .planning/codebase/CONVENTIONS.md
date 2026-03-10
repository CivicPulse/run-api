# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- Use `snake_case.py` for all Python modules
- Model files are singular nouns: `campaign.py`, `voter.py`, `user.py`
- Service files match their domain: `campaign.py`, `voter.py`, `invite.py`
- Schema files match their domain: `campaign.py`, `voter.py`, `invite.py`
- API route files use plural nouns: `campaigns.py`, `voters.py`, `invites.py`
- Test files use `test_` prefix: `test_campaign_service.py`, `test_api_campaigns.py`

**Functions:**
- Use `snake_case` for all functions and methods
- Async functions use `async def`
- Private/internal functions use leading underscore: `_extract_role()`, `_validate_status_transition()`
- FastAPI dependency factories return callables: `require_role("admin")` returns a dependency
- Helper functions at module level prefixed with underscore: `_make_user()`, `_mock_result_with()`

**Variables:**
- Use `snake_case` for all variables
- Module-level constants use `UPPER_SNAKE_CASE`: `CAMPAIGN_ID`, `ORG_ID`, `TEST_KID`
- Private module-level state uses leading underscore: `_service = CampaignService()`

**Types/Classes:**
- Use `PascalCase` for all classes
- SQLAlchemy models are singular: `Campaign`, `Voter`, `User`
- Pydantic schemas use suffix pattern: `CampaignCreate`, `CampaignUpdate`, `CampaignResponse`
- Service classes use `Service` suffix: `CampaignService`, `VoterService`, `ZitadelService`
- Enums use `PascalCase` with `StrEnum` or `IntEnum`: `CampaignType`, `CampaignRole`
- Custom exceptions use `Error` suffix: `CampaignNotFoundError`, `VoterNotFoundError`

## Code Style

**Formatting:**
- Tool: Ruff (configured in `pyproject.toml`)
- Line length: 88 characters
- Target Python version: 3.13
- Config location: `pyproject.toml` `[tool.ruff]` section

**Linting:**
- Tool: Ruff
- Selected rule sets: E (pycodestyle), F (pyflakes), I (isort), N (pep8-naming), UP (pyupgrade), B (bugbear), SIM (simplify), ASYNC
- Ignored rules: `B008` (Depends() in default args is standard FastAPI pattern)
- Noqa comments used sparingly for intentional violations: `# noqa: ARG001`, `# noqa: E402, F401`

**Python Version Features:**
- Use `from __future__ import annotations` in every module (PEP 604 style unions)
- Use `str | None` instead of `Optional[str]`
- Use `list[str]` instead of `List[str]`
- Use generic syntax for Pydantic: `PaginatedResponse[T]` with PEP 695 style
- Use `datetime.now(UTC)` not `datetime.utcnow()`

## Import Organization

**Order:**
1. `from __future__ import annotations` (always first)
2. Standard library imports
3. Third-party imports (fastapi, sqlalchemy, pydantic, loguru, httpx)
4. Local application imports (`from app.core...`, `from app.models...`)

**Path Aliases:**
- No path aliases configured. Use full dotted paths: `from app.core.security import AuthenticatedUser`
- First-party package configured in isort: `known-first-party = ["app"]`

**Conditional Imports:**
- Use `TYPE_CHECKING` guard for imports only needed by type annotations:
```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.security import AuthenticatedUser
    from app.services.zitadel import ZitadelService
```

**Deferred Imports:**
- Use inline imports to break circular dependencies:
```python
async def get_campaign_from_token(...):
    from app.core.errors import CampaignNotFoundError  # deferred
```

## Error Handling

**Domain Exceptions:**
- Define custom exception classes in `app/core/errors.py`
- Each exception stores relevant IDs as attributes: `self.campaign_id`, `self.voter_id`
- Naming pattern: `{Entity}NotFoundError`, `InsufficientPermissionsError`, `ZitadelUnavailableError`

**Problem Details (RFC 9457):**
- Use `fastapi-problem-details` package for error responses
- Initialize via `init_error_handlers(app)` in `app/core/errors.py`
- Each exception maps to a handler returning `problem.ProblemResponse`:
```python
@app.exception_handler(CampaignNotFoundError)
async def campaign_not_found_handler(request, exc):  # noqa: ARG001
    return problem.ProblemResponse(
        status=status.HTTP_404_NOT_FOUND,
        title="Campaign Not Found",
        detail=str(exc),
        type="campaign-not-found",
    )
```

**Service Layer Errors:**
- Services raise domain exceptions (`CampaignNotFoundError`, `InsufficientPermissionsError`)
- Services raise `ValueError` for entity-not-found when no custom exception exists yet
- API routes catch `ValueError` and re-raise as domain exceptions:
```python
try:
    voter = await _service.get_voter(db, voter_id)
except ValueError as exc:
    raise VoterNotFoundError(voter_id) from exc
```

**HTTP Errors:**
- Use `HTTPException` for auth failures (401, 403) in `app/core/security.py`
- Use domain exceptions + problem details for business logic errors (404, 422)

**Compensating Transactions:**
- When external service call succeeds but local DB fails, clean up the external resource:
```python
try:
    # local DB write
except Exception:
    await db.rollback()
    await zitadel.delete_organization(org_id)  # compensate
    raise
```

## Logging

**Framework:** Loguru (`from loguru import logger`)

**Patterns:**
- Use `logger.info()`, `logger.debug()`, `logger.warning()`, `logger.error()`
- Use Loguru's `{}` placeholder syntax, not f-strings or %s:
```python
logger.info("Created local user record for {}", user.id)
logger.warning("Local DB write failed for campaign '{}', cleaning up ZITADEL org {}", name, org_id)
```
- Note: `app/services/volunteer.py` uses `logging.getLogger(__name__)` instead of loguru -- this is inconsistent

## Comments

**When to Comment:**
- Module-level docstrings on every `.py` file explaining purpose
- Class-level docstrings on all classes
- Method-level docstrings on all public methods

**Docstring Style:**
- Google-style docstrings with `Args:`, `Returns:`, `Raises:` sections:
```python
async def get_campaign(self, db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
    """Get a campaign by ID.

    Args:
        db: Async database session.
        campaign_id: The campaign UUID.

    Returns:
        The Campaign object.

    Raises:
        CampaignNotFoundError: If campaign does not exist.
    """
```
- Every arg gets a brief description. Keep descriptions concise (one line).

**Inline Comments:**
- Used sparingly for non-obvious logic
- `# noqa:` comments for intentional lint suppressions

## Function Design

**Size:** Functions are kept focused on a single operation. Service methods typically 10-30 lines.

**Parameters:**
- Always use type annotations on all parameters and return types
- Use `uuid.UUID` for entity IDs, not strings
- Use Pydantic models for request data (not raw dicts)
- Use ellipsis (`...`) as sentinel for "not provided" on nullable update fields:
```python
async def update_campaign(self, db, campaign_id, jurisdiction_fips: str | None = ...):
    if jurisdiction_fips is not ...:
        campaign.jurisdiction_fips = jurisdiction_fips
```

**Return Values:**
- Return domain model objects from services, not dicts
- Convert to Pydantic response schemas at the API layer: `CampaignResponse.model_validate(campaign)`
- Return tuples for paginated results: `tuple[list[Campaign], PaginationResponse]`

## Module Design

**Exports:**
- `app/models/__init__.py` uses explicit `__all__` list with all model classes
- Other `__init__.py` files are empty (just mark packages)
- No barrel file pattern in services or schemas

**Singleton Pattern:**
- Services instantiated at module level in route files: `_service = CampaignService()`
- Services are stateless classes -- no instance state, just method grouping
- Shared state (settings, engines) lives in module-level singletons: `settings = Settings()`, `engine = create_async_engine(...)`

## API Route Patterns

**Dependency Injection:**
- Use FastAPI `Depends()` for auth, DB sessions, and role checks
- Override dependencies in tests via `app.dependency_overrides[get_current_user] = lambda: user`
- Role enforcement via `require_role("admin")` dependency factory
- DB session via `Depends(get_db)` or `Depends(get_db_with_rls)`

**Response Pattern:**
- Set `response_model` on route decorators
- Use `status_code=status.HTTP_201_CREATED` for creation endpoints
- Return `Response(status_code=status.HTTP_204_NO_CONTENT)` for deletes
- Always call `model_validate()` before returning: `CampaignResponse.model_validate(campaign)`

**URL Structure:**
- Version prefix: `/api/v1/`
- Resource-scoped routes: `/campaigns/{campaign_id}/voters/{voter_id}`
- Use POST for search endpoints: `POST /campaigns/{campaign_id}/voters/search`
- Use PATCH for partial updates (not PUT)

**RLS Context:**
- Campaign-scoped endpoints must set RLS context before querying:
```python
from app.db.rls import set_campaign_context
await set_campaign_context(db, str(campaign_id))
```

**User Sync:**
- Every authenticated endpoint calls `await ensure_user_synced(user, db)` early in the handler

## Pydantic Schema Patterns

**Base Class:**
- All schemas inherit from `BaseSchema` (defined in `app/schemas/common.py`)
- `BaseSchema` enables `from_attributes=True` for ORM model conversion

**Schema Naming:**
- `{Entity}Create` for POST request bodies
- `{Entity}Update` for PATCH request bodies (all fields optional)
- `{Entity}Response` for API responses

**Pagination:**
- Use `PaginatedResponse[T]` generic wrapper from `app/schemas/common.py`
- Cursor-based pagination with `next_cursor` and `has_more` fields
- Cursor format: `{created_at.isoformat()}|{id}`

## SQLAlchemy Model Patterns

**Base Class:**
- All models inherit from `Base` (defined in `app/db/base.py`)
- All models must be imported in `app/db/base.py` for Alembic detection

**Column Patterns:**
- Use `Mapped[type]` with `mapped_column()` (SQLAlchemy 2.0 style)
- UUID primary keys with `default=uuid.uuid4`
- Timestamps with `server_default=func.now()` and `onupdate=func.now()`
- Use `String(N)` for all string columns with explicit max length
- Use `Enum(..., native_enum=False)` for enum columns (stores as VARCHAR)

**Multi-tenancy:**
- Most tables have `campaign_id: Mapped[uuid.UUID]` as a foreign key
- RLS policies enforce tenant isolation at the database level

---

*Convention analysis: 2026-03-10*
