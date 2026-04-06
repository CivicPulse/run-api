"""REL-10 (H2): Assert import filename is sanitized before becoming an S3 key.

This test SHOULD FAIL on current main — app/api/v1/imports.py line 136
embeds the raw user-supplied original_filename directly into the S3 key.
Plan 76-03 will strip path separators/null bytes/backslashes and prepend
a UUID so the key is always safe.
"""

from __future__ import annotations

import re
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
USER_ID = "user-import-sanitize-1"


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        org_id="org-sanitize-test",
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


def _build_app_with_overrides(mock_db) -> object:
    app = create_app()
    app.dependency_overrides[get_current_user] = _make_user

    async def _get_db():
        yield mock_db

    async def _get_campaign_db(campaign_id: uuid.UUID):
        yield mock_db

    async def _noop_ensure_user_synced(*args, **kwargs):
        return None

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_campaign_db] = _get_campaign_db
    app.dependency_overrides[ensure_user_synced] = _noop_ensure_user_synced
    return app


@pytest.fixture()
def _disable_rate_limit():
    from app.core.rate_limit import limiter

    original = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original


async def _initiate_import(app, *, original_filename: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://test") as client,
    ):
        return await client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/imports",
            params={"original_filename": original_filename},
        )


async def _post_with_mocks(original_filename: str) -> dict:
    from app.services.zitadel import ZitadelService

    storage_mock = MagicMock()
    storage_mock.ensure_bucket = AsyncMock()
    storage_mock.generate_upload_url = AsyncMock(return_value="https://stub/upload")

    procrastinate_mock = MagicMock()
    procrastinate_mock.open_async = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=None),
        )
    )

    local_user = _make_local_user()
    mock_db = AsyncMock()
    mock_db.flush = AsyncMock()
    mock_db.add = MagicMock(side_effect=lambda job: setattr(job, "id", uuid.uuid4()))
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

    with (
        patch("app.main.settings") as mock_s,
        patch("app.services.storage.StorageService", return_value=storage_mock),
        patch("app.tasks.procrastinate_app.procrastinate_app", procrastinate_mock),
        patch("app.core.security.JWKSManager"),
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
        mock_s.app_name = "test"
        mock_s.zitadel_issuer = "https://auth.example.com"
        mock_s.zitadel_base_url = ""
        mock_s.zitadel_service_client_id = "client-id"
        mock_s.zitadel_service_client_secret = "client-secret"
        mock_s.cors_allowed_origins = ["*"]
        app = _build_app_with_overrides(mock_db)
        resp = await _initiate_import(app, original_filename=original_filename)

    assert resp.status_code == 201, (
        f"initiate_import returned {resp.status_code}: {resp.text}"
    )
    return resp.json()


@pytest.mark.asyncio
async def test_initiate_import_strips_path_traversal(_disable_rate_limit) -> None:
    """'../../../etc/passwd' must not appear verbatim in file_key."""
    data = await _post_with_mocks("../../../etc/passwd")
    file_key = data["file_key"]
    assert ".." not in file_key, (
        f"file_key must not contain '..' path traversal: {file_key!r}"
    )
    assert "/etc/passwd" not in file_key, (
        f"file_key must not contain the traversal target '/etc/passwd': {file_key!r}"
    )


@pytest.mark.asyncio
async def test_initiate_import_strips_null_bytes(_disable_rate_limit) -> None:
    """Null bytes must be stripped from the filename before S3 key use."""
    data = await _post_with_mocks("foo\x00.csv")
    file_key = data["file_key"]
    assert "\x00" not in file_key, f"file_key must not contain null bytes: {file_key!r}"


@pytest.mark.asyncio
async def test_initiate_import_strips_backslashes(_disable_rate_limit) -> None:
    """Windows-style backslash paths must be stripped from S3 keys."""
    data = await _post_with_mocks("C:\\Windows\\evil.csv")
    file_key = data["file_key"]
    assert "\\" not in file_key, f"file_key must not contain backslashes: {file_key!r}"


@pytest.mark.asyncio
async def test_initiate_import_prepends_uuid_to_basename(_disable_rate_limit) -> None:
    """Final filename segment must begin with a UUID prefix for uniqueness."""
    data = await _post_with_mocks("voters.csv")
    file_key = data["file_key"]
    basename = file_key.rsplit("/", 1)[-1]
    assert re.match(
        r"^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}"
        r"[-_].+$",
        basename,
    ), f"file_key basename must start with a UUID prefix, got: {basename!r}"
