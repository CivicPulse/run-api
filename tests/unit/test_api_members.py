"""Unit tests for member management API endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_campaign_db
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
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.user import User

CAMPAIGN_ID = uuid.uuid4()
ORG_ID = "org-test-123"
TEST_PROJECT_ID = "test-project-id"


@pytest.fixture(autouse=True)
def _patch_project_id(monkeypatch):
    """Pin zitadel_project_id so tests are environment-independent."""
    monkeypatch.setattr(settings, "zitadel_project_id", TEST_PROJECT_ID)


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
    role: str | None = None,
) -> CampaignMember:
    return CampaignMember(
        id=uuid.uuid4(),
        user_id=user_id,
        campaign_id=campaign_id or CAMPAIGN_ID,
        synced_at=utcnow(),
        role=role,
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


def _sync_results(
    user_id: str = "user-1",
    display_name: str | None = None,
    email: str = "admin@test.com",
):
    """Mock execute results for ensure_user_synced (called by require_role)."""
    local_user = User(
        id=user_id,
        display_name=display_name or f"User {user_id}",
        email=email,
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
    zitadel: AsyncMock | None = None,
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
        app.dependency_overrides[get_campaign_db] = _get_db
    if zitadel is not None:
        app.state.zitadel_service = zitadel
    return app


def _setup_role_resolution(mock_db, org_id=ORG_ID, role="admin"):
    """Set up mock_db.scalar for resolve_campaign_role in campaign-scoped routes.

    With JWT fallback removed (D-07), a CampaignMember record must exist.
    The function also does an org lookup when user_org_id is set, so we
    provide a campaign with no organization_id to skip OrganizationMember.
    """
    member_mock = MagicMock()
    member_mock.role = role
    campaign_mock = MagicMock()
    campaign_mock.organization_id = None
    campaign_mock.zitadel_org_id = org_id
    mock_db.scalar = AsyncMock(
        side_effect=[
            # ensure_user_synced RLS context read (current_setting)
            "",
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
    db.delete = AsyncMock()
    return db


@pytest.fixture
def mock_zitadel():
    z = AsyncMock()
    z.assign_project_role = AsyncMock()
    z.remove_project_role = AsyncMock()
    z.remove_all_project_roles = AsyncMock()
    return z


class TestListMembers:
    """GET /api/v1/campaigns/{id}/members."""

    async def test_returns_members_with_roles(self, mock_db, mock_zitadel):
        """Viewer+ can list members. Members with no role default to 'viewer'."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="viewer")
        # list_members route calls ensure_user_synced a second time, so
        # prepend an extra RLS pre-check scalar for that second pass.
        _member_mock = MagicMock()
        _member_mock.role = "viewer"
        _campaign_mock = MagicMock()
        _campaign_mock.organization_id = None
        _campaign_mock.zitadel_org_id = ORG_ID
        # Order: pass1 RLS, resolve_campaign_role (member + campaign),
        # then pass2 RLS (from route handler's ensure_user_synced).
        mock_db.scalar = AsyncMock(side_effect=["", _member_mock, _campaign_mock, ""])

        member = _make_member()  # role=None defaults to "viewer" in response
        member_user = _make_local_user()
        mock_result = MagicMock()
        mock_result.all.return_value = [(member, member_user)]
        mock_db.execute = AsyncMock(
            side_effect=_sync_results() + _sync_results() + [mock_result]
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/members")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["user_id"] == "member-1"
        assert data[0]["role"] == "viewer"

    async def test_returns_member_explicit_role(self, mock_db, mock_zitadel):
        """Members with an explicit role return that role."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="viewer")
        # list_members calls ensure_user_synced twice; prepend extra RLS scalar.
        _member_mock = MagicMock()
        _member_mock.role = "viewer"
        _campaign_mock = MagicMock()
        _campaign_mock.organization_id = None
        _campaign_mock.zitadel_org_id = ORG_ID
        # Order: pass1 RLS, resolve_campaign_role (member + campaign),
        # then pass2 RLS (from route handler's ensure_user_synced).
        mock_db.scalar = AsyncMock(side_effect=["", _member_mock, _campaign_mock, ""])

        member = _make_member(role="admin")
        member_user = _make_local_user()
        mock_result = MagicMock()
        mock_result.all.return_value = [(member, member_user)]
        mock_db.execute = AsyncMock(
            side_effect=_sync_results() + _sync_results() + [mock_result]
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/campaigns/{CAMPAIGN_ID}/members")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["role"] == "admin"


class TestUpdateMemberRole:
    """PATCH /api/v1/campaigns/{id}/members/{user_id}/role."""

    async def test_owner_can_update_role(self, mock_db, mock_zitadel):
        """Owner can change roles below owner."""
        user = _make_user(role=CampaignRole.OWNER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="owner")

        member = _make_member()
        member_user = _make_local_user()
        campaign = _make_campaign()

        member_result = MagicMock()
        member_result.first.return_value = (member, member_user)
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        mock_db.execute = AsyncMock(
            side_effect=_sync_results() + [member_result, campaign_result]
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/members/member-1/role",
                json={"role": "manager"},
            )

        assert resp.status_code == 200
        assert resp.json()["role"] == "manager"
        mock_zitadel.remove_all_project_roles.assert_awaited_once_with(
            TEST_PROJECT_ID,
            "member-1",
            org_id=ORG_ID,
        )
        mock_zitadel.assign_project_role.assert_awaited_once_with(
            TEST_PROJECT_ID,
            "member-1",
            "manager",
            org_id=ORG_ID,
        )

    async def test_owner_cannot_grant_owner_role(self, mock_db, mock_zitadel):
        """Owner cannot grant owner role via update -- must use transfer."""
        user = _make_user(role=CampaignRole.OWNER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="owner")
        mock_db.execute = AsyncMock(side_effect=_sync_results())

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
        _setup_role_resolution(mock_db)
        mock_db.execute = AsyncMock(side_effect=_sync_results())

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
        _setup_role_resolution(mock_db)

        # First execute: sync results + campaign lookup
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        mock_db.execute = AsyncMock(side_effect=_sync_results() + [campaign_result])

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
        _setup_role_resolution(mock_db)

        # Sync results + campaign lookup + member lookup
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        member_result = MagicMock()
        member_result.scalar_one_or_none.return_value = member
        mock_db.execute = AsyncMock(
            side_effect=_sync_results() + [campaign_result, member_result]
        )

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
        owner_member = _make_member(user_id="owner-1", role="owner")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="owner")

        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        target_result = MagicMock()
        target_result.scalar_one_or_none.return_value = target_member
        owner_member_result = MagicMock()
        owner_member_result.scalar_one_or_none.return_value = owner_member
        mock_db.execute = AsyncMock(
            side_effect=_sync_results(user_id="owner-1")
            + [campaign_result, target_result, owner_member_result]
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/transfer-ownership",
                json={"new_owner_id": "new-owner"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["new_owner_id"] == "new-owner"
        # Transfer makes 2 remove + 2 assign calls:
        # 1. Demote old owner from "owner" → assign "admin"
        # 2. Remove target's old role → assign "owner"
        assert mock_zitadel.remove_project_role.await_count == 2
        mock_zitadel.remove_project_role.assert_any_await(
            TEST_PROJECT_ID, "owner-1", "owner", org_id=ORG_ID
        )
        mock_zitadel.remove_project_role.assert_any_await(
            TEST_PROJECT_ID, "new-owner", "viewer", org_id=ORG_ID
        )
        assert mock_zitadel.assign_project_role.await_count == 2
        mock_zitadel.assign_project_role.assert_any_await(
            TEST_PROJECT_ID, "owner-1", "admin", org_id=ORG_ID
        )
        mock_zitadel.assign_project_role.assert_any_await(
            TEST_PROJECT_ID, "new-owner", "owner", org_id=ORG_ID
        )

    async def test_non_owner_cannot_transfer(self, mock_db, mock_zitadel):
        """Non-owner gets 403."""
        user = _make_user(role=CampaignRole.ADMIN)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db)
        mock_db.execute = AsyncMock(side_effect=_sync_results())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/transfer-ownership",
                json={"new_owner_id": "someone"},
            )

        assert resp.status_code == 403

    async def test_commit_failure_triggers_zitadel_rollback(
        self, mock_db, mock_zitadel
    ):
        """DB commit failure should trigger compensating ZITADEL role reversal."""
        user = _make_user(user_id="owner-1", role=CampaignRole.OWNER)
        campaign = _make_campaign(created_by="owner-1")
        target_member = _make_member(user_id="new-owner", role="manager")
        owner_member = _make_member(user_id="owner-1", role="owner")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="owner")

        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        target_result = MagicMock()
        target_result.scalar_one_or_none.return_value = target_member
        owner_member_result = MagicMock()
        owner_member_result.scalar_one_or_none.return_value = owner_member
        mock_db.execute = AsyncMock(
            side_effect=_sync_results(user_id="owner-1")
            + [campaign_result, target_result, owner_member_result]
        )

        # Make db.commit() raise to simulate a DB failure
        mock_db.commit = AsyncMock(side_effect=Exception("DB write failed"))
        mock_db.rollback = AsyncMock()

        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/transfer-ownership",
                json={"new_owner_id": "new-owner"},
            )

        # The endpoint should return 500 due to the unhandled re-raise
        assert resp.status_code == 500

        # DB rollback should have been called
        mock_db.rollback.assert_awaited_once()

        # Forward: 2 removes + 2 assigns.
        # Compensation: inverse of all 4 ops (2 more removes + 2 more assigns).
        # Total: 4 removes + 4 assigns.
        assert mock_zitadel.remove_project_role.await_count == 4
        assert mock_zitadel.assign_project_role.await_count == 4

        # Forward calls:
        mock_zitadel.remove_project_role.assert_any_await(
            TEST_PROJECT_ID, "owner-1", "owner", org_id=ORG_ID
        )
        mock_zitadel.remove_project_role.assert_any_await(
            TEST_PROJECT_ID, "new-owner", "manager", org_id=ORG_ID
        )
        mock_zitadel.assign_project_role.assert_any_await(
            TEST_PROJECT_ID, "owner-1", "admin", org_id=ORG_ID
        )
        mock_zitadel.assign_project_role.assert_any_await(
            TEST_PROJECT_ID, "new-owner", "owner", org_id=ORG_ID
        )

        # Inverse compensation calls:
        # Inverse of op 4 (assign owner to target): remove owner from target
        mock_zitadel.remove_project_role.assert_any_await(
            TEST_PROJECT_ID, "new-owner", "owner", org_id=ORG_ID
        )
        # Inverse of op 3 (remove target_old_role): re-grant it
        mock_zitadel.assign_project_role.assert_any_await(
            TEST_PROJECT_ID, "new-owner", "manager", org_id=ORG_ID
        )
        # Inverse of op 2 (assign admin to current): remove admin
        mock_zitadel.remove_project_role.assert_any_await(
            TEST_PROJECT_ID, "owner-1", "admin", org_id=ORG_ID
        )
        # Inverse of op 1 (remove owner from current): re-grant owner
        mock_zitadel.assign_project_role.assert_any_await(
            TEST_PROJECT_ID, "owner-1", "owner", org_id=ORG_ID
        )

    async def test_transfer_ownership_partial_compensation_failure(
        self, mock_db, mock_zitadel
    ):
        """One compensation step failing does not stop remaining reversal steps."""
        user = _make_user(user_id="owner-1", role=CampaignRole.OWNER)
        campaign = _make_campaign(created_by="owner-1")
        target_member = _make_member(user_id="new-owner", role="manager")
        owner_member = _make_member(user_id="owner-1", role="owner")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)
        _setup_role_resolution(mock_db, role="owner")

        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign
        target_result = MagicMock()
        target_result.scalar_one_or_none.return_value = target_member
        owner_member_result = MagicMock()
        owner_member_result.scalar_one_or_none.return_value = owner_member
        mock_db.execute = AsyncMock(
            side_effect=_sync_results(user_id="owner-1")
            + [campaign_result, target_result, owner_member_result]
        )

        mock_db.commit = AsyncMock(side_effect=Exception("DB write failed"))
        mock_db.rollback = AsyncMock()

        # 4 forward calls succeed; then compensation phase:
        #   1st compensation call (remove owner from target) fails.
        #   remaining compensation calls must still fire.
        call_count = {"remove": 0, "assign": 0}
        original_remove = mock_zitadel.remove_project_role
        original_assign = mock_zitadel.assign_project_role

        async def remove_side_effect(*args, **kwargs):
            call_count["remove"] += 1
            # Forward removes are calls 1, 2; compensation removes are 3, 4.
            # Fail the first compensation remove (call 3).
            if call_count["remove"] == 3:
                raise Exception("zitadel transient failure")
            return None

        async def assign_side_effect(*args, **kwargs):
            call_count["assign"] += 1
            return None

        mock_zitadel.remove_project_role = AsyncMock(side_effect=remove_side_effect)
        mock_zitadel.assign_project_role = AsyncMock(side_effect=assign_side_effect)

        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/campaigns/{CAMPAIGN_ID}/transfer-ownership",
                json={"new_owner_id": "new-owner"},
            )

        # Original commit error should surface as 500
        assert resp.status_code == 500
        mock_db.rollback.assert_awaited_once()

        # All 4 compensation steps attempted despite 1 failing
        # Total removes = 2 forward + 2 compensation = 4 calls attempted
        # Total assigns = 2 forward + 2 compensation = 4 calls attempted
        assert call_count["remove"] == 4
        assert call_count["assign"] == 4
        # Touch the originals to avoid "unused" warnings
        _ = original_remove
        _ = original_assign
