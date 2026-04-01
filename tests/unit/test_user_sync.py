"""Unit tests for ensure_user_synced multi-campaign membership creation."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

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


def _mock_rowcount_result(count):
    """Create a MagicMock result for INSERT with rowcount."""
    result = MagicMock()
    result.rowcount = count
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
        # 2. Org lookup -> scalars().all() -> [org]
        # 3. Org member upsert (pg_insert) -> rowcount=1 (new)
        # 4. Campaign lookup for org -> scalars().all() -> 3 campaigns
        # 5-7. Campaign member upsert for each -> rowcount=1 (new)
        results = [
            _mock_result(local_user),  # 1. user lookup
            _mock_scalars_all([org]),  # 2. org lookup
            _mock_rowcount_result(1),  # 3. org member upsert
            _mock_scalars_all(campaigns),  # 4. campaigns for this org
            _mock_rowcount_result(1),  # 5. campaign member upsert 1
            _mock_rowcount_result(1),  # 6. campaign member upsert 2
            _mock_rowcount_result(1),  # 7. campaign member upsert 3
        ]
        db.execute = AsyncMock(side_effect=results)

        result = await ensure_user_synced(user, db)

        assert result == local_user
        # New code uses db.execute for pg_insert, not db.add
        assert db.execute.call_count == 7

    async def test_skips_existing_membership_creates_missing(self):
        """User has 1 of 3 memberships -- creates 2 missing ones."""
        user = _user()
        local_user = _local_user()
        org = _org()
        campaigns = [_campaign() for _ in range(3)]
        existing_member = MagicMock(spec=CampaignMember)
        existing_member.role = "viewer"  # role is set, no backfill needed

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        # When rowcount=0, code does db.scalar() to check for role backfill
        db.scalar = AsyncMock(return_value=existing_member)

        results = [
            _mock_result(local_user),  # user lookup
            _mock_scalars_all([org]),  # org lookup
            _mock_rowcount_result(1),  # org member upsert
            _mock_scalars_all(campaigns),  # campaigns per org
            _mock_rowcount_result(0),  # campaign 1 -> already exists
            _mock_rowcount_result(1),  # campaign 2 -> new
            _mock_rowcount_result(1),  # campaign 3 -> new
        ]
        db.execute = AsyncMock(side_effect=results)

        await ensure_user_synced(user, db)

        # 7 execute calls total (insert still happens, just rowcount=0)
        assert db.execute.call_count == 7
        # db.scalar called once for the existing member backfill check
        assert db.scalar.call_count == 1

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
            _mock_scalars_all([org]),  # org lookup
            _mock_rowcount_result(1),  # org member upsert
            _mock_scalars_all([]),  # campaigns per org -> empty
            _mock_scalars_all([]),  # fallback -> also empty
        ]
        db.execute = AsyncMock(side_effect=results)

        result = await ensure_user_synced(user, db)

        assert result == local_user
        # No members added via db.add
        db.add.assert_not_called()

    async def test_no_org_falls_back_to_zitadel_org_id(self):
        """User with no org record falls back to legacy zitadel_org_id lookup."""
        user = _user()
        local_user = _local_user()
        campaigns = [_campaign() for _ in range(2)]

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        # No orgs found -> skip org member upsert and per-org campaign lookup
        # Go straight to fallback campaign lookup
        results = [
            _mock_result(local_user),  # user lookup
            _mock_scalars_all([]),  # org lookup -> empty
            _mock_scalars_all(campaigns),  # fallback: campaigns by zitadel_org_id
            _mock_rowcount_result(1),  # campaign member upsert 1
            _mock_rowcount_result(1),  # campaign member upsert 2
        ]
        db.execute = AsyncMock(side_effect=results)

        result = await ensure_user_synced(user, db)

        assert result == local_user
        assert db.execute.call_count == 5
