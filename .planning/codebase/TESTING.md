# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- pytest 9.0.2+
- Config: `pyproject.toml` `[tool.pytest.ini_options]` section

**Async Support:**
- pytest-asyncio 1.3.0+
- `asyncio_mode = "auto"` -- async tests detected automatically, no `@pytest.mark.asyncio` needed on most tests
- Some tests explicitly use `@pytest.mark.asyncio()` decorator (inconsistent but functional)

**HTTP Client:**
- httpx `AsyncClient` with `ASGITransport` for in-process API testing
- No external test server needed

**Run Commands:**
```bash
uv run pytest                           # Run all tests
uv run pytest tests/unit/               # Run unit tests only
uv run pytest tests/integration/        # Run integration tests only
uv run pytest -m integration            # Run tests marked as integration
uv run pytest -k "test_campaign"        # Run tests matching pattern
uv run pytest --tb=short                # Shorter tracebacks
```

## Test File Organization

**Location:**
- Separate `tests/` directory at project root (not co-located)
- `tests/unit/` for unit tests (no database)
- `tests/integration/` for tests requiring PostgreSQL

**Naming:**
- Test files: `test_{domain}.py` or `test_{domain}_{aspect}.py`
- Examples: `test_security.py`, `test_campaign_service.py`, `test_api_campaigns.py`
- Test functions: `test_{description}` with descriptive snake_case names

**Structure:**
```
tests/
├── __init__.py
├── conftest.py                         # Shared fixtures (JWT, test app, client)
├── unit/
│   ├── __init__.py
│   ├── conftest.py                     # Unit-specific fixtures (empty currently)
│   ├── test_security.py                # JWT validation, role extraction
│   ├── test_campaign_service.py        # Service layer with mocked DB
│   ├── test_api_campaigns.py           # API endpoints with dependency overrides
│   ├── test_invite_service.py
│   ├── test_api_invites.py
│   ├── test_api_members.py
│   ├── test_voter_search.py            # Query builder SQL inspection
│   ├── test_voter_contacts.py
│   ├── test_voter_interactions.py
│   ├── test_voter_lists.py
│   ├── test_voter_tags.py
│   ├── test_import_service.py
│   ├── test_field_mapping.py
│   ├── test_turfs.py
│   ├── test_walk_lists.py
│   ├── test_surveys.py
│   ├── test_canvassing.py
│   ├── test_call_lists.py
│   ├── test_dnc.py
│   ├── test_phone_bank.py
│   ├── test_volunteers.py
│   ├── test_shifts.py
│   ├── test_dashboard_canvassing.py
│   ├── test_dashboard_phone_banking.py
│   ├── test_dashboard_overview.py
│   ├── test_dashboard_volunteers.py
│   ├── test_model_coverage.py          # Regression: all models imported
│   └── test_lifespan.py               # App startup/shutdown
└── integration/
    ├── __init__.py
    ├── conftest.py                     # DB fixtures (superuser + app_user sessions)
    ├── test_rls.py                     # Core RLS isolation tests
    ├── test_voter_rls.py               # Voter-specific RLS
    ├── test_spatial.py                 # PostGIS spatial queries
    ├── test_canvassing_rls.py          # Canvassing RLS
    ├── test_phone_banking_rls.py       # Phone banking RLS
    └── test_volunteer_rls.py           # Volunteer RLS
```

## Test Structure

**Suite Organization:**
- Group related tests in classes (no `self` state, just namespace grouping)
- Class names describe the component under test: `TestCampaignService`, `TestJWTValidation`
- API test classes named after the endpoint: `TestCampaignCreate`, `TestCampaignList`

```python
class TestCampaignService:
    """Tests for campaign CRUD operations with compensating transactions."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    @pytest.fixture
    def mock_user(self):
        from app.core.security import AuthenticatedUser, CampaignRole
        return AuthenticatedUser(
            id="user-abc",
            org_id="zitadel-org-123",
            role=CampaignRole.OWNER,
        )

    async def test_create_campaign_creates_zitadel_org_then_local(
        self, mock_db, mock_zitadel, mock_user
    ):
        """create_campaign creates ZITADEL org, then local record."""
        service = CampaignService()
        result = await service.create_campaign(db=mock_db, ...)
        mock_zitadel.create_organization.assert_awaited_once_with("New Campaign")
        assert isinstance(result, Campaign)
```

**Patterns:**
- Fixtures defined at class level when specific to that test class
- Fixtures defined at module level (or conftest) when shared
- Each test method has a docstring describing the scenario
- Tests are async by default (`async def test_...`)

