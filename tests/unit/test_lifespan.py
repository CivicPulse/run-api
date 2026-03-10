"""Tests for application lifespan ZitadelService initialization."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.errors import ZitadelUnavailableError
from app.main import create_app


@pytest.fixture()
def _mock_settings():
    """Patch settings with valid ZITADEL config."""
    with patch("app.main.settings") as mock_s:
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_service_client_id = "client-id"
        mock_s.zitadel_service_client_secret = "client-secret"
        yield mock_s


@pytest.fixture()
def _mock_infra():
    """Mock StorageService, broker, and JWKSManager so lifespan can run."""
    storage_mock = MagicMock()
    storage_mock.ensure_bucket = AsyncMock()

    broker_mock = MagicMock()
    broker_mock.startup = AsyncMock()
    broker_mock.shutdown = AsyncMock()

    with (
        patch("app.services.storage.StorageService", return_value=storage_mock),
        patch("app.tasks.broker.broker", broker_mock),
        patch("app.core.security.JWKSManager"),
    ):
        yield


@pytest.mark.asyncio()
async def test_zitadel_service_initialized(_mock_settings, _mock_infra):
    """Lifespan sets app.state.zitadel_service to a ZitadelService instance."""
    from app.services.zitadel import ZitadelService

    with patch.object(ZitadelService, "_get_token", new_callable=AsyncMock, return_value="tok"):
        app = create_app()
        async with app.router.lifespan_context(app):
            assert hasattr(app.state, "zitadel_service")
            assert isinstance(app.state.zitadel_service, ZitadelService)


@pytest.mark.asyncio()
async def test_startup_fails_missing_config_client_id(_mock_infra):
    """RuntimeError raised when zitadel_service_client_id is empty."""
    with patch("app.main.settings") as mock_s:
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_service_client_id = ""
        mock_s.zitadel_service_client_secret = "valid-secret"

        app = create_app()
        with pytest.raises(RuntimeError, match="ZITADEL service account not configured"):
            async with app.router.lifespan_context(app):
                pass


@pytest.mark.asyncio()
async def test_startup_fails_missing_config_client_secret(_mock_infra):
    """RuntimeError raised when zitadel_service_client_secret is empty."""
    with patch("app.main.settings") as mock_s:
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_service_client_id = "valid-id"
        mock_s.zitadel_service_client_secret = ""

        app = create_app()
        with pytest.raises(RuntimeError, match="ZITADEL service account not configured"):
            async with app.router.lifespan_context(app):
                pass


@pytest.mark.asyncio()
async def test_startup_fails_invalid_credentials(_mock_settings, _mock_infra):
    """RuntimeError raised when _get_token() returns 401."""
    from app.services.zitadel import ZitadelService

    response_401 = httpx.Response(401, request=httpx.Request("POST", "https://x"))
    exc = httpx.HTTPStatusError("401", request=response_401.request, response=response_401)

    with patch.object(ZitadelService, "_get_token", new_callable=AsyncMock, side_effect=exc):
        app = create_app()
        with pytest.raises(RuntimeError, match="ZITADEL credentials invalid"):
            async with app.router.lifespan_context(app):
                pass


@pytest.mark.asyncio()
async def test_startup_fails_unreachable(_mock_settings, _mock_infra):
    """RuntimeError raised when _get_token() raises ZitadelUnavailableError."""
    from app.services.zitadel import ZitadelService

    with patch.object(
        ZitadelService,
        "_get_token",
        new_callable=AsyncMock,
        side_effect=ZitadelUnavailableError("conn refused"),
    ):
        app = create_app()
        with pytest.raises(RuntimeError, match="ZITADEL unreachable"):
            async with app.router.lifespan_context(app):
                pass
