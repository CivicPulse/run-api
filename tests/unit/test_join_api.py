"""Unit tests for app.api.v1.join — GET /join/{slug} and POST /join/{slug}/register.

All external dependencies (JoinService, get_current_user, get_db) are mocked
so no database or ZITADEL connection is required.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI

from app.api.v1.join import router
from app.core.errors import CampaignNotFoundError, init_error_handlers
from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.db.session import get_db
from app.models.campaign import Campaign, CampaignStatus

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_test_app() -> FastAPI:
    """Minimal FastAPI app with the join router and error handlers."""
    app = FastAPI()
    app.include_router(router)
    init_error_handlers(app)

    # Inject a dummy zitadel_service into app.state so the register endpoint
    # can access request.app.state.zitadel_service without crashing.
    app.state.zitadel_service = AsyncMock()
    return app


def _make_campaign(**kwargs) -> Campaign:
    c = MagicMock(spec=Campaign)
    c.id = uuid.UUID("12345678-1234-5678-1234-567812345678")
    c.slug = "smith-for-senate"
    c.name = "Smith for Senate"
    c.candidate_name = "Alice Smith"
    c.party_affiliation = "Independent"
    c.election_date = None
    c.type = "state"
    c.jurisdiction_name = "California"
    c.status = CampaignStatus.ACTIVE
    for k, v in kwargs.items():
        setattr(c, k, v)
    return c


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="user-abc",
        org_id="org-xyz",
        role=CampaignRole.VIEWER,
        email="test@example.com",
        display_name="Test User",
    )


# ---------------------------------------------------------------------------
# GET /join/{slug}
# ---------------------------------------------------------------------------


class TestGetCampaignPublicInfo:
    @pytest.mark.anyio
    async def test_returns_200_for_active_campaign(self):
        campaign = _make_campaign()
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db

        with patch(
            "app.api.v1.join.join_service.get_campaign_public_info",
            new_callable=AsyncMock,
            return_value=campaign,
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as c:
                resp = await c.get("/join/smith-for-senate")

        assert resp.status_code == 200
        body = resp.json()
        assert body["slug"] == "smith-for-senate"
        assert body["name"] == "Smith for Senate"
        assert body["candidate_name"] == "Alice Smith"

    @pytest.mark.anyio
    async def test_returns_404_when_campaign_not_found(self):
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db

        with patch(
            "app.api.v1.join.join_service.get_campaign_public_info",
            new_callable=AsyncMock,
            side_effect=CampaignNotFoundError(uuid.UUID(int=0)),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as c:
                resp = await c.get("/join/nonexistent-slug")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /join/{slug}/register
# ---------------------------------------------------------------------------


class TestRegisterVolunteer:
    @pytest.mark.anyio
    async def test_returns_201_on_success(self):
        campaign = _make_campaign()
        app = _make_test_app()
        user = _make_user()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db
        app.dependency_overrides[get_current_user] = lambda: user

        with patch(
            "app.api.v1.join.join_service.register_volunteer",
            new_callable=AsyncMock,
            return_value={
                "campaign_id": str(campaign.id),
                "campaign_slug": campaign.slug,
                "volunteer_id": str(uuid.uuid4()),
            },
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as c:
                resp = await c.post(
                    "/join/smith-for-senate/register",
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 201
        body = resp.json()
        assert body["campaign_slug"] == "smith-for-senate"
        assert body["message"] == "Successfully registered as a volunteer."

    @pytest.mark.anyio
    async def test_returns_404_when_campaign_not_found(self):
        app = _make_test_app()
        user = _make_user()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db
        app.dependency_overrides[get_current_user] = lambda: user

        with patch(
            "app.api.v1.join.join_service.register_volunteer",
            new_callable=AsyncMock,
            side_effect=CampaignNotFoundError(uuid.UUID(int=0)),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as c:
                resp = await c.post(
                    "/join/no-such-slug/register",
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 404

    @pytest.mark.anyio
    async def test_returns_409_when_already_registered(self):
        campaign_id = str(uuid.uuid4())
        app = _make_test_app()
        user = _make_user()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db
        app.dependency_overrides[get_current_user] = lambda: user

        with patch(
            "app.api.v1.join.join_service.register_volunteer",
            new_callable=AsyncMock,
            side_effect=ValueError(f"already_registered:{campaign_id}"),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as c:
                resp = await c.post(
                    "/join/smith-for-senate/register",
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 409
        body = resp.json()
        assert body["campaign_id"] == campaign_id