## Mocking

**Framework:** `unittest.mock` (stdlib) -- `AsyncMock`, `MagicMock`, `patch`

**Database Mock Pattern:**
```python
@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()           # Sync method
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db
```

**Query Result Mock Pattern:**
```python
def _mock_result_with(value, method="scalar_one_or_none"):
    """Create a MagicMock result with the given return on the given method."""
    result = MagicMock()
    getattr(result, method).return_value = value
    return result

# For list results:
list_result = MagicMock()
list_result.scalars.return_value.all.return_value = [campaign1, campaign2]
```

**Sequential Execute Mocking:**
- Use `side_effect` with a list for services that make multiple DB calls:
```python
sync_results = [
    _mock_result_with(local_user),   # 1st execute: user lookup
    _mock_result_with(campaign),     # 2nd execute: campaign lookup
    _mock_result_with(MagicMock()),  # 3rd execute: member lookup
]
mock_db.execute = AsyncMock(side_effect=sync_results)
```

**External Service Mock Pattern:**
```python
@pytest.fixture
def mock_zitadel():
    z = AsyncMock()
    z.create_organization = AsyncMock(return_value={"id": "zitadel-org-123"})
    z.deactivate_organization = AsyncMock()
    z.delete_organization = AsyncMock()
    return z
```

**HTTP Client Mock Pattern (for ZitadelService):**
```python
mock_client = AsyncMock()
mock_client.post = AsyncMock(return_value=mock_response)
mock_client.__aenter__ = AsyncMock(return_value=mock_client)
mock_client.__aexit__ = AsyncMock(return_value=False)

with patch("app.services.zitadel.httpx.AsyncClient", return_value=mock_client):
    result = await zitadel_service.create_organization("Test")
```

**What to Mock:**
- Database sessions (`AsyncSession`) -- always mock in unit tests
- External HTTP services (ZITADEL, S3) -- always mock
- FastAPI dependencies via `app.dependency_overrides`
- `app.state` services for route-level tests

**What NOT to Mock:**
- Pydantic model validation -- test with real schemas
- SQLAlchemy query building -- inspect compiled SQL strings instead
- Domain logic (enums, status transitions, role hierarchy)

## Fixtures and Factories

**Test Data Factories:**
```python
def _make_user(
    user_id: str = "user-test-1",
    org_id: str = ORG_ID,
    role: CampaignRole = CampaignRole.ADMIN,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id, org_id=org_id, role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test User {user_id}",
    )

def _make_campaign(
    campaign_id: uuid.UUID | None = None,
    org_id: str = ORG_ID,
    created_by: str = "user-test-1",
) -> Campaign:
    return Campaign(
        id=campaign_id or CAMPAIGN_ID,
        zitadel_org_id=org_id, name="Test Campaign",
        type=CampaignType.STATE, status=CampaignStatus.ACTIVE,
        created_by=created_by,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
    )
```

**JWT Test Infrastructure (in `tests/conftest.py`):**
- RSA key pair generated at module level for test JWT signing
- `build_jwks()` creates a JWKS dict from the test public key
- `make_jwt()` generates signed JWTs with configurable claims
- Second "bad" key pair for signature validation tests

**Location:**
- Factory functions in the test file that uses them (prefixed with `_`)
- JWT infrastructure in `tests/conftest.py` (shared across all tests)
- Integration fixtures in `tests/integration/conftest.py`

## API Testing Pattern

**Dependency Override Pattern:**
```python
def _override_app(
    user: AuthenticatedUser | None = None,
    db: AsyncMock | None = None,
    zitadel: AsyncMock | None = None,
):
    """Create a test app with overridden dependencies."""
    app = create_app()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    if db is not None:
        async def _get_db():
            yield db
        app.dependency_overrides[get_db] = _get_db
    if zitadel is not None:
        app.state.zitadel_service = zitadel
    return app
```

**HTTP Request Pattern:**
```python
transport = ASGITransport(app=app)
async with AsyncClient(transport=transport, base_url="http://test") as client:
    resp = await client.post(
        "/api/v1/campaigns",
        json={"name": "New Campaign", "type": "federal"},
    )
assert resp.status_code == 201
data = resp.json()
assert data["name"] == "New Campaign"
```

**User Sync Setup:**
- Most API endpoints call `ensure_user_synced()` which makes 2-3 DB queries
- Use helper function `_setup_user_sync_on_db()` to pre-configure mock execute results:
```python
sync_results = _setup_user_sync_on_db(mock_db)
# Append additional results for the actual endpoint logic
sync_results.append(_mock_result_with(campaign))
mock_db.execute = AsyncMock(side_effect=sync_results)
```

