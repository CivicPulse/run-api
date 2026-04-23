"""REL-09 (H1): Assert DNC bulk import rejects CSVs larger than 10 MB.

This test SHOULD FAIL on current main — app/api/v1/dnc.py reads the
entire upload into memory with no cap. Plan 76-03 will add a 10 MB limit
enforced via Content-Length + streaming read cap.
"""

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
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
USER_ID = "user-dnc-upload-1"


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        org_id="org-dnc-test",
        role=CampaignRole.MANAGER,
        email="manager@test.com",
        display_name="Manager User",
    )


def _make_local_user() -> User:
    return User(
        id=USER_ID,
        display_name="Manager User",
        email="manager@test.com",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _build_app_with_overrides():
    local_user = _make_local_user()
    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=local_user))
    )

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


@pytest.fixture()
def _disable_rate_limit():
    from app.core.rate_limit import limiter

    original = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original


async def _post_dnc_import(app, *, payload: bytes):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/dnc/import",
            files={"file": ("dnc.csv", payload, "text/csv")},
        )


@pytest.mark.asyncio
async def test_dnc_bulk_import_rejects_over_10mb(_disable_rate_limit) -> None:
    """An 11 MB DNC CSV upload must return HTTP 413 Payload Too Large."""
    mock_result = MagicMock()
    mock_result.inserted = 0
    mock_result.skipped = 0
    mock_result.errors = []
    with (
        patch(
            "app.services.dnc.DNCService.bulk_import",
            new_callable=AsyncMock,
            return_value=mock_result,
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.MANAGER,
        ),
        patch("app.core.security.JWKSManager"),
    ):
        app = _build_app_with_overrides()
        # 11 MB of CSV-ish content
        oversize = b"phone_number\n" + (b"5551234567\n" * ((11 * 1024 * 1024) // 11))
        resp = await _post_dnc_import(app, payload=oversize)

    assert resp.status_code == 413, (
        f"Expected 413 Payload Too Large for 11 MB DNC CSV upload, got "
        f"{resp.status_code}. REL-09 requires a 10 MB cap."
    )


@pytest.mark.asyncio
async def test_dnc_bulk_import_accepts_under_10mb(_disable_rate_limit) -> None:
    """A ~1 KB DNC CSV upload must NOT be rejected for size."""
    mock_result = MagicMock()
    mock_result.inserted = 1
    mock_result.skipped = 0
    mock_result.errors = []
    with (
        patch(
            "app.services.dnc.DNCService.bulk_import",
            new_callable=AsyncMock,
            return_value=mock_result,
        ),
        patch(
            "app.core.security.resolve_campaign_role",
            new_callable=AsyncMock,
            return_value=CampaignRole.MANAGER,
        ),
        patch("app.core.security.JWKSManager"),
    ):
        app = _build_app_with_overrides()
        small = b"phone_number\n5551234567\n"
        resp = await _post_dnc_import(app, payload=small)

    assert resp.status_code != 413, (
        f"Small DNC CSV upload should not hit size limit, got {resp.status_code}."
    )
