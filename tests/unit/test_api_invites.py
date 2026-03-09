"""Unit tests for invite API endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.invite import Invite

CAMPAIGN_ID = uuid.uuid4()


def _make_user(
    user_id: str = "user-1",
    org_id: str = "org-1",
    role: CampaignRole = CampaignRole.ADMIN,
    email: str = "admin@test.com",
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=email,
        display_name=f"User {user_id}",
    )


def _make_invite(
    campaign_id: uuid.UUID | None = None,
    email: str = "invitee@test.com",
    role: str = "manager",
    token: uuid.UUID | None = None,
) -> Invite:
    return Invite(
        id=uuid.uuid4(),
        campaign_id=campaign_id or CAMPAIGN_ID,
        email=email,
        role=role,
        token=token or uuid.uuid4(),
        expires_at=datetime.now(UTC) + timedelta(days=7),
        accepted_at=None,
        revoked_at=None,
        created_by="user-1",
        created_at=datetime.now(UTC),
    )


def _override_app(
    user: AuthenticatedUser | None = None,
    db: AsyncMock | None = None,
):
    """Create a test app with overridden dependencies."""
    app = create_app()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    if db is not None:

        async def _get_db():
            yield db

        app.dependency_overrides[get_db] = _get_db
    return app


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


class TestCreateInviteEndpoint:
    """POST /api/v1/campaigns/{id}/invites."""

    async def test_requires_admin_role(self, mock_db):
        """Viewer cannot create invites -- returns 403."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/invites",
                json={"email": "test@example.com", "role": "manager"},
            )

        assert resp.status_code == 403

    async def test_create_invite_success(self, mock_db):
        """Admin can create invite -- returns 201."""
        user = _make_user(role=CampaignRole.ADMIN)
        app = _override_app(user=user, db=mock_db)

        # Mock: no existing invite
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/invites",
                json={"email": "new@example.com", "role": "volunteer"},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "new@example.com"
        assert data["role"] == "volunteer"
        assert "token" in data


class TestAcceptInviteEndpoint:
    """POST /api/v1/invites/{token}/accept."""

    async def test_requires_authentication(self):
        """Unauthenticated request returns 401/403."""
        app = create_app()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = uuid.uuid4()
            resp = await client.post(f"/api/v1/invites/{token}/accept")

        assert resp.status_code in (401, 403)

    async def test_accept_invite_success(self, mock_db):
        """Authenticated user can accept valid invite."""
        invite = _make_invite(email="user@test.com")
        user = _make_user(email="user@test.com", role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db)

        # Mock zitadel on app state
        mock_zitadel = AsyncMock()
        mock_zitadel.assign_project_role = AsyncMock()
        app.state.zitadel_service = mock_zitadel

        # validate_invite lookup, member lookup
        validate_result = MagicMock()
        validate_result.scalar_one_or_none.return_value = invite
        member_result = MagicMock()
        member_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(
            side_effect=[validate_result, member_result]
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/invites/{invite.token}/accept"
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Invite accepted successfully"
        assert data["role"] == "manager"


class TestRevokeInviteEndpoint:
    """DELETE /api/v1/campaigns/{id}/invites/{invite_id}."""

    async def test_revoke_requires_admin(self, mock_db):
        """Viewer cannot revoke invites -- 403."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db)

        invite_id = uuid.uuid4()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/invites/{invite_id}"
            )

        assert resp.status_code == 403

    async def test_revoke_invite_success(self, mock_db):
        """Admin can revoke invite -- 204."""
        user = _make_user(role=CampaignRole.ADMIN)
        invite = _make_invite()
        app = _override_app(user=user, db=mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = invite
        mock_db.execute = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/invites/{invite.id}"
            )

        assert resp.status_code == 204
