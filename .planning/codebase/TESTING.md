# Testing Patterns

**Analysis Date:** 2026-03-09

## Project Status

No tests exist yet. No test framework is configured in `pyproject.toml`. This document is **prescriptive** -- establishing patterns based on the declared stack (FastAPI, SQLAlchemy async, Pydantic, PostgreSQL via asyncpg) and the project's SDD methodology (`docs/spec_driven_dev(SDD).md`) which mandates test-first development.

## Test Framework

**Runner:**
- pytest (to be added as dev dependency)
- pytest-asyncio for async test support
- Config: `pyproject.toml` `[tool.pytest.ini_options]` section

**Assertion Library:**
- pytest built-in assertions
- Use `pytest.raises` for exception testing

**Recommended dev dependencies to add:**
```bash
uv add --dev pytest pytest-asyncio pytest-cov httpx
```

**Recommended `pyproject.toml` config:**
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
python_files = ["test_*.py"]
python_functions = ["test_*"]
markers = [
    "integration: marks tests that require a database",
    "e2e: marks end-to-end tests",
]

[tool.coverage.run]
source = ["run_api"]
omit = ["tests/*", "*/migrations/*"]

[tool.coverage.report]
fail_under = 80
show_missing = true
```

**Run Commands:**
```bash
uv run pytest                      # Run all tests
uv run pytest -x                   # Stop on first failure
uv run pytest --cov                # With coverage
uv run pytest -m "not integration" # Unit tests only
uv run pytest -m integration       # Integration tests only
uv run pytest -k "test_campaign"   # Filter by name
```

## Test File Organization

**Location:**
- Separate `tests/` directory at project root (not co-located)

**Naming:**
- `test_{module}.py` -- mirrors source module names

**Structure:**
```
tests/
├── conftest.py              # Shared fixtures (db session, client, factories)
├── unit/
│   ├── conftest.py
│   ├── test_schemas.py      # Pydantic model validation tests
│   └── test_services.py     # Service layer logic tests
├── integration/
│   ├── conftest.py          # DB fixtures, test database setup
│   ├── test_campaign_api.py # API endpoint tests with real DB
│   └── test_repositories.py # Database query tests
└── e2e/
    ├── conftest.py
    └── test_campaign_flow.py # Full workflow tests
```

## Test Structure

**Suite Organization:**
```python
"""Tests for campaign service."""
import pytest
from httpx import AsyncClient

from run_api.schemas.campaign import CampaignCreate


