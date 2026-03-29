"""Row-Level Security helpers for campaign context."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def set_campaign_context(session: AsyncSession, campaign_id: str) -> None:
    """Set RLS campaign context for the current transaction.

    Uses set_config() instead of SET because asyncpg uses server-side
    prepared statements which don't support bound parameters in SET.
    The third parameter (true) scopes to the current transaction so the
    config auto-resets at COMMIT/ROLLBACK, preventing cross-campaign
    data leaks when connections are reused from the pool.

    Args:
        session: The async database session.
        campaign_id: The campaign UUID to set as context.

    Raises:
        ValueError: If campaign_id is falsy (required for RLS context).
    """
    if not campaign_id:
        raise ValueError("campaign_id is required for RLS context")
    await session.execute(
        text("SELECT set_config('app.current_campaign_id', :campaign_id, true)"),
        {"campaign_id": str(campaign_id)},
    )


async def commit_and_restore_rls(session: AsyncSession, campaign_id: str) -> None:
    """Commit the current transaction and restore RLS context.

    PostgreSQL set_config(..., true) is transaction-scoped and resets
    on COMMIT. This helper ensures RLS is always restored after commit,
    preventing the silent failure mode where subsequent queries return
    zero rows or insert into the wrong campaign context.

    Args:
        session: The async database session.
        campaign_id: The campaign UUID to restore as RLS context.
    """
    await session.commit()
    await set_campaign_context(session, campaign_id)
