"""Unit tests for member management API endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser, CampaignRole, get_current_user
from app.core.time import utcnow
from app.db.session import get_db
from app.main import create_app
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
ORG_ID = "org-test-123"


def _make_user(
    user_id: str = "user-1",
    org_id: str = ORG_ID,
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


def _make_member(
    user_id: str = "member-1",
    campaign_id: uuid.UUID | None = None,
) -> CampaignMember:
    return CampaignMember(
        id=uuid.uuid4(),
        user_id=user_id,
        campaign_id=campaign_id or CAMPAIGN_ID,
        synced_at=utcnow(),
    )


def _make_local_user(user_id: str = "member-1") -> User:
    return User(
        id=user_id,
        display_name=f"User {user_id}",
        email=f"{user_id}@test.com",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _make_campaign(
    campaign_id: uuid.UUID | None = None,
    created_by: str = "owner-1",
) -> Campaign:
    return Campaign(
        id=campaign_id or CAMPAIGN_ID,
        zitadel_org_id=ORG_ID,
        name="Test Campaign",
        type=CampaignType.STATE,
        status=CampaignStatus.ACTIVE,
        created_by=created_by,
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _override_app(
    user: AuthenticatedUser | None = None,
    db: AsyncMock | None = None,
    zitadel: AsyncMock | None = None,
):
    """Create a test app with overridden dependencies."""
    app = create_app()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    if db is not None:

        async def _get_db():
            yield db

        app.dependency_overrides[get_db] = _get_db
    if zitadel is not None:
        app.state.zitadel_service = zitadel
    return app


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def mock_zitadel():
    z = AsyncMock()
    z.assign_project_role = AsyncMock()
    z.remove_project_role = AsyncMock()
    return z


class TestListMembers:
    """GET /api/v1/campaigns/{id}/members."""

    async def test_returns_members_with_roles(self, mock_db, mock_zitadel):
        """Viewer+ can list members."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        member = _make_member()
        member_user = _make_local_user()
        mock_result = MagicMock()
        mock_result.all.return_value = [(member, member_user)]
        mock_db.execute = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/members")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["user_id"] == "member-1"


class TestUpdateMemberRole:
    """PATCH /api/v1/campaigns/{id}/members/{user_id}/role."""

    async def test_owner_can_update_role(self, mock_db, mock_zitadel):
        """Owner can change roles below owner."""
        user = _make_user(role=CampaignRole.OWNER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        member = _make_member()
        member_user = _make_local_user()
        mock_result = MagicMock()
        mock_result.first.return_value = (member, member_user)
        mock_db.execute = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/members/member-1/role",
                json={"role": "manager"},
            )

        assert resp.status_code == 200
        assert resp.json()["role"] == "manager"

    async def test_owner_cannot_grant_owner_role(self, mock_db, mock_zitadel):
        """Owner cannot grant owner role via update -- must use transfer."""
        user = _make_user(role=CampaignRole.OWNER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/members/member-1/role",
                json={"role": "owner"},
            )

        assert resp.status_code == 400

    async def test_admin_cannot_promote_to_admin(self, mock_db, mock_zitadel):
        """Admin cannot promote to admin or above."""
        user = _make_user(role=CampaignRole.ADMIN)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/members/member-1/role",
                json={"role": "admin"},
            )

        assert resp.status_code == 403


class TestRemoveMember:
    """DELETE /api/v1/campaigns/{id}/members/{user_id}."""

    async def test_cannot_remove_owner(self, mock_db, mock_zitadel):
        """Cannot remove the campaign owner."""
        user = _make_user(role=CampaignRole.ADMIN)
        campaign = _make_campaign(created_by="owner-1")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # First execute: campaign lookup
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        mock_db.execute = AsyncMock(return_value=campaign_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/members/owner-1"
            )

        assert resp.status_code == 400

    async def test_admin_can_remove_regular_member(self, mock_db, mock_zitadel):
        """Admin can remove a non-owner member."""
        user = _make_user(role=CampaignRole.ADMIN)
        campaign = _make_campaign(created_by="owner-1")
        member = _make_member(user_id="regular-member")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # First call: campaign lookup, second: member lookup
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        member_result = MagicMock()
        member_result.scalar_one_or_none.return_value = member
        mock_db.execute = AsyncMock(side_effect=[campaign_result, member_result])

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/members/regular-member"
            )

        assert resp.status_code == 204


class TestTransferOwnership:
    """POST /api/v1/campaigns/{id}/transfer-ownership."""

    async def test_owner_can_transfer(self, mock_db, mock_zitadel):
        """Owner can transfer ownership to existing member."""
        user = _make_user(user_id="owner-1", role=CampaignRole.OWNER)
        campaign = _make_campaign(created_by="owner-1")
        target_member = _make_member(user_id="new-owner")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        target_result = MagicMock()
        target_result.scalar_one_or_none.return_value = target_member
        mock_db.execute = AsyncMock(side_effect=[campaign_result, target_result])

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/transfer-ownership",
                json={"new_owner_id": "new-owner"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["new_owner_id"] == "new-owner"
        mock_zitadel.assign_project_role.assert_awaited()
        mock_zitadel.remove_project_role.assert_awaited()

    async def test_non_owner_cannot_transfer(self, mock_db, mock_zitadel):
        """Non-owner gets 403."""
        user = _make_user(role=CampaignRole.ADMIN)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/transfer-ownership",
                json={"new_owner_id": "someone"},
            )

        assert resp.status_code == 403
