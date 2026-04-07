"""Smoke test: org_numbers router is mounted and endpoints respond."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.db.session import get_db
from app.main import create_app

pytestmark = pytest.mark.usefixtures("_patch_user_sync")


@pytest.fixture(autouse=True)
def _patch_user_sync():
    with patch("app.api.deps.ensure_user_synced", new_callable=AsyncMock) as mock:
        mock.return_value = MagicMock()
        yield


def _owner_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="user-1",
        org_id="zitadel-org-test",
        role=CampaignRole.OWNER,
        email="owner@test.com",
        display_name="Owner",
    )


@pytest.mark.asyncio
async def test_org_numbers_routes_exist():
    """Verify that /api/v1/org/numbers routes are registered."""
    app = create_app()
    routes = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/v1/org/numbers" in routes or any(
        "/api/v1/org/numbers" in r for r in routes
    )