## Coverage

**Requirements:** None enforced. No coverage configuration in `pyproject.toml`.

**View Coverage:**
```bash
uv run pytest --cov=app --cov-report=html   # Requires pytest-cov (not in deps)
```

## Test Types

**Unit Tests (`tests/unit/`):**
- No database or network required
- Mock all external dependencies
- Test service logic, query building, role enforcement, schema validation
- Test categories:
  - Service tests: mock DB, test business logic
  - API tests: dependency overrides, test HTTP status codes and response shapes
  - Query builder tests: compile SQL and inspect string output
  - Model coverage: regression test all models imported in base
  - Lifespan tests: mock settings and infra, test startup validation

**Integration Tests (`tests/integration/`):**
- Require running PostgreSQL with migrations applied
- Marked with `@pytest.mark.integration`
- Use two database connections: `superuser_session` (bypasses RLS) and `app_user_session` (RLS enforced)
- Focus on RLS policy verification across campaign boundaries
- Fixtures create test data via raw SQL, clean up after each test

**E2E Tests:**
- Marker defined (`e2e`) but no dedicated e2e test files
- Some e2e-style tests exist in unit tests (e.g., `test_campaign_create_e2e_flow` in `tests/unit/test_lifespan.py`)
- These test full lifespan + route flow but with mocked DB

## Common Patterns

**Async Testing:**
```python
async def test_create_campaign_success(self, mock_db, mock_zitadel):
    """Any authenticated user can create a campaign."""
    service = CampaignService()
    result = await service.create_campaign(db=mock_db, ...)
    mock_db.commit.assert_awaited()
    assert isinstance(result, Campaign)
```

**Error Testing:**
```python
async def test_delete_campaign_only_owner(self, mock_db, mock_zitadel, sample_campaign):
    """delete_campaign only allowed by owner."""
    with pytest.raises(InsufficientPermissionsError):
        await service.delete_campaign(
            db=mock_db, campaign_id=sample_campaign.id,
            user=non_owner, zitadel=mock_zitadel,
        )
```

**SQL Inspection Testing:**
```python
class TestBuildVoterQuery:
    def _compiled_sql(self, query) -> str:
        """Compile a SQLAlchemy query to string for inspection."""
        return str(query.compile(compile_kwargs={"literal_binds": True}))

    def test_party_filter(self):
        q = build_voter_query(VoterFilter(party="DEM"))
        sql = self._compiled_sql(q)
        assert "party" in sql.lower()
```

**Assertion Style:**
- Use plain `assert` statements (no assertion library)
- Assert on status codes: `assert resp.status_code == 201`
- Assert on response shape: `assert "items" in data`
- Assert on mock calls: `mock_zitadel.create_organization.assert_awaited_once_with("New Campaign")`
- Assert on exceptions: `with pytest.raises(InsufficientPermissionsError)`

**Integration Test Pattern:**
```python
@pytest.mark.integration
class TestRLSCampaignIsolation:
    async def test_campaigns_isolated_by_context(self, app_user_session, two_campaigns):
        session = app_user_session
        data = two_campaigns
        await session.execute(
            text("SELECT set_config('app.current_campaign_id', :cid, false)"),
            {"cid": str(data["campaign_a_id"])},
        )
        result = await session.execute(text("SELECT id, name FROM campaigns"))
        rows = result.all()
        campaign_ids = [row[0] for row in rows]
        assert data["campaign_a_id"] in campaign_ids
        assert data["campaign_b_id"] not in campaign_ids
```

## Adding New Tests

**For a new service:**
1. Create `tests/unit/test_{service_name}.py`
2. Create `mock_db` fixture with standard AsyncMock pattern
3. Group tests in class: `class Test{Service}Service:`
4. Test happy path, error cases, and edge cases
5. Mock DB execute results with `_mock_result_with()` helper

**For a new API endpoint:**
1. Add tests to existing `tests/unit/test_api_{domain}.py` or create new file
2. Use `_override_app()` pattern with dependency overrides
3. Handle `ensure_user_synced` DB calls via `_setup_user_sync_on_db()`
4. Test: success path, validation (422), auth (401/403), not found (404)

**For RLS on a new table:**
1. Create `tests/integration/test_{domain}_rls.py`
2. Extend `two_campaigns` fixture or create domain-specific fixture
3. Test cross-campaign isolation with `set_config()` + raw SQL queries
4. Mark with `@pytest.mark.integration`

---

*Testing analysis: 2026-03-10*
