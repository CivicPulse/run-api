"""Unit tests for ensure_user_synced multi-campaign membership creation."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, CampaignRole
from app.core.time import utcnow
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.user import User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ORG_ID = "zitadel-org-sync-test"
ORG_UUID = uuid.uuid4()


def _user(user_id: str = "sync-user-1", org_id: str = ORG_ID) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        org_id=org_id,
        role=CampaignRole.VIEWER,
        email=f"{user_id}@test.com",
        display_name=f"Sync User {user_id}",
    )


def _local_user(user_id: str = "sync-user-1") -> User:
    now = utcnow()
    return User(
        id=user_id,
        display_name=f"Sync User {user_id}",
        email=f"{user_id}@test.com",
        created_at=now,
        updated_at=now,
    )


def _org(org_id: uuid.UUID | None = None) -> Organization:
    return Organization(
        id=org_id or ORG_UUID,
        zitadel_org_id=ORG_ID,
        name="Test Org",
        created_by="sync-user-1",
    )


def _campaign(
    campaign_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
) -> Campaign:
    return Campaign(
        id=campaign_id or uuid.uuid4(),
        zitadel_org_id=ORG_ID,
        organization_id=org_id or ORG_UUID,
        name=f"Campaign {campaign_id or 'default'}",
        type=CampaignType.LOCAL,
        status=CampaignStatus.ACTIVE,
        created_by="sync-user-1",
        created_at=utcnow(),
        updated_at=utcnow(),
    )


def _mock_result(value, method="scalar_one_or_none"):
    """Create a MagicMock result that returns value on the given method."""
    result = MagicMock()
    getattr(result, method).return_value = value
    return result


def _mock_scalars_all(values):
    """Create a MagicMock result whose .scalars().all() returns values."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEnsureUserSyncedMultiCampaign:
    """ensure_user_synced creates CampaignMember for ALL org campaigns."""

    async def test_creates_membership_for_all_3_campaigns(self):
        """User in org with 3 campaigns gets CampaignMember for all 3."""
        user = _user()
        local_user = _local_user()
        org = _org()
        campaigns = [_campaign() for _ in range(3)]

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        # Execute calls:
        # 1. User lookup -> found
        # 2. Org lookup -> found
        # 3. Campaign lookup (scalars().all()) -> 3 campaigns
        # 4-6. CampaignMember lookup for each campaign -> None (not found)
        results = [
            _mock_result(local_user),  # user lookup
            _mock_result(org),  # org lookup
            _mock_scalars_all(campaigns),  # all campaigns in org
            _mock_result(None),  # member check campaign 1 -> not found
            _mock_result(None),  # member check campaign 2 -> not found
            _mock_result(None),  # member check campaign 3 -> not found
        ]
        db.execute = AsyncMock(side_effect=results)

        result = await ensure_user_synced(user, db)

        assert result == local_user
        # Should have added 3 CampaignMember records
        assert db.add.call_count == 3
        # Verify each added object is a CampaignMember
        for c in db.add.call_args_list:
            added = c[0][0]
            assert isinstance(added, CampaignMember)
            assert added.user_id == user.id

    async def test_skips_existing_membership_creates_missing(self):
        """User has 1 of 3 memberships -- creates 2 missing ones."""
        user = _user()
        local_user = _local_user()
        org = _org()
        campaigns = [_campaign() for _ in range(3)]
        existing_member = MagicMock(spec=CampaignMember)

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        results = [
            _mock_result(local_user),  # user lookup
            _mock_result(org),  # org lookup
            _mock_scalars_all(campaigns),  # all campaigns
            _mock_result(existing_member),  # campaign 1 -> already exists
            _mock_result(None),  # campaign 2 -> not found
            _mock_result(None),  # campaign 3 -> not found
        ]
        db.execute = AsyncMock(side_effect=results)

        await ensure_user_synced(user, db)

        # Should only add 2 new members (not the existing one)
        assert db.add.call_count == 2

    async def test_no_campaigns_logs_warning_no_crash(self):
        """User in org with 0 campaigns -- logs warning, does not crash."""
        user = _user()
        local_user = _local_user()
        org = _org()

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        results = [
            _mock_result(local_user),  # user lookup
            _mock_result(org),  # org lookup
            _mock_scalars_all([]),  # no campaigns in org
            _mock_scalars_all([]),  # fallback also empty
        ]
        db.execute = AsyncMock(side_effect=results)

        result = await ensure_user_synced(user, db)

        assert result == local_user
        # No members added
        db.add.assert_not_called()

    async def test_no_org_falls_back_to_zitadel_org_id(self):
        """User with no org record falls back to legacy zitadel_org_id lookup."""
        user = _user()
        local_user = _local_user()
        campaigns = [_campaign() for _ in range(2)]

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        results = [
            _mock_result(local_user),  # user lookup
            _mock_result(None),  # org lookup -> not found
            _mock_scalars_all(campaigns),  # fallback: campaigns by zitadel_org_id
            _mock_result(None),  # member check campaign 1 -> not found
            _mock_result(None),  # member check campaign 2 -> not found
        ]
        db.execute = AsyncMock(side_effect=results)

        result = await ensure_user_synced(user, db)

        assert result == local_user
        assert db.add.call_count == 2
