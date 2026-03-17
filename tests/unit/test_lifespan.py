"""Tests for application lifespan ZitadelService initialization."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.errors import ZitadelUnavailableError
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.campaign import Campaign
from app.models.user import User


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

    with patch.object(
        ZitadelService, "_get_token", new_callable=AsyncMock, return_value="tok"
    ):
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
        with pytest.raises(
            RuntimeError, match="ZITADEL service account not configured"
        ):
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
        with pytest.raises(
            RuntimeError, match="ZITADEL service account not configured"
        ):
            async with app.router.lifespan_context(app):
                pass


@pytest.mark.asyncio()
async def test_startup_fails_invalid_credentials(_mock_settings, _mock_infra):
    """RuntimeError raised when _get_token() returns 401."""
    from app.services.zitadel import ZitadelService

    response_401 = httpx.Response(401, request=httpx.Request("POST", "https://x"))
    exc = httpx.HTTPStatusError(
        "401", request=response_401.request, response=response_401
    )

    with patch.object(
        ZitadelService, "_get_token", new_callable=AsyncMock, side_effect=exc
    ):
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


# ---------------------------------------------------------------------------
# E2E flow test (FLOW-01 closure)
# ---------------------------------------------------------------------------

ORG_ID = "zitadel-org-e2e-123"
CAMPAIGN_ID = uuid.uuid4()


def _make_user(
    user_id: str = "user-e2e-1",
    org_id: str = ORG_ID,
    role: CampaignRole = CampaignRole.ADMIN,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test User {user_id}",
    )


@pytest.mark.asyncio()
async def test_campaign_create_e2e_flow(_mock_settings, _mock_infra):
    """Full lifespan -> campaign create proves FLOW-01 wiring works end-to-end.

    ZitadelService is set on app.state during lifespan (not manually),
    and the campaign create route accesses it via request.app.state.
    """
    from app.services.zitadel import ZitadelService

    user = _make_user(role=CampaignRole.VIEWER)
    local_user = User(
        id=user.id,
        display_name=user.display_name,
        email=user.email,
        created_at=utcnow(),
        updated_at=utcnow(),
    )

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.rollback = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            MagicMock(
                scalar_one_or_none=MagicMock(return_value=local_user)
            ),  # user lookup
            MagicMock(
                scalar_one_or_none=MagicMock(return_value=None)
            ),  # campaign lookup
        ]
    )

    async def fake_refresh(obj):
        if isinstance(obj, Campaign):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = obj.created_at or utcnow()
            obj.updated_at = obj.updated_at or utcnow()

    mock_db.refresh = AsyncMock(side_effect=fake_refresh)

    with (
        patch.object(
            ZitadelService, "_get_token", new_callable=AsyncMock, return_value="tok"
        ),
        patch.object(
            ZitadelService,
            "create_organization",
            new_callable=AsyncMock,
            return_value={"id": ORG_ID},
        ),
    ):
        app = create_app()
        app.dependency_overrides[get_current_user] = lambda: user

        async def _get_db():
            yield mock_db

        app.dependency_overrides[get_db] = _get_db

        transport = httpx.ASGITransport(app=app)
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(transport=transport, base_url="http://test") as client,
        ):
            resp = await client.post(
                "/api/v1/campaigns",
                json={"name": "E2E Campaign", "type": "federal"},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "E2E Campaign"
        # Prove ZitadelService was accessible from the route handler
        ZitadelService.create_organization.assert_called_once()
