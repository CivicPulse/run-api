"""Integration test fixtures -- real database with RLS verification.

These fixtures create isolated test data using superuser connections
and verify RLS enforcement using the app_user role.
"""

from __future__ import annotations

import os
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.time import utcnow

# Database URLs for integration tests (port from env, default 5432)
_DB_PORT = os.environ.get("TEST_DB_PORT", "5432")
SUPERUSER_URL = (
    f"postgresql+asyncpg://postgres:postgres@localhost:{_DB_PORT}/run_api"
)
APP_USER_URL = (
    f"postgresql+asyncpg://app_user:app_password"
    f"@localhost:{_DB_PORT}/run_api"
)


@pytest.fixture(scope="session")
def superuser_engine():
    """Superuser engine for test setup/teardown."""
    engine = create_async_engine(SUPERUSER_URL, echo=False)
    yield engine


@pytest.fixture(scope="session")
def app_user_engine():
    """App user engine for RLS testing.

    Registers a checkout listener that resets RLS context to a safe
    null-UUID, matching the app's production behavior. Without this,
    the config defaults to empty string which fails ``::uuid`` casts
    in RLS policies.
    """
    engine = create_async_engine(APP_USER_URL, echo=False)

    @event.listens_for(engine.sync_engine, "checkout")
    def _reset_rls(dbapi_conn, rec, proxy):
        cur = dbapi_conn.cursor()
        cur.execute(
            "SELECT set_config('app.current_campaign_id',"
            " '00000000-0000-0000-0000-000000000000', false)"
        )
        cur.close()

    yield engine


@pytest.fixture
async def superuser_session(superuser_engine):
    """Superuser session (bypasses RLS)."""
    session_factory = async_sessionmaker(
        superuser_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
async def app_user_session(app_user_engine):
    """App user session (RLS enforced)."""
    session_factory = async_sessionmaker(
        app_user_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
async def two_campaigns(superuser_session):
    """Create two campaigns with separate data for RLS testing.

    Returns dict with campaign_a and campaign_b UUIDs and test data IDs.
    """
    session = superuser_session

    campaign_a_id = uuid.uuid4()
    campaign_b_id = uuid.uuid4()
    user_a_id = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b_id = f"user-b-{uuid.uuid4().hex[:8]}"

    # Create users
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_a_id,
            "name": "User A",
            "email": "usera@test.com",
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO users (id, display_name, email, created_at, updated_at) "
            "VALUES (:id, :name, :email, :now, :now)"
        ),
        {
            "id": user_b_id,
            "name": "User B",
            "email": "userb@test.com",
            "now": utcnow(),
        },
    )

    # Create campaigns
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :type, :status, :created_by, :now, :now)"
        ),
        {
            "id": campaign_a_id,
            "org_id": f"org-a-{campaign_a_id.hex[:8]}",
            "name": "Campaign A",
            "type": "STATE",
            "status": "ACTIVE",
            "created_by": user_a_id,
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaigns "
            "(id, zitadel_org_id, name, type, status, "
            "created_by, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :type, :status, :created_by, :now, :now)"
        ),
        {
            "id": campaign_b_id,
            "org_id": f"org-b-{campaign_b_id.hex[:8]}",
            "name": "Campaign B",
            "type": "FEDERAL",
            "status": "ACTIVE",
            "created_by": user_b_id,
            "now": utcnow(),
        },
    )

    # Create campaign members
    await session.execute(
        text(
            "INSERT INTO campaign_members (id, user_id, campaign_id, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": user_a_id,
            "campaign_id": campaign_a_id,
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO campaign_members (id, user_id, campaign_id, synced_at) "
            "VALUES (:id, :user_id, :campaign_id, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": user_b_id,
            "campaign_id": campaign_b_id,
            "now": utcnow(),
        },
    )

    # Create invites
    await session.execute(
        text(
            "INSERT INTO invites "
            "(id, campaign_id, email, role, token, expires_at, created_by, created_at) "
            "VALUES (:id, :campaign_id, :email, :role, "
            ":token, :expires_at, :created_by, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "campaign_id": campaign_a_id,
            "email": "invite-a@test.com",
            "role": "manager",
            "token": uuid.uuid4(),
            "expires_at": utcnow() + timedelta(days=7),
            "created_by": user_a_id,
            "now": utcnow(),
        },
    )
    await session.execute(
        text(
            "INSERT INTO invites "
            "(id, campaign_id, email, role, token, expires_at, created_by, created_at) "
            "VALUES (:id, :campaign_id, :email, :role, "
            ":token, :expires_at, :created_by, :now)"
        ),
        {
            "id": uuid.uuid4(),
            "campaign_id": campaign_b_id,
            "email": "invite-b@test.com",
            "role": "admin",
            "token": uuid.uuid4(),
            "expires_at": utcnow() + timedelta(days=7),
            "created_by": user_b_id,
            "now": utcnow(),
        },
    )

    await session.commit()

    yield {
        "campaign_a_id": campaign_a_id,
        "campaign_b_id": campaign_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
    }

    # Cleanup
    await session.execute(
        text("DELETE FROM invites WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM campaign_members WHERE campaign_id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM campaigns WHERE id IN (:a, :b)"),
        {"a": campaign_a_id, "b": campaign_b_id},
    )
    await session.execute(
        text("DELETE FROM users WHERE id IN (:a, :b)"),
        {"a": user_a_id, "b": user_b_id},
    )
    await session.commit()
