# Coding Conventions

**Analysis Date:** 2026-03-09

## Project Status

This is a greenfield project at initial scaffold stage. Only `main.py` (stub) and `pyproject.toml` exist. Conventions below are **prescriptive** -- derived from the declared stack (FastAPI, SQLAlchemy, Pydantic, Alembic, Loguru) and project methodology (Spec-Driven Development documented in `docs/spec_driven_dev(SDD).md`).

## Naming Patterns

**Files:**
- Use `snake_case.py` for all Python modules
- Use plural nouns for collection modules (e.g., `routers/`, `models/`, `schemas/`)
- Use singular nouns for individual domain modules (e.g., `models/campaign.py`, `schemas/constituent.py`)

**Functions:**
- Use `snake_case` for all functions and methods
- Prefix async functions with verbs: `get_campaign()`, `create_constituent()`, `list_events()`
- Use `_` prefix for private/internal helpers: `_validate_donor_email()`

**Variables:**
- Use `snake_case` for all variables
- Use `UPPER_SNAKE_CASE` for constants and settings
- Use descriptive names: `campaign_id` not `cid`, `volunteer_list` not `vl`

**Types/Classes:**
- Use `PascalCase` for all classes
- Pydantic models: suffix with purpose -- `CampaignCreate`, `CampaignResponse`, `CampaignUpdate`
- SQLAlchemy models: no suffix, just the entity name -- `Campaign`, `Constituent`, `Event`
- Use `Base` for the declarative base class

## Code Style

**Formatting:**
- Use `ruff format` (configured via `pyproject.toml`)
- Line length: 88 characters (ruff default)
- Use double quotes for strings
- Use trailing commas in multi-line collections

**Linting:**
- Use `ruff check` with `--fix` for auto-fixable issues
- Run `ruff check` and `ruff format --check` before every commit
- No linting configuration exists yet in `pyproject.toml` -- add `[tool.ruff]` section when first source files are created

**Recommended ruff config for `pyproject.toml`:**
```toml
[tool.ruff]
target-version = "py313"
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "SIM", "ASYNC"]

[tool.ruff.lint.isort]
known-first-party = ["run_api"]
```

## Import Organization

**Order:**
1. Standard library imports
2. Third-party imports (fastapi, sqlalchemy, pydantic, loguru)
3. Local application imports (run_api.*)

**Path Aliases:**
- No path aliases configured yet. Use relative imports within packages, absolute imports from entry points.

**Style:**
```python
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from run_api.db.session import get_db
from run_api.models.campaign import Campaign
from run_api.schemas.campaign import CampaignCreate, CampaignResponse
```

## Error Handling

**Patterns:**
- Use `fastapi.HTTPException` for API-level errors with appropriate status codes
- Use custom exception classes for domain-level errors, caught by FastAPI exception handlers
- Never return bare 500 errors -- always catch and wrap with meaningful messages
- Use `status` constants from FastAPI, not raw integers: `status.HTTP_404_NOT_FOUND`

**Example pattern:**
```python
from fastapi import HTTPException, status

class CampaignNotFoundError(Exception):
    def __init__(self, campaign_id: uuid.UUID):
        self.campaign_id = campaign_id
        super().__init__(f"Campaign {campaign_id} not found")

# In router:
async def get_campaign(campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    campaign = await campaign_service.get_by_id(db, campaign_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id} not found",
        )
    return campaign
```

## Logging

**Framework:** Loguru (`loguru` is a declared dependency)

**Patterns:**
- Use `from loguru import logger` at module level
- Use structured logging with context: `logger.info("Campaign created", campaign_id=str(campaign.id))`
- Log at appropriate levels: `debug` for internals, `info` for business events, `warning` for recoverable issues, `error` for failures
- Never log sensitive data (passwords, tokens, PII beyond IDs)

## Comments

**When to Comment:**
- Docstrings on all public functions, classes, and modules
- Inline comments only for non-obvious logic
- Use `# TODO:` with ticket/issue reference for planned work
- Use `# HACK:` sparingly and only with justification

**Docstrings:**
- Use Google-style docstrings
- Include `Args:`, `Returns:`, and `Raises:` sections for public functions

```python
async def create_campaign(db: AsyncSession, data: CampaignCreate) -> Campaign:
    """Create a new campaign.

    Args:
        db: Database session.
        data: Campaign creation payload.

    Returns:
        The newly created Campaign instance.

    Raises:
        ValueError: If campaign name is already taken.
    """
```

## Function Design

**Size:** Keep functions under 30 lines. Extract helpers for complex logic.

**Parameters:** Use Pydantic models for grouped parameters. Use `Depends()` for FastAPI dependency injection.

**Return Values:** Always use type hints. Return Pydantic response models from API endpoints, domain models from service functions.

## Module Design

**Exports:** Use `__all__` in `__init__.py` files to control public API.

**Barrel Files:** Use `__init__.py` for re-exports in package directories. Keep them minimal.

## Async Patterns

**Convention:** Use `async def` for all database and I/O operations. The project uses `asyncpg` and SQLAlchemy async sessions.

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

async def get_by_id(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign | None:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    return result.scalar_one_or_none()
```

## Pydantic Conventions

**Base config:**
```python
from pydantic import BaseModel, ConfigDict

class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

**Schema naming:** `{Entity}Create`, `{Entity}Update`, `{Entity}Response`, `{Entity}List`

## SQLAlchemy Conventions

**Use mapped_column with type annotations:**
```python
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
import uuid

class Base(DeclarativeBase):
    pass

class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

## Environment and Settings

**Use pydantic-settings for configuration:**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    zitadel_issuer: str
    debug: bool = False

    model_config = ConfigDict(env_file=".env")
```

- Never hardcode secrets or connection strings
- `.env` files are gitignored and must never be committed

---

*Convention analysis: 2026-03-09*