class TestCreateCampaign:
    """Tests for campaign creation."""

    async def test_create_campaign_success(self, client: AsyncClient, db_session):
        """Create a campaign with valid data."""
        payload = {"name": "City Council 2026", "description": "A test campaign"}
        response = await client.post("/api/v1/campaigns", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "City Council 2026"

    async def test_create_campaign_duplicate_name(self, client: AsyncClient, campaign_factory):
        """Reject duplicate campaign names."""
        await campaign_factory(name="Existing Campaign")
        payload = {"name": "Existing Campaign", "description": "Duplicate"}
        response = await client.post("/api/v1/campaigns", json=payload)
        assert response.status_code == 409

    async def test_create_campaign_missing_name(self, client: AsyncClient):
        """Reject campaign without name."""
        response = await client.post("/api/v1/campaigns", json={"description": "No name"})
        assert response.status_code == 422
```

**Patterns:**
- Group related tests in classes prefixed with `Test`
- Use descriptive test names: `test_{action}_{scenario}`
- One assertion concept per test (multiple asserts on the same response are fine)
- Use docstrings on test functions to describe intent

## Mocking

**Framework:** `unittest.mock` (stdlib) and `pytest-mock` if needed

**Patterns:**
```python
from unittest.mock import AsyncMock, patch


async def test_campaign_service_handles_db_error(db_session):
    """Service returns appropriate error when database fails."""
    with patch.object(db_session, "execute", new_callable=AsyncMock) as mock_exec:
        mock_exec.side_effect = Exception("Connection lost")
        with pytest.raises(ServiceError):
            await campaign_service.get_by_id(db_session, some_id)
```

**What to Mock:**
- External HTTP calls (ZITADEL auth, third-party APIs)
- Email/SMS services (Mailgun, Twilio)
- Payment processors (Stripe)
- File system operations when testing business logic

**What NOT to Mock (per SDD methodology):**
- Database queries in integration tests -- use a real test database
- Pydantic validation -- test with real schemas
- FastAPI dependency injection -- use `app.dependency_overrides`
- SQLAlchemy ORM behavior

## Fixtures and Factories

**Core fixtures in `tests/conftest.py`:**
```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from run_api.main import app
from run_api.db.session import get_db
from run_api.db.base import Base


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
async def engine():
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost:5432/run_api_test")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(engine):
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        async with session.begin():
            yield session
        await session.rollback()


@pytest.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

**Factory pattern:**
```python
@pytest.fixture
def campaign_factory(db_session):
    async def _create(name: str = "Test Campaign", **kwargs):
        campaign = Campaign(name=name, **kwargs)
        db_session.add(campaign)
        await db_session.flush()
        return campaign
    return _create
```

**Location:**
- Shared fixtures: `tests/conftest.py`
- Layer-specific fixtures: `tests/{layer}/conftest.py`
- Factory fixtures: `tests/conftest.py` alongside session fixtures

## Coverage

**Requirements:** 80% minimum (enforce via `[tool.coverage.report] fail_under = 80`)

**View Coverage:**
```bash
uv run pytest --cov --cov-report=html   # HTML report in htmlcov/
uv run pytest --cov --cov-report=term   # Terminal summary
```

## Test Types

**Unit Tests:**
- Location: `tests/unit/`
- Scope: Pydantic schema validation, pure business logic, utility functions
- No database, no HTTP, no external services
- Fast execution (< 1 second per test)

**Integration Tests:**
- Location: `tests/integration/`
- Scope: API endpoints with real database, repository queries, service + DB interactions
- Use test PostgreSQL database (not mocked)
- Mark with `@pytest.mark.integration`
- Use transaction rollback per test for isolation

**E2E Tests:**
- Location: `tests/e2e/`
- Scope: Full user workflows (create campaign -> add constituents -> create event)
- Mark with `@pytest.mark.e2e`
- May require external services (ZITADEL test instance)

## Common Patterns

**Async Testing:**
```python
# With asyncio_mode = "auto" in config, no decorator needed
async def test_get_campaign(client: AsyncClient, campaign_factory):
    campaign = await campaign_factory(name="My Campaign")
    response = await client.get(f"/api/v1/campaigns/{campaign.id}")
    assert response.status_code == 200
    assert response.json()["name"] == "My Campaign"
```

**Error Testing:**
```python
async def test_delete_nonexistent_campaign(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.delete(f"/api/v1/campaigns/{fake_id}")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
```

**Schema Validation Testing:**
```python
import pytest
from pydantic import ValidationError

from run_api.schemas.campaign import CampaignCreate


def test_campaign_create_valid():
    schema = CampaignCreate(name="Valid Name", description="A campaign")
    assert schema.name == "Valid Name"


def test_campaign_create_empty_name():
    with pytest.raises(ValidationError) as exc_info:
        CampaignCreate(name="", description="Missing name")
    assert "name" in str(exc_info.value)
```

**Database Testing with Rollback:**
```python
async def test_create_and_retrieve(db_session, campaign_factory):
    campaign = await campaign_factory(name="Rollback Test")
    from sqlalchemy import select
    result = await db_session.execute(
        select(Campaign).where(Campaign.name == "Rollback Test")
    )
    found = result.scalar_one()
    assert found.id == campaign.id
    # Session rolls back after test -- no cleanup needed
```

## SDD Testing Philosophy

Per `docs/spec_driven_dev(SDD).md`, this project follows test-first development:

1. Write contract tests from API specifications first
2. Write integration tests second
3. Write e2e tests third
4. Write unit tests last (for complex logic extraction)
5. Implementation code is written to make tests pass

Prefer real database interactions over mocks. Use mocks only for external services (ZITADEL, Stripe, Mailgun, Twilio).

---

*Testing analysis: 2026-03-09*
