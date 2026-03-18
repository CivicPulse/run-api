"""Unit tests for ZITADEL service and Campaign service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.errors import ZitadelUnavailableError
from app.core.time import utcnow
from app.models.campaign import Campaign, CampaignStatus, CampaignType

# ---------------------------------------------------------------------------
# ZitadelService tests
# ---------------------------------------------------------------------------


class TestZitadelService:
    """Tests for ZitadelService HTTP client."""

    @pytest.fixture
    def zitadel_service(self):
        from app.services.zitadel import ZitadelService

        return ZitadelService(
            issuer="https://auth.civpulse.org",
            client_id="test-client-id",
            client_secret="test-client-secret",
        )

    async def test_get_token_uses_client_credentials(self, zitadel_service):
        """_get_token posts client_credentials grant with correct scope."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "test-token-123",
            "expires_in": 3600,
            "token_type": "Bearer",
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.zitadel.httpx.AsyncClient", return_value=mock_client):
            token = await zitadel_service._get_token()

        assert token == "test-token-123"
        call_kwargs = mock_client.post.call_args
        assert "oauth/v2/token" in call_kwargs[0][0] or "oauth/v2/token" in str(
            call_kwargs
        )

    async def test_create_organization_calls_correct_endpoint(self, zitadel_service):
        """create_organization POSTs to /management/v1/orgs."""
        token_response = MagicMock()
        token_response.status_code = 200
        token_response.json.return_value = {
            "access_token": "svc-token",
            "expires_in": 3600,
        }
        token_response.raise_for_status = MagicMock()

        org_response = MagicMock()
        org_response.status_code = 201
        org_response.json.return_value = {"id": "new-org-id-1"}
        org_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=[token_response, org_response])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.zitadel.httpx.AsyncClient", return_value=mock_client):
            result = await zitadel_service.create_organization("Test Campaign")

        assert result["id"] == "new-org-id-1"

    async def test_zitadel_handles_503_gracefully(self, zitadel_service):
        """ZitadelService raises ZitadelUnavailableError on 5xx/timeout."""
        import httpx

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.zitadel.httpx.AsyncClient", return_value=mock_client),
            pytest.raises(ZitadelUnavailableError),
        ):
            await zitadel_service.create_organization("Test Campaign")


# ---------------------------------------------------------------------------
# CampaignService tests
# ---------------------------------------------------------------------------


