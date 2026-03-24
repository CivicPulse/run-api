"""Integration tests for RLS isolation across pool reuse and transactions.

These tests verify that the transaction-scoped set_config fix prevents
cross-campaign data leaks when connections are reused from the pool.

Requires: PostgreSQL running via docker compose, migrations applied.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.rls import set_campaign_context

# app_user connection — RLS enforced
APP_USER_URL = "postgresql+asyncpg://app_user:app_password@localhost:5432/run_api"


@pytest.mark.integration
class TestRLSPoolIsolation:
    """Verify RLS context does not leak across pool reuse or transactions."""

    async def test_pool_reuse_no_leak(self, two_campaigns):
        """Session A sets campaign context via app function, commits.
        Session B from same pool should NOT see campaign A's data
        without setting context."""
        data = two_campaigns

        # Create a pool with max 1 connection to force reuse
        engine = create_async_engine(
            APP_USER_URL, echo=False, pool_size=1, max_overflow=0
        )
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        try:
            # Session A: set context using app function and query
            async with factory() as session_a:
                await set_campaign_context(
                    session_a, str(data["campaign_a_id"])
                )
                result_a = await session_a.execute(
                    text("SELECT id FROM campaigns")
                )
                rows_a = result_a.all()
                assert len(rows_a) >= 1, "Session A should see campaign A"
                assert data["campaign_a_id"] in [r[0] for r in rows_a]
                await session_a.commit()

            # Session B: acquire from same pool WITHOUT setting context
            async with factory() as session_b:
                result_b = await session_b.execute(
                    text("SELECT id FROM campaigns")
                )
                rows_b = result_b.all()
                # With transaction-scoped config (true), the context should
                # have been reset after session A's commit. Session B should
                # see zero campaigns (null UUID matches nothing).
                campaign_ids_b = [r[0] for r in rows_b]
                assert data["campaign_a_id"] not in campaign_ids_b, (
                    "LEAK: Session B sees campaign A's data after pool reuse"
                )
        finally:
            await engine.dispose()

    async def test_transaction_scope_reset(self, two_campaigns):
        """After commit, a new transaction on the same session should NOT
        have stale campaign context."""
        data = two_campaigns

        engine = create_async_engine(APP_USER_URL, echo=False)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        try:
            async with factory() as session:
                # Set context using app function
                await set_campaign_context(
                    session, str(data["campaign_a_id"])
                )

                # Verify context is set
                result = await session.execute(
                    text(
                        "SELECT current_setting("
                        "'app.current_campaign_id', true)"
                    )
                )
                val = result.scalar()
                assert val == str(data["campaign_a_id"])

                # Commit — transaction-scoped config should reset
                await session.commit()

                # New transaction: context should be empty/default
                result2 = await session.execute(
                    text(
                        "SELECT current_setting("
                        "'app.current_campaign_id', true)"
                    )
                )
                val2 = result2.scalar()
                assert val2 != str(data["campaign_a_id"]), (
                    f"LEAK: Stale context '{val2}' persists after commit"
                )
        finally:
            await engine.dispose()

    async def test_concurrent_campaign_isolation(self, two_campaigns):
        """Two sessions with different campaign contexts see only their
        own campaign's data."""
        data = two_campaigns

        engine = create_async_engine(APP_USER_URL, echo=False)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        try:
            async with factory() as session_a, factory() as session_b:
                # Set different contexts using app function
                await set_campaign_context(
                    session_a, str(data["campaign_a_id"])
                )
                await set_campaign_context(
                    session_b, str(data["campaign_b_id"])
                )

                # Each session sees only its own campaign
                result_a = await session_a.execute(
                    text("SELECT name FROM campaigns")
                )
                names_a = [r[0] for r in result_a.all()]
                assert "Campaign A" in names_a
                assert "Campaign B" not in names_a

                result_b = await session_b.execute(
                    text("SELECT name FROM campaigns")
                )
                names_b = [r[0] for r in result_b.all()]
                assert "Campaign B" in names_b
                assert "Campaign A" not in names_b
        finally:
            await engine.dispose()

    async def test_set_campaign_context_validates_input(self):
        """set_campaign_context raises ValueError for falsy campaign_id."""
        engine = create_async_engine(APP_USER_URL, echo=False)
        factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        try:
            async with factory() as session:
                with pytest.raises(
                    ValueError, match="campaign_id is required"
                ):
                    await set_campaign_context(session, "")

                with pytest.raises(
                    ValueError, match="campaign_id is required"
                ):
                    await set_campaign_context(session, None)
        finally:
            await engine.dispose()
