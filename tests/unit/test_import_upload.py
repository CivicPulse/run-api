"""Tests for import initiation upload URLs in local dev/proxied environments."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import Request

from app.api.deps import get_campaign_db
from app.api.v1.imports import _rewrite_presigned_url_for_browser_origin
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
USER_ID = "user-upload-1"


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        org_id="org-upload-test",
        role=CampaignRole.ADMIN,
        email="admin@test.com",
        display_name="Admin User",
    )


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
    storage_mock = MagicMock()
    storage_mock.ensure_bucket = AsyncMock()
    storage_mock.generate_upload_url = AsyncMock(
        return_value=(
            "http://localhost:5173/voter-imports/"
            "imports/test/job/voters.csv?X-Amz-Signature=signed"
        )
    )

    procrastinate_mock = MagicMock()
    procrastinate_mock.open_async = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=None),
        )
    )

    from app.core.rate_limit import limiter

    original_enabled = limiter.enabled
    limiter.enabled = False

    with (
        patch("app.services.storage.StorageService", return_value=storage_mock),
        patch("app.tasks.procrastinate_app.procrastinate_app", procrastinate_mock),
        patch("app.core.security.JWKSManager"),
    ):
        yield storage_mock

    limiter.enabled = original_enabled


@pytest.fixture()
def _mock_settings():
    with patch("app.main.settings") as mock_s:
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_base_url = ""
        mock_s.zitadel_service_client_id = "client-id"
        mock_s.zitadel_service_client_secret = "client-secret"
        mock_s.cors_allowed_origins = ["*"]
        yield mock_s


def _build_app_with_overrides(mock_db: AsyncMock) -> object:
    app = create_app()
    app.dependency_overrides[get_current_user] = _make_user

    async def _get_db():
        yield mock_db

    async def _get_campaign_db(campaign_id: uuid.UUID):
        yield mock_db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_campaign_db
    return app


async def _post_initiate(app, *, origin: str | None = None):
    transport = httpx.ASGITransport(app=app)
    headers = {"origin": origin} if origin else None
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://test") as client,
    ):
        resp = await client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/imports",
            params={"original_filename": "voters.csv"},
            headers=headers,
        )
    return resp


def _request_with_headers(headers: list[tuple[bytes, bytes]]) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/campaigns/test/imports",
        "headers": headers,
        "query_string": b"",
        "path_params": {},
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def test_rewrite_presigned_url_uses_browser_origin_host():
    request = _request_with_headers(
        [(b"origin", b"https://kudzu.tailb56d83.ts.net:5173")]
    )

    rewritten = _rewrite_presigned_url_for_browser_origin(
        "http://localhost:5173/voter-imports/imports/test/job/voters.csv?X-Amz-Signature=abc",
        request,
    )

    assert rewritten.startswith(
        "https://kudzu.tailb56d83.ts.net:5173/voter-imports/imports/test/job/voters.csv?"
    )
    assert "X-Amz-Signature=abc" in rewritten


def test_rewrite_presigned_url_keeps_original_without_origin_header():
    request = _request_with_headers([])
    original = (
        "http://localhost:5173/voter-imports/imports/test/job/voters.csv"
        "?X-Amz-Signature=abc"
    )

    assert _rewrite_presigned_url_for_browser_origin(original, request) == original


@pytest.mark.asyncio()
async def test_initiate_import_rewrites_upload_url_to_request_origin(
    _mock_settings,
    _mock_infra,
):
    from app.services.zitadel import ZitadelService

    local_user = _make_local_user()
    mock_db = AsyncMock()
    mock_db.flush = AsyncMock()
    mock_db.add = MagicMock(side_effect=lambda job: setattr(job, "id", uuid.uuid4()))
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

    with (
        patch.object(
            ZitadelService,
            "_get_token",
            new_callable=AsyncMock,
            return_value="tok",
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.ADMIN,
        ),
    ):
        app = _build_app_with_overrides(mock_db)
        resp = await _post_initiate(
            app,
            origin="https://kudzu.tailb56d83.ts.net:5173",
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["upload_url"].startswith(
        "https://kudzu.tailb56d83.ts.net:5173/voter-imports/"
    )
    assert "X-Amz-Signature=signed" in data["upload_url"]