class TestCampaignService:
    """Tests for campaign CRUD operations with compensating transactions."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        db.refresh = AsyncMock()
        # Default execute return supports both scalar_one_or_none() and
        # scalars().all() (the latter is used by the slug deduplication query
        # added to create_campaign).
        default_result = MagicMock()
        default_result.scalar_one_or_none.return_value = None
        default_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=default_result)
        return db

    @pytest.fixture
    def mock_zitadel(self):
        z = AsyncMock()
        z.create_organization = AsyncMock(return_value={"id": "zitadel-org-123"})
        z.deactivate_organization = AsyncMock()
        z.delete_organization = AsyncMock()
        z.assign_project_role = AsyncMock()
        z.ensure_project_grant = AsyncMock(return_value="grant-123")
        return z

    @pytest.fixture
    def mock_user(self):
        from app.core.security import AuthenticatedUser, CampaignRole

        return AuthenticatedUser(
            id="user-abc",
            org_id="zitadel-org-123",
            role=CampaignRole.OWNER,
            email="admin@test.com",
            display_name="Test Admin",
        )

    @pytest.fixture
    def sample_campaign(self):
        campaign = Campaign(
            id=uuid.uuid4(),
            zitadel_org_id="zitadel-org-123",
            name="Test Campaign",
            type=CampaignType.STATE,
            status=CampaignStatus.ACTIVE,
            created_by="user-abc",
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        return campaign

    async def test_create_campaign_creates_zitadel_org_then_local(
        self, mock_db, mock_zitadel, mock_user
    ):
        """create_campaign creates ZITADEL org, then local record."""
        from app.services.campaign import CampaignService

        service = CampaignService()

        # Make refresh populate the campaign id
        async def fake_refresh(obj):
            if isinstance(obj, Campaign) and not obj.id:
                obj.id = uuid.uuid4()
                obj.created_at = utcnow()
                obj.updated_at = utcnow()

        mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        result = await service.create_campaign(
            db=mock_db,
            name="New Campaign",
            campaign_type=CampaignType.FEDERAL,
            user=mock_user,
            zitadel=mock_zitadel,
        )

        mock_zitadel.create_organization.assert_awaited_once_with("New Campaign")
        mock_zitadel.ensure_project_grant.assert_awaited_once()
        mock_zitadel.assign_project_role.assert_awaited_once()
        mock_db.add.assert_called()
        mock_db.commit.assert_awaited()
        assert isinstance(result, Campaign)

        # Verify CampaignMember was added with role="owner"
        added_objects = [call.args[0] for call in mock_db.add.call_args_list]
        from app.models.campaign_member import CampaignMember
        member_adds = [o for o in added_objects if isinstance(o, CampaignMember)]
        assert len(member_adds) == 1
        assert member_adds[0].role == "owner"

    async def test_create_campaign_compensating_transaction(
        self, mock_db, mock_zitadel, mock_user
    ):
        """If local DB commit fails, ZITADEL org is deleted (compensating)."""
        from app.services.campaign import CampaignService

        service = CampaignService()
        mock_db.commit = AsyncMock(side_effect=Exception("DB write failed"))

        with pytest.raises(Exception, match="DB write failed"):
            await service.create_campaign(
                db=mock_db,
                name="Failing Campaign",
                campaign_type=CampaignType.STATE,
                user=mock_user,
                zitadel=mock_zitadel,
            )

        mock_zitadel.delete_organization.assert_awaited_once_with("zitadel-org-123")

    async def test_update_campaign(self, mock_db, sample_campaign):
        """update_campaign updates local fields."""
        from app.services.campaign import CampaignService

        service = CampaignService()

        # Mock execute to return the campaign
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_campaign
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.update_campaign(
            db=mock_db,
            campaign_id=sample_campaign.id,
            name="Updated Name",
            campaign_type=CampaignType.LOCAL,
            jurisdiction_name="Springfield",
        )

        assert result.name == "Updated Name"
        assert result.type == CampaignType.LOCAL
        assert result.jurisdiction_name == "Springfield"
        mock_db.commit.assert_awaited()

    async def test_delete_campaign_soft_deletes_and_deactivates_org(
        self, mock_db, mock_zitadel, mock_user, sample_campaign
    ):
        """delete_campaign sets status=deleted and deactivates ZITADEL org."""
        from app.services.campaign import CampaignService

        service = CampaignService()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_campaign
        mock_db.execute = AsyncMock(return_value=mock_result)

        await service.delete_campaign(
            db=mock_db,
            campaign_id=sample_campaign.id,
            user=mock_user,
            zitadel=mock_zitadel,
        )

        assert sample_campaign.status == CampaignStatus.DELETED
        mock_zitadel.deactivate_organization.assert_awaited_once_with("zitadel-org-123")
        mock_db.commit.assert_awaited()

    async def test_delete_campaign_only_owner(
        self, mock_db, mock_zitadel, sample_campaign
    ):
        """delete_campaign only allowed by owner (created_by == user.id)."""
        from app.core.errors import InsufficientPermissionsError
        from app.core.security import AuthenticatedUser, CampaignRole
        from app.services.campaign import CampaignService

        service = CampaignService()

        non_owner = AuthenticatedUser(
            id="different-user",
            org_id="zitadel-org-123",
            role=CampaignRole.ADMIN,
            email="other@test.com",
            display_name="Other User",
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_campaign
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(InsufficientPermissionsError):
            await service.delete_campaign(
                db=mock_db,
                campaign_id=sample_campaign.id,
                user=non_owner,
                zitadel=mock_zitadel,
            )

    async def test_get_campaign(self, mock_db, sample_campaign):
        """get_campaign returns campaign by ID."""
        from app.services.campaign import CampaignService

        service = CampaignService()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_campaign
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_campaign(mock_db, sample_campaign.id)
        assert result == sample_campaign

    async def test_list_campaigns_paginated(self, mock_db):
        """list_campaigns returns paginated list with cursor-based pagination."""
        from app.services.campaign import CampaignService

        service = CampaignService()

        campaigns = [
            Campaign(
                id=uuid.uuid4(),
                zitadel_org_id=f"org-{i}",
                name=f"Campaign {i}",
                type=CampaignType.STATE,
                status=CampaignStatus.ACTIVE,
                created_by="user-abc",
                created_at=datetime(2026, 1, i + 1, tzinfo=UTC),
                updated_at=datetime(2026, 1, i + 1, tzinfo=UTC),
            )
            for i in range(3)
        ]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = campaigns
        mock_db.execute = AsyncMock(return_value=mock_result)

        items, pagination = await service.list_campaigns(
            db=mock_db, limit=10, cursor=None
        )

        assert len(items) == 3
        assert pagination.has_more is False
