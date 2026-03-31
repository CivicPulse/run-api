"""Async database engine, session factory, and FastAPI dependency."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=20,
)


@event.listens_for(engine.sync_engine, "checkout")
def reset_rls_context(dbapi_connection, connection_record, connection_proxy):
    """Defense-in-depth: reset RLS context on every pool checkout.

    Prevents stale campaign context from leaking across requests
    when connections are reused from the pool. Uses session-scoped
    (false) intentionally — this is a defensive reset at checkout time,
    ensuring no data access until a real campaign context is set.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute(
        "SELECT set_config('app.current_campaign_id', "
        "'00000000-0000-0000-0000-000000000000', false)"
    )
    # Phase 41: add set_config('app.current_org_id', ...) here
    cursor.close()


async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency that yields an async database session."""
    async with async_session_factory() as session:
        yield session
