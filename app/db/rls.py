"""Row-Level Security helpers for campaign context."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def set_campaign_context(session: AsyncSession, campaign_id: str) -> None:
    """Set RLS campaign context for the current database session.

    Uses set_config() instead of SET because asyncpg uses server-side
    prepared statements which don't support bound parameters in SET.
    The third parameter (false) scopes to the current session.

    Args:
        session: The async database session.
        campaign_id: The campaign UUID to set as context.
    """
    await session.execute(
        text("SELECT set_config('app.current_campaign_id', :campaign_id, false)"),
        {"campaign_id": str(campaign_id)},
    )
