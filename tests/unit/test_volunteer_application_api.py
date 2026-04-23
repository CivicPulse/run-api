"""Unit tests for volunteer application API endpoints."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI

from app.api.v1.volunteer_applications import router
from app.core.errors import init_error_handlers
from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    get_current_user,
    get_current_user_dual,
    get_optional_current_user,
)
from app.db.session import get_db


def _make_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    init_error_handlers(app)
    app.state.zitadel_service = AsyncMock()
    return app


def _make_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id="user-1",
        org_id="org-1",
        role=CampaignRole.ADMIN,
        email="pat@example.com",
        display_name="Pat Doe",
    )


class TestVolunteerApplicationApi:
    @pytest.mark.anyio
    async def test_get_current_application_returns_none_status(self):
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        async def _mock_user():
            return _make_user()

        app.dependency_overrides[get_db] = _mock_get_db
        app.dependency_overrides[get_current_user] = _mock_user
        app.dependency_overrides[get_current_user_dual] = _mock_user

        with patch(
            "app.api.v1.volunteer_applications.volunteer_application_service.get_current_application",
            new_callable=AsyncMock,
            return_value=None,
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://test",
            ) as client:
                response = await client.get(
                    f"/public/signup-links/{uuid.uuid4()}/application"
                )

        assert response.status_code == 200
        assert response.json()["status"] == "none"

    @pytest.mark.anyio
    async def test_submit_application_returns_created_payload(self):
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        async def _mock_user():
            return AuthenticatedUser(
                id="user-1",
                org_id="org-1",
                role=CampaignRole.VIEWER,
                email="pat@example.com",
                display_name="Pat Doe",
            )

        app.dependency_overrides[get_db] = _mock_get_db
        app.dependency_overrides[get_optional_current_user] = _mock_user

        application_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        signup_link_id = uuid.uuid4()
        application = SimpleNamespace(
            id=application_id,
            campaign_id=campaign_id,
            signup_link_id=signup_link_id,
            signup_link_label="Weekend volunteers",
            applicant_user_id="user-1",
            first_name="Pat",
            last_name="Doe",
            email="pat@example.com",
            phone=None,
            notes=None,
            status="pending",
            reviewed_by=None,
            reviewed_at=None,
            rejection_reason=None,
            review_context=None,
            created_at="2026-04-09T00:00:00Z",
            updated_at="2026-04-09T00:00:00Z",
        )

        with patch(
            "app.api.v1.volunteer_applications.volunteer_application_service.submit_application",
            new_callable=AsyncMock,
            return_value=application,
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://test",
            ) as client:
                response = await client.post(
                    f"/public/signup-links/{uuid.uuid4()}/applications",
                    json={
                        "first_name": "Pat",
                        "last_name": "Doe",
                        "email": "pat@example.com",
                    },
                )

        assert response.status_code == 201
        assert response.json()["status"] == "pending"

    @pytest.mark.anyio
    async def test_submit_application_allows_anonymous_requests(self):
        app = _make_test_app()

        async def _mock_get_db():
            yield AsyncMock()

        async def _mock_optional_user():
            return None

        app.dependency_overrides[get_db] = _mock_get_db
        app.dependency_overrides[get_optional_current_user] = _mock_optional_user

        application_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        signup_link_id = uuid.uuid4()
        application = SimpleNamespace(
            id=application_id,
            campaign_id=campaign_id,
            signup_link_id=signup_link_id,
            signup_link_label="Weekend volunteers",
            applicant_user_id=None,
            first_name="Pat",
            last_name="Doe",
            email="pat@example.com",
            phone=None,
            notes=None,
            status="pending",
            reviewed_by=None,
            reviewed_at=None,
            rejection_reason=None,
            review_context=None,
            created_at="2026-04-09T00:00:00Z",
            updated_at="2026-04-09T00:00:00Z",
        )

        with patch(
            "app.api.v1.volunteer_applications.volunteer_application_service.submit_application",
            new_callable=AsyncMock,
            return_value=application,
        ) as submit_mock:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://test",
            ) as client:
                response = await client.post(
                    f"/public/signup-links/{uuid.uuid4()}/applications",
                    json={
                        "first_name": "Pat",
                        "last_name": "Doe",
                        "email": "pat@example.com",
                    },
                )

        assert response.status_code == 201
        submit_mock.assert_awaited_once()
        assert submit_mock.await_args.kwargs["applicant_user_id"] is None
