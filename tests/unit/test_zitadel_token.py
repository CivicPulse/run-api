"""Unit tests for ZitadelService._get_token() error handling."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.errors import ZitadelUnavailableError
from app.services.zitadel import ZitadelService


@pytest.fixture
def zitadel_service():
    return ZitadelService(
        issuer="http://localhost:8080",
        client_id="test-client",
        client_secret="test-secret",
        base_url="http://localhost:8080",
    )


@pytest.mark.anyio
async def test_get_token_http_status_error_raises_zitadel_unavailable(zitadel_service):
    """HTTPStatusError from token endpoint should raise ZitadelUnavailableError."""
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401 Unauthorized", request=MagicMock(), response=mock_response
    )

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        # Clear any cached token
        zitadel_service._token = None
        zitadel_service._token_expires_at = 0

        with pytest.raises(ZitadelUnavailableError, match="token exchange failed"):
            await zitadel_service._get_token()
