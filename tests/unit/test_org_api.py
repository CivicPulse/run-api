"""Unit tests for org API endpoints."""

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
from app.models.organization import Organization

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_UUID = uuid.uuid4()
ZITADEL_ORG_ID = "zitadel-org-test-1"


def _make_user(
    user_id: str = "user-1",
    org_id: str = ZITADEL_ORG_ID,
    role: CampaignRole = CampaignRole.ADMIN,
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=role,
        email=f"{user_id}@test.com",
        display_name=f"Test User {user_id}",
    )


def _make_org(
    org_id: uuid.UUID = ORG_UUID,
    zitadel_org_id: str = ZITADEL_ORG_ID,
) -> Organization:
    now = utcnow()
    return Organization(
        id=org_id,
        zitadel_org_id=zitadel_org_id,
        name="Test Organization",
        created_by="user-1",
        created_at=now,
        updated_at=now,
    )


def _make_campaign(
    campaign_id: uuid.UUID | None = None,
    org_id: str = ZITADEL_ORG_ID,
) -> Campaign:
    now = utcnow()
    return Campaign(
        id=campaign_id or uuid.uuid4(),
        zitadel_org_id=org_id,
        organization_id=ORG_UUID,
        name="Test Campaign",
        type=CampaignType.STATE,
        status=CampaignStatus.ACTIVE,
        created_by="user-1",
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetOrg:
    """Tests for GET /api/v1/org."""

    @pytest.mark.asyncio
    async def test_returns_org_details(self):
        """GET /api/v1/org returns org details for org_admin."""
        app = create_app()
        user = _make_user()
        org = _make_org()

        mock_db = AsyncMock()
        # require_org_role: (1) org lookup, (2) member role
        # endpoint: (3) org lookup again
        mock_db.scalar = AsyncMock(
            side_effect=[org, "org_admin", org]
        )

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/v1/org",
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Organization"
        assert data["zitadel_org_id"] == ZITADEL_ORG_ID

    @pytest.mark.asyncio
    async def test_returns_403_for_non_member(self):
        """GET /api/v1/org returns 403 for non-org-member."""
        app = create_app()
        user = _make_user()

        mock_db = AsyncMock()
        # require_org_role: org found but no member record
        org = _make_org()
        mock_db.scalar = AsyncMock(side_effect=[org, None])

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/v1/org",
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 403


class TestListOrgCampaigns:
    """Tests for GET /api/v1/org/campaigns."""

    @pytest.mark.asyncio
    async def test_returns_campaigns(self):
        """GET /api/v1/org/campaigns returns campaign list."""
        app = create_app()
        user = _make_user()
        org = _make_org()
        campaign = _make_campaign()

        mock_db = AsyncMock()
        # require_org_role: (1) org, (2) member role
        # endpoint: (3) org lookup again
        mock_db.scalar = AsyncMock(
            side_effect=[org, "org_admin", org]
        )

        # Mock the service execute call for list_campaigns
        mock_result = MagicMock()
        mock_result.all.return_value = [(campaign, 3)]
        mock_db.execute = AsyncMock(return_value=mock_result)

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/v1/org/campaigns",
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert data[0]["name"] == "Test Campaign"
        assert data[0]["member_count"] == 3


class TestListOrgMembers:
    """Tests for GET /api/v1/org/members."""

    @pytest.mark.asyncio
    async def test_returns_members(self):
        """GET /api/v1/org/members returns member list."""
        app = create_app()
        user = _make_user()
        org = _make_org()

        now = utcnow()
        mock_member = MagicMock()
        mock_member.user_id = "user-1"
        mock_member.role = "org_admin"
        mock_member.joined_at = now
        mock_member.created_at = now

        mock_user_record = MagicMock()
        mock_user_record.display_name = "Test User"
        mock_user_record.email = "test@example.com"

        mock_db = AsyncMock()
        # require_org_role: (1) org, (2) member role
        # endpoint: (3) org lookup
        mock_db.scalar = AsyncMock(
            side_effect=[org, "org_admin", org]
        )

        # list_members_with_campaign_roles calls execute 3 times:
        # 1. list_members() — returns [(member, user)]
        members_result = MagicMock()
        members_result.all.return_value = [
            (mock_member, mock_user_record)
        ]
        # 2. Campaign list — returns Row-like objects with .id and .name
        mock_campaign = MagicMock()
        mock_campaign.id = uuid.uuid4()
        mock_campaign.name = "Test Campaign"
        campaigns_result = MagicMock()
        campaigns_result.all.return_value = [mock_campaign]
        # 3. Per-member CampaignMember lookup — returns empty (no roles)
        cm_result = MagicMock()
        cm_result.all.return_value = []
        mock_db.execute = AsyncMock(
            side_effect=[members_result, campaigns_result, cm_result]
        )

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: mock_db

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/v1/org/members",
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert data[0]["user_id"] == "user-1"
        assert data[0]["role"] == "org_admin"
