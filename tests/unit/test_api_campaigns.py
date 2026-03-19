"""Unit tests for campaign API endpoints, user sync, and /me endpoints."""

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
from app.models.user import User

# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------

CAMPAIGN_ID = uuid.uuid4()
ORG_ID = "zitadel-org-test-123"


def _make_user(
    user_id: str = "user-test-1",
    org_id: str = ORG_ID,
    role: CampaignRole = CampaignRole.ADMIN,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test User {user_id}",
    )


def _make_campaign(
    campaign_id: uuid.UUID | None = None,
    org_id: str = ORG_ID,
    created_by: str = "user-test-1",
) -> Campaign:
    return Campaign(
        id=campaign_id or CAMPAIGN_ID,
        zitadel_org_id=org_id,
        name="Test Campaign",
        type=CampaignType.STATE,
        status=CampaignStatus.ACTIVE,
        created_by=created_by,
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _make_local_user(user_id: str = "user-test-1") -> User:
    return User(
        id=user_id,
        display_name=f"Test User {user_id}",
        email=f"{user_id}@test.com",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _mock_result_with(value, method="scalar_one_or_none"):
    """Create a MagicMock result with the given return on the given method."""
    result = MagicMock()
    getattr(result, method).return_value = value
    return result


def _setup_user_sync_on_db(mock_db, local_user=None, campaign=None):
    """Set up mock_db.execute to handle ensure_user_synced calls.

    ensure_user_synced makes up to 4 execute calls (Phase 2):
    1. User lookup (scalar_one_or_none)
    2. Org lookup by zitadel_org_id (scalar_one_or_none) -- new in Phase 2
    3. Campaign lookup by org_id (scalar_one_or_none) -- fallback path when org is None
    4. CampaignMember lookup (scalar_one_or_none) -- only if campaign found

    In tests the org lookup returns None, so the fallback campaign lookup runs.

    Returns a list that can be extended with more execute results.
    """
    if local_user is None:
        local_user = _make_local_user()

    results = [
        _mock_result_with(local_user),  # user lookup
        _mock_result_with(None),  # org lookup (None = no Organization record yet)
        _mock_result_with(campaign),  # campaign lookup fallback (None = no campaign)
    ]
    if campaign is not None:
        results.append(_mock_result_with(MagicMock()))  # member lookup (exists)

    return results


def _setup_role_resolution(mock_db, campaign=None, extra_scalars=None):
    """Set up mock_db.scalar for resolve_campaign_role.

    resolve_campaign_role calls db.scalar() up to 3 times:
    1. CampaignMember.role lookup → None (no explicit override)
    2. Campaign lookup → campaign object (for org verification)
    3. Organization.zitadel_org_id (only if campaign.organization_id is set)

    In tests the campaign has no organization_id, so only 2 calls are needed.
    The campaign's zitadel_org_id is used directly for org matching.

    extra_scalars: additional db.scalar() return values for service-layer calls
    that also use scalar() (e.g. delete_campaign's sibling count check).
    """
    values = [
        None,  # CampaignMember.role → no explicit override
        campaign,  # Campaign lookup → for org matching
    ]
    if extra_scalars:
        values.extend(extra_scalars)
    mock_db.scalar = AsyncMock(side_effect=values)


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


@pytest.fixture
def mock_zitadel():
    z = AsyncMock()
    z.create_organization = AsyncMock(return_value={"id": ORG_ID})
    z.deactivate_organization = AsyncMock()
    z.delete_organization = AsyncMock()
    z.assign_project_role = AsyncMock()
    z.ensure_project_grant = AsyncMock(return_value="grant-123")
    return z


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


# ---------------------------------------------------------------------------
# Campaign endpoint tests
# ---------------------------------------------------------------------------


class TestCampaignCreate:
    """POST /api/v1/campaigns."""

    async def test_create_campaign_success(self, mock_db, mock_zitadel):
        """Any authenticated user can create a campaign."""
        user = _make_user(role=CampaignRole.VIEWER)  # Even viewer can create
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # ensure_user_synced calls (user lookup, campaign lookup)
        sync_results = _setup_user_sync_on_db(mock_db)
        mock_db.execute = AsyncMock(side_effect=sync_results)

        async def fake_refresh(obj):
            if isinstance(obj, Campaign):
                obj.id = obj.id or uuid.uuid4()
                obj.created_at = obj.created_at or utcnow()
                obj.updated_at = obj.updated_at or utcnow()

        mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/campaigns",
                json={
                    "name": "New Campaign",
                    "type": "federal",
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Campaign"
        assert data["type"] == "federal"
        mock_zitadel.ensure_project_grant.assert_awaited()

    async def test_create_campaign_422_missing_name(self, mock_db, mock_zitadel):
        """Missing name returns 422."""
        user = _make_user()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/campaigns",
                json={"type": "federal"},
            )

        assert resp.status_code == 422


class TestCampaignList:
    """GET /api/v1/campaigns."""

    async def test_list_campaigns_success(self, mock_db, mock_zitadel):
        """Viewer+ can list campaigns."""
        user = _make_user(role=CampaignRole.VIEWER)
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        campaigns = [_make_campaign()]

        # ensure_user_synced (2 calls) + list_campaigns (1 call)
        sync_results = _setup_user_sync_on_db(mock_db)

        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = campaigns
        sync_results.append(list_result)

        mock_db.execute = AsyncMock(side_effect=sync_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/campaigns")

        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "pagination" in data


class TestCampaignGet:
    """GET /api/v1/campaigns/{id}."""

    async def test_get_campaign_success(self, mock_db, mock_zitadel):
        """Viewer+ can get campaign details."""
        user = _make_user(role=CampaignRole.VIEWER)
        campaign = _make_campaign()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # resolve_campaign_role uses db.scalar()
        _setup_role_resolution(mock_db, campaign=campaign)
        # ensure_user_synced (2 calls) + get_campaign (1 call)
        sync_results = _setup_user_sync_on_db(mock_db)
        sync_results.append(_mock_result_with(campaign))
        mock_db.execute = AsyncMock(side_effect=sync_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/campaigns/{CAMPAIGN_ID}")

        assert resp.status_code == 200
        assert resp.json()["name"] == "Test Campaign"


class TestCampaignUpdate:
    """PATCH /api/v1/campaigns/{id}."""

    async def test_update_campaign_admin(self, mock_db, mock_zitadel):
        """Admin+ can update campaign."""
        user = _make_user(role=CampaignRole.ADMIN)
        campaign = _make_campaign()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # resolve_campaign_role uses db.scalar()
        _setup_role_resolution(mock_db, campaign=campaign)
        # ensure_user_synced (2 calls) + update_campaign select (1) + refresh
        sync_results = _setup_user_sync_on_db(mock_db)
        sync_results.append(_mock_result_with(campaign))
        mock_db.execute = AsyncMock(side_effect=sync_results)
        mock_db.refresh = AsyncMock()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}",
                json={"name": "Updated Name"},
            )

        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_update_campaign_insufficient_role(self, mock_db, mock_zitadel):
        """Viewer cannot update campaign -- returns 403."""
        user = _make_user(role=CampaignRole.VIEWER)
        campaign = _make_campaign()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # resolve_campaign_role uses db.scalar()
        _setup_role_resolution(mock_db, campaign=campaign)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/campaigns/{CAMPAIGN_ID}",
                json={"name": "Should Fail"},
            )

        assert resp.status_code == 403


class TestCampaignDelete:
    """DELETE /api/v1/campaigns/{id}."""

    async def test_delete_campaign_owner(self, mock_db, mock_zitadel):
        """Owner can delete campaign."""
        user = _make_user(role=CampaignRole.OWNER)
        campaign = _make_campaign(created_by="user-test-1")
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # resolve_campaign_role uses db.scalar(); delete_campaign also
        # calls db.scalar() for sibling count check (returns 0)
        _setup_role_resolution(mock_db, campaign=campaign, extra_scalars=[0])
        # ensure_user_synced (2 calls) + delete_campaign select (1)
        sync_results = _setup_user_sync_on_db(mock_db)
        sync_results.append(_mock_result_with(campaign))
        mock_db.execute = AsyncMock(side_effect=sync_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/campaigns/{CAMPAIGN_ID}")

        assert resp.status_code == 204

    async def test_delete_campaign_non_owner_403(self, mock_db, mock_zitadel):
        """Non-owner gets 403 even with admin role."""
        user = _make_user(user_id="different-user", role=CampaignRole.ADMIN)
        campaign = _make_campaign()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # resolve_campaign_role uses db.scalar()
        _setup_role_resolution(mock_db, campaign=campaign)
        # role check at route level will reject admin (needs owner)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/campaigns/{CAMPAIGN_ID}")

        assert resp.status_code == 403


class TestUnauthenticated:
    """Unauthenticated access returns 401/403."""

    async def test_unauthenticated_returns_401(self):
        """No auth header returns 401 or 403."""
        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/campaigns")

        assert resp.status_code in (401, 403)


class TestErrorFormat:
    """Error responses follow RFC 9457 Problem Details."""

    async def test_404_problem_details(self, mock_db, mock_zitadel):
        """Not found returns RFC 9457 structure."""
        user = _make_user(role=CampaignRole.VIEWER)
        # Need a campaign for role resolution to pass (even though
        # the endpoint will ultimately return 404 for this campaign_id)
        campaign = _make_campaign()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # resolve_campaign_role uses db.scalar()
        _setup_role_resolution(mock_db, campaign=campaign)
        # ensure_user_synced (2 calls) + get_campaign (1 call returns None)
        sync_results = _setup_user_sync_on_db(mock_db)
        sync_results.append(_mock_result_with(None))
        mock_db.execute = AsyncMock(side_effect=sync_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/campaigns/{uuid.uuid4()}")

        assert resp.status_code == 404
        data = resp.json()
        assert "title" in data
        assert "status" in data


# ---------------------------------------------------------------------------
# /me endpoint tests
# ---------------------------------------------------------------------------


class TestMeEndpoints:
    """GET /api/v1/me and /api/v1/me/campaigns."""

    async def test_me_returns_user_info(self, mock_db, mock_zitadel):
        """GET /me returns current user info."""
        user = _make_user()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        local_user = _make_local_user()
        # ensure_user_synced: user lookup (found) + campaign lookup (None)
        sync_results = _setup_user_sync_on_db(mock_db, local_user=local_user)
        mock_db.execute = AsyncMock(side_effect=sync_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/me")

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "user-test-1"
        assert "email" in data

    async def test_me_campaigns_returns_list(self, mock_db, mock_zitadel):
        """GET /me/campaigns returns user's campaigns."""
        user = _make_user()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # ensure_user_synced (2 calls) + campaigns query (1 call)
        sync_results = _setup_user_sync_on_db(mock_db)
        campaigns_result = MagicMock()
        campaigns_result.all.return_value = []
        sync_results.append(campaigns_result)
        mock_db.execute = AsyncMock(side_effect=sync_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/me/campaigns")

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# User sync test
# ---------------------------------------------------------------------------


class TestUserSync:
    """First authenticated request creates/updates local user record."""

    async def test_first_auth_creates_user(self, mock_db, mock_zitadel):
        """User record created on first authenticated request."""
        user = _make_user()
        app = _override_app(user=user, db=mock_db, zitadel=mock_zitadel)

        # First execute: user not found (None), second: org lookup (None),
        # third: campaign lookup (None)
        results = [
            _mock_result_with(None),  # user not found -> create
            _mock_result_with(None),  # org lookup (None)
            _mock_result_with(None),  # campaign lookup fallback (None)
        ]
        mock_db.execute = AsyncMock(side_effect=results)

        # ensure_user_synced will create user, then the /me endpoint
        # reads from ensure_user_synced return. Since user is created inline,
        # the returned User object is what we get.

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/me")

        assert resp.status_code == 200
        # User should have been added to DB
        mock_db.add.assert_called()
