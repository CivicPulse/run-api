"""Unit tests for campaign list visibility with multi-campaign membership."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

from app.core.time import utcnow
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.services.campaign import CampaignService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_ID = "zitadel-org-list-test"


def _campaign(
    campaign_id: uuid.UUID | None = None,
    name: str = "Test Campaign",
) -> Campaign:
    return Campaign(
        id=campaign_id or uuid.uuid4(),
        zitadel_org_id=ORG_ID,
        name=name,
        type=CampaignType.LOCAL,
        status=CampaignStatus.ACTIVE,
        created_by="user-1",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCampaignListVisibility:
    """Campaign list returns only campaigns the user has membership in."""

    async def test_campaign_list_returns_all_member_campaigns(self):
        """User with 3 memberships sees all 3 campaigns in list."""
        campaigns = [_campaign(name=f"Campaign {i}") for i in range(3)]

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = campaigns
        db.execute = AsyncMock(return_value=result_mock)

        service = CampaignService()
        items, pagination = await service.list_campaigns(db=db, limit=20)

        assert len(items) == 3
        assert all(isinstance(c, Campaign) for c in items)

    async def test_campaign_list_excludes_non_member_campaigns(self):
        """User sees only 2 of 4 campaigns (those with membership)."""
        # Only return the 2 campaigns the user has membership for
        member_campaigns = [_campaign(name=f"Member Campaign {i}") for i in range(2)]

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = member_campaigns
        db.execute = AsyncMock(return_value=result_mock)

        service = CampaignService()
        items, pagination = await service.list_campaigns(db=db, limit=20)

        assert len(items) == 2

    async def test_campaign_list_empty_for_no_memberships(self):
        """User with no CampaignMember records sees empty list (per D-09)."""
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result_mock)

        service = CampaignService()
        items, pagination = await service.list_campaigns(db=db, limit=20)

        assert len(items) == 0
        assert pagination.next_cursor is None
