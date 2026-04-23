"""Unit tests for invite API endpoints."""

from __future__ import annotations

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.security import (
    AuthenticatedUser,
    CampaignRole,
    get_current_user,
    get_current_user_dual,
)
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.invite import Invite
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
TEST_PROJECT_ID = "test-project-id"


@pytest.fixture(autouse=True)
def _patch_project_id(monkeypatch):
    """Pin zitadel_project_id so tests are environment-independent."""
    monkeypatch.setattr(settings, "zitadel_project_id", TEST_PROJECT_ID)


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
        expires_at=utcnow() + timedelta(days=7),
        accepted_at=None,
        revoked_at=None,
        created_by="user-1",
        created_at=utcnow(),
    )


def _mock_scalar_result(value):
    """Create a mock result for queries using result.scalar_one_or_none()."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_scalars_result(items):
    """Create a mock result for queries using result.scalars().all()."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _sync_results():
    """Mock execute results for ensure_user_synced (called by require_role)."""
    local_user = User(
        id="user-1",
        display_name="User user-1",
        email="admin@test.com",
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    return [
        _mock_scalar_result(local_user),  # user lookup
        _make_scalars_result([]),  # org lookup → empty
        _make_scalars_result([]),  # campaign fallback → empty
    ]


def _override_app(
    user: AuthenticatedUser | None = None,
    db: AsyncMock | None = None,
):
    """Create a test app with overridden dependencies."""
    app = create_app()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_current_user_dual] = lambda: user
    if db is not None:

        async def _get_db():
            yield db

        app.dependency_overrides[get_db] = _get_db
    return app


def _setup_role_resolution(mock_db, org_id="org-1", role="admin"):
    """Set up mock_db.scalar for resolve_campaign_role in campaign-scoped routes.

    With JWT fallback removed (D-07), a CampaignMember record must exist.
    The ``role`` parameter controls the resolved campaign role.
    The function also does an org lookup (Campaign + Organization) when
    user_org_id is set, so we provide a campaign with no organization_id
    to skip the OrganizationMember path.
    """
    member_mock = MagicMock()
    member_mock.role = role
    campaign_mock = MagicMock()
    campaign_mock.organization_id = None
    campaign_mock.zitadel_org_id = org_id
    mock_db.scalar = AsyncMock(
        side_effect=[
            "",  # ensure_user_synced RLS pre-check (empty → skip restore)
            member_mock,  # CampaignMember lookup → explicit member with role
            campaign_mock,  # Campaign lookup → for org role check
        ]
    )


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
        _setup_role_resolution(mock_db, role="viewer")
        mock_db.execute = AsyncMock(side_effect=_sync_results())

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
        _setup_role_resolution(mock_db)

        # Mock: sync results + no existing invite
        no_invite_result = _mock_scalar_result(None)
        mock_db.execute = AsyncMock(side_effect=_sync_results() + [no_invite_result])

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
    """POST /api/v1/invites/{token}/accept.

    Step 4: endpoint is now unauthenticated and takes {password, display_name}.
    Integration-shape tests for the full native flow live in
    ``test_invite_native_flow.py``; here we just verify the HTTP contract
    (payload validation + error passthrough).
    """

    async def test_rejects_missing_payload(self):
        """Accept without payload returns 422 (FastAPI validation)."""
        app = create_app()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = uuid.uuid4()
            resp = await client.post(f"/api/v1/invites/{token}/accept")

        assert resp.status_code == 422

    async def test_rejects_short_password(self):
        """Password <12 chars fails pydantic min_length before service runs."""
        app = create_app()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = uuid.uuid4()
            resp = await client.post(
                f"/api/v1/invites/{token}/accept",
                json={"password": "short", "display_name": "Test"},
            )
        assert resp.status_code == 422


class TestRevokeInviteEndpoint:
    """DELETE /api/v1/campaigns/{id}/invites/{invite_id}."""

    async def test_revoke_requires_admin(self, mock_db):
        """Viewer cannot revoke invites -- 403."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db)
        _setup_role_resolution(mock_db, role="viewer")
        mock_db.execute = AsyncMock(side_effect=_sync_results())

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
        _setup_role_resolution(mock_db)

        invite_result = _mock_scalar_result(invite)
        mock_db.execute = AsyncMock(side_effect=_sync_results() + [invite_result])

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/invites/{invite.id}"
            )

        assert resp.status_code == 204
