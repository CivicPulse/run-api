"""Unit tests for resolve_campaign_role function."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

from app.core.security import CampaignRole, resolve_campaign_role

USER_ID = "user-test-1"
CAMPAIGN_ID = uuid.uuid4()
USER_ORG_ID = "org-123"
OTHER_ORG_ID = "org-other-456"


class TestResolveCampaignRole:
    """Tests for resolve_campaign_role resolution logic."""

    async def test_explicit_db_role_override(self):
        """Member has role 'admin' in DB -- returns CampaignRole.ADMIN."""
        db = AsyncMock()
        db.scalar = AsyncMock(return_value="admin")

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.ADMIN

    async def test_jwt_role_same_org(self):
        """No DB role, user_org_id matches campaign's org -- returns jwt_role."""
        campaign = MagicMock()
        campaign.organization_id = None
        campaign.zitadel_org_id = USER_ORG_ID

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember.role lookup
                campaign,  # Campaign lookup
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.MANAGER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.MANAGER

    async def test_cross_org_denied(self):
        """No DB role, user_org_id differs from campaign's org -- returns None."""
        campaign = MagicMock()
        campaign.organization_id = None
        campaign.zitadel_org_id = OTHER_ORG_ID

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember.role lookup
                campaign,  # Campaign lookup
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.ADMIN,
            user_org_id=USER_ORG_ID,
        )

        assert result is None

    async def test_org_model_lookup(self):
        """Campaign has organization_id set, looks up Organization.zitadel_org_id."""
        org_uuid = uuid.uuid4()
        campaign = MagicMock()
        campaign.organization_id = org_uuid
        campaign.zitadel_org_id = None

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember.role lookup
                campaign,  # Campaign lookup
                USER_ORG_ID,  # Organization.zitadel_org_id lookup
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VIEWER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.VIEWER

    async def test_legacy_campaign_fallback(self):
        """Campaign has no organization_id, falls back to campaign.zitadel_org_id."""
        campaign = MagicMock()
        campaign.organization_id = None
        campaign.zitadel_org_id = USER_ORG_ID

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                None,  # CampaignMember.role lookup
                campaign,  # Campaign lookup (no organization_id)
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.VOLUNTEER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.VOLUNTEER

    async def test_no_user_org_id_legacy(self):
        """user_org_id is None -- returns jwt_role (legacy behavior)."""
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=None)  # CampaignMember.role lookup

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.ADMIN,
            user_org_id=None,
        )

        assert result == CampaignRole.ADMIN

    async def test_invalid_db_role_falls_through(self):
        """Member has role 'bogus' in DB, logs warning, falls through to JWT check."""
        campaign = MagicMock()
        campaign.organization_id = None
        campaign.zitadel_org_id = USER_ORG_ID

        db = AsyncMock()
        db.scalar = AsyncMock(
            side_effect=[
                "bogus",  # CampaignMember.role lookup (invalid)
                campaign,  # Campaign lookup
            ]
        )

        result = await resolve_campaign_role(
            user_id=USER_ID,
            campaign_id=CAMPAIGN_ID,
            db=db,
            jwt_role=CampaignRole.MANAGER,
            user_org_id=USER_ORG_ID,
        )

        assert result == CampaignRole.MANAGER
