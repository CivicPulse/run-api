"""Tests for confirm_mapping endpoint: 202 response, defer_async, 409 duplicate."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.api.deps import get_campaign_db
from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    get_current_user,
    get_current_user_dual,
)
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.import_job import ImportJob, ImportStatus
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
IMPORT_ID = uuid.uuid4()
USER_ID = "user-confirm-1"


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        org_id="org-confirm-test",
        role=CampaignRole.ADMIN,
        email="admin@test.com",
        display_name="Admin User",
    )


def _make_import_job(
    status: ImportStatus = ImportStatus.UPLOADED,
) -> ImportJob:
    now = utcnow()
    job = ImportJob(
        id=IMPORT_ID,
        campaign_id=CAMPAIGN_ID,
        status=status,
        original_filename="voters.csv",
        source_type="csv",
        file_key=f"imports/{CAMPAIGN_ID}/{IMPORT_ID}/voters.csv",
        created_by=USER_ID,
        detected_columns=["first_name", "last_name"],
        suggested_mapping={"first_name": "first_name", "last_name": "last_name"},
        created_at=now,
        updated_at=now,
    )
    return job


def _make_local_user() -> User:
    return User(
        id=USER_ID,
        display_name="Admin User",
        email="admin@test.com",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


@pytest.fixture()
def _mock_infra():
    """Mock StorageService, Procrastinate, and JWKSManager for lifespan."""
    storage_mock = MagicMock()
    storage_mock.ensure_bucket = AsyncMock()

    procrastinate_mock = MagicMock()
    procrastinate_mock.open_async = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=None),
        )
    )

    with (
        patch("app.services.storage.StorageService", return_value=storage_mock),
        patch(
            "app.tasks.procrastinate_app.procrastinate_app",
            procrastinate_mock,
        ),
        patch("app.core.security.JWKSManager"),
    ):
        yield


@pytest.fixture()
def _mock_settings():
    """Patch settings with valid ZITADEL config."""
    with patch("app.main.settings") as mock_s:
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_base_url = ""
        mock_s.zitadel_service_client_id = "client-id"
        mock_s.zitadel_service_client_secret = "client-secret"
        mock_s.cors_allowed_origins = ["*"]
        yield mock_s


def _build_app_with_overrides(mock_db: AsyncMock) -> object:
    """Create app with dependency overrides for testing.

    Overrides get_current_user (auth bypass), get_db (for require_role),
    and get_campaign_db (for endpoint DB session).
    """
    app = create_app()
    app.dependency_overrides[get_current_user] = _make_user
    app.dependency_overrides[get_current_user_dual] = _make_user

    async def _get_db():
        yield mock_db

    async def _get_campaign_db(campaign_id: uuid.UUID):
        yield mock_db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_campaign_db
    return app


async def _post_confirm(app):
    """POST to confirm endpoint and return the response."""
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://test") as client,
    ):
        resp = await client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/imports/{IMPORT_ID}/confirm",
            json={
                "field_mapping": {
                    "first_name": "first_name",
                    "last_name": "last_name",
                }
            },
        )
    return resp


@pytest.mark.asyncio()
async def test_confirm_mapping_returns_202(_mock_settings, _mock_infra):
    """confirm_mapping returns 202 Accepted (not 201 Created)."""
    from app.services.zitadel import ZitadelService

    job = _make_import_job()
    local_user = _make_local_user()

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=job)
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    # Mock user sync (ensure_user_synced)
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

    defer_mock = AsyncMock()
    configure_mock = MagicMock(return_value=MagicMock(defer_async=defer_mock))

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch("app.api.v1.imports.process_import") as task_mock,
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        task_mock.configure = configure_mock

        app = _build_app_with_overrides(mock_db)
        resp = await _post_confirm(app)

    assert resp.status_code == 202, f"Expected 202, got {resp.status_code}"


@pytest.mark.asyncio()
async def test_confirm_mapping_defer_async_called_with_correct_args(
    _mock_settings, _mock_infra
):
    """defer_async is called with import_job_id and campaign_id kwargs."""
    from app.services.zitadel import ZitadelService

    job = _make_import_job()
    local_user = _make_local_user()

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=job)
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

    defer_mock = AsyncMock()
    configure_mock = MagicMock(return_value=MagicMock(defer_async=defer_mock))

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch("app.api.v1.imports.process_import") as task_mock,
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        task_mock.configure = configure_mock

        app = _build_app_with_overrides(mock_db)
        await _post_confirm(app)

    # Verify configure was called with the queueing_lock
    configure_mock.assert_called_once_with(
        queueing_lock=str(CAMPAIGN_ID),
    )
    # Verify defer_async was called with both required kwargs
    defer_mock.assert_called_once_with(
        import_job_id=str(IMPORT_ID),
        campaign_id=str(CAMPAIGN_ID),
    )


@pytest.mark.asyncio()
async def test_confirm_mapping_returns_409_on_duplicate(_mock_settings, _mock_infra):
    """When AlreadyEnqueued is raised, endpoint returns 409."""
    from procrastinate.exceptions import AlreadyEnqueued

    from app.services.zitadel import ZitadelService

    job = _make_import_job()
    local_user = _make_local_user()

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=job)
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

    defer_mock = AsyncMock(side_effect=AlreadyEnqueued())
    configure_mock = MagicMock(return_value=MagicMock(defer_async=defer_mock))

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch("app.api.v1.imports.process_import") as task_mock,
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        task_mock.configure = configure_mock

        app = _build_app_with_overrides(mock_db)
        resp = await _post_confirm(app)

    assert resp.status_code == 409
    assert "already in progress" in resp.json()["detail"]
