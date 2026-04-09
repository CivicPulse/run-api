"""Unit tests for app.services.signup_link.SignupLinkService."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.campaign import Campaign, CampaignStatus
from app.models.organization import Organization
from app.models.signup_link import SignupLink
from app.services.signup_link import SignupLinkService


def _make_link(**kwargs) -> SignupLink:
    link = MagicMock(spec=SignupLink)
    link.id = uuid.uuid4()
    link.campaign_id = uuid.uuid4()
    link.label = "Weekend volunteers"
    link.token = uuid.uuid4()
    link.status = "active"
    link.expires_at = None
    link.disabled_at = None
    link.regenerated_at = None
    for key, value in kwargs.items():
        setattr(link, key, value)
    return link


def _make_campaign(**kwargs) -> Campaign:
    campaign = MagicMock(spec=Campaign)
    campaign.id = uuid.uuid4()
    campaign.name = "Smith for Senate"
    campaign.status = CampaignStatus.ACTIVE
    campaign.organization_id = uuid.uuid4()
    campaign.candidate_name = "Alice Smith"
    campaign.jurisdiction_name = "California"
    campaign.election_date = None
    for key, value in kwargs.items():
        setattr(campaign, key, value)
    return campaign


def _make_org(**kwargs) -> Organization:
    org = MagicMock(spec=Organization)
    org.name = "CivicPulse PAC"
    for key, value in kwargs.items():
        setattr(org, key, value)
    return org


class TestSignupLinkService:
    @pytest.mark.anyio
    async def test_create_link_strips_label_and_commits(self):
        service = SignupLinkService()
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        link = await service.create_link(
            db,
            uuid.uuid4(),
            "  Weekend volunteers  ",
            "user-1",
        )

        assert isinstance(link, SignupLink)
        assert link.label == "Weekend volunteers"
        assert link.created_by == "user-1"
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(link)

    @pytest.mark.anyio
    async def test_regenerate_link_requires_active_status(self):
        service = SignupLinkService()
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=_make_link(status="disabled"))

        with pytest.raises(
            ValueError,
            match="Only active signup links can be regenerated",
        ):
            await service.regenerate_link(db, uuid.uuid4(), uuid.uuid4(), "user-1")

    @pytest.mark.anyio
    async def test_get_public_link_returns_none_tuple_when_link_unavailable(self):
        service = SignupLinkService()
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=None)

        link, campaign, org = await service.get_public_link(db, uuid.uuid4())

        assert link is None
        assert campaign is None
        assert org is None

    @pytest.mark.anyio
    async def test_get_public_link_returns_safe_context_for_valid_link(self):
        service = SignupLinkService()
        link = _make_link()
        campaign = _make_campaign(campaign_id=link.campaign_id)
        org = _make_org()

        db = AsyncMock()
        db.scalar = AsyncMock(side_effect=[link, campaign, org])

        found_link, found_campaign, found_org = await service.get_public_link(
            db,
            link.token,
        )

        assert found_link is link
        assert found_campaign is campaign
        assert found_org is org
