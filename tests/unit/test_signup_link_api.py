"""Unit tests for signup-link API endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI

from app.api.v1.signup_links import router
from app.core.errors import init_error_handlers
from app.core.security import AuthenticatedUser, CampaignRole
from app.db.session import get_db


def _make_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    init_error_handlers(app)
    return app


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="user-1",
        org_id="org-1",
        role=CampaignRole.ADMIN,
        email="admin@example.com",
        display_name="Admin User",
    )


def _make_link(**kwargs):
    link = MagicMock()
    link.id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    link.campaign_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    link.label = "Weekend volunteers"
    link.token = uuid.UUID("33333333-3333-3333-3333-333333333333")
    link.status = "active"
    link.expires_at = None
    link.disabled_at = None
    link.regenerated_at = None
    link.created_at = "2026-04-09T00:00:00Z"
    link.updated_at = "2026-04-09T00:00:00Z"
    for key, value in kwargs.items():
        setattr(link, key, value)
    return link


class TestSignupLinkApi:
    @pytest.mark.anyio
    async def test_public_resolver_returns_unavailable_when_service_misses(self):
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db

        with patch(
            "app.api.v1.signup_links.signup_link_service.get_public_link",
            new_callable=AsyncMock,
            return_value=(None, None, None),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://test",
            ) as client:
                response = await client.get(
                    "/public/signup-links/33333333-3333-3333-3333-333333333333"
                )

        assert response.status_code == 200
        assert response.json()["status"] == "unavailable"

    @pytest.mark.anyio
    async def test_public_resolver_returns_valid_payload(self):
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = _mock_get_db

        campaign = MagicMock()
        campaign.id = uuid.UUID("22222222-2222-2222-2222-222222222222")
        campaign.name = "Smith for Senate"
        campaign.candidate_name = "Alice Smith"
        campaign.jurisdiction_name = "California"
        campaign.election_date = None
        org = MagicMock()
        org.name = "CivicPulse PAC"

        with patch(
            "app.api.v1.signup_links.signup_link_service.get_public_link",
            new_callable=AsyncMock,
            return_value=(_make_link(), campaign, org),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://test",
            ) as client:
                response = await client.get(
                    "/public/signup-links/33333333-3333-3333-3333-333333333333"
                )

        body = response.json()
        assert response.status_code == 200
        assert body["status"] == "valid"
        assert body["campaign_name"] == "Smith for Senate"
        assert body["organization_name"] == "CivicPulse PAC"
