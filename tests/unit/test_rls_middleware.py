"""Unit tests for centralized get_campaign_db dependency.

Verifies that the get_campaign_db FastAPI dependency correctly sets RLS
campaign context, handles errors with 403, and properly manages sessions.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.deps import get_campaign_db


class TestGetCampaignDb:
    """Verify get_campaign_db dependency behavior."""

    @pytest.mark.asyncio
    async def test_get_campaign_db_sets_context(self):
        """get_campaign_db calls set_campaign_context with the campaign UUID."""
        campaign_id = uuid.uuid4()
        mock_session = AsyncMock()

        with (
            patch(
                "app.api.deps.async_session_factory"
            ) as mock_factory,
            patch(
                "app.api.deps.set_campaign_context", new_callable=AsyncMock
            ) as mock_set_ctx,
        ):
            # async context manager returns mock_session
            mock_factory.return_value.__aenter__ = AsyncMock(
                return_value=mock_session
            )
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            gen = get_campaign_db(campaign_id)
            session = await gen.__anext__()

            assert session is mock_session
            mock_set_ctx.assert_called_once_with(mock_session, str(campaign_id))

            # Clean up generator
            with pytest.raises(StopAsyncIteration):
                await gen.__anext__()

    @pytest.mark.asyncio
    async def test_get_campaign_db_yields_and_closes_session(self):
        """get_campaign_db yields a session and closes it after use."""
        campaign_id = uuid.uuid4()
        mock_session = AsyncMock()
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with (
            patch(
                "app.api.deps.async_session_factory", return_value=mock_cm
            ),
            patch(
                "app.api.deps.set_campaign_context", new_callable=AsyncMock
            ),
        ):
            gen = get_campaign_db(campaign_id)
            session = await gen.__anext__()
            assert session is mock_session

            # Finish the generator — should trigger __aexit__
            with pytest.raises(StopAsyncIteration):
                await gen.__anext__()

            mock_cm.__aexit__.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_campaign_db_propagates_value_error_as_403(self):
        """get_campaign_db converts ValueError from set_campaign_context to 403."""
        campaign_id = uuid.uuid4()
        mock_session = AsyncMock()
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with (
            patch(
                "app.api.deps.async_session_factory", return_value=mock_cm
            ),
            patch(
                "app.api.deps.set_campaign_context",
                new_callable=AsyncMock,
                side_effect=ValueError("campaign_id is required"),
            ),
        ):
            gen = get_campaign_db(campaign_id)
            with pytest.raises(HTTPException) as exc_info:
                await gen.__anext__()

            assert exc_info.value.status_code == 403
            assert "Campaign context required" in str(exc_info.value.detail)
