"""Unit tests for app.services.join.JoinService.

Uses AsyncMock / MagicMock throughout — no real database required.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.errors import CampaignNotFoundError
from app.core.security import AuthenticatedUser, CampaignRole
from app.models.campaign import Campaign, CampaignStatus
from app.models.campaign_member import CampaignMember
from app.models.organization import Organization
from app.models.volunteer import Volunteer
from app.services.join import JoinService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_user(**kwargs) -> AuthenticatedUser:
    defaults = dict(
        id="user-123",
        org_id="org-abc",
        role=CampaignRole.VIEWER,
        email="volunteer@example.com",
        display_name="Jane Doe",
    )
    defaults.update(kwargs)
    return AuthenticatedUser(**defaults)


def _make_campaign(**kwargs) -> Campaign:
    c = MagicMock(spec=Campaign)
    c.id = uuid.uuid4()
    c.slug = "smith-for-senate"
    c.name = "Smith for Senate"
    c.status = CampaignStatus.ACTIVE
    c.zitadel_org_id = "zit-org-1"
    c.organization_id = uuid.uuid4()
    for k, v in kwargs.items():
        setattr(c, k, v)
    return c


def _make_org(**kwargs) -> Organization:
    o = MagicMock(spec=Organization)
    o.zitadel_project_grant_id = "grant-abc"
    for k, v in kwargs.items():
        setattr(o, k, v)
    return o


# ---------------------------------------------------------------------------
# get_campaign_public_info
# ---------------------------------------------------------------------------


class TestGetCampaignPublicInfo:
    """Tests for JoinService.get_campaign_public_info()."""

    @pytest.mark.anyio
    async def test_returns_active_campaign(self):
        service = JoinService()
        campaign = _make_campaign()

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=result_mock)

        found = await service.get_campaign_public_info("smith-for-senate", db)
        assert found is campaign

    @pytest.mark.anyio
    async def test_raises_campaign_not_found_when_missing(self):
        service = JoinService()

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result_mock)

        with pytest.raises(CampaignNotFoundError):
            await service.get_campaign_public_info("nonexistent-slug", db)


# ---------------------------------------------------------------------------
# register_volunteer
# ---------------------------------------------------------------------------


class TestRegisterVolunteer:
    """Tests for JoinService.register_volunteer()."""

    @pytest.mark.anyio
    async def test_successful_registration(self):
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user()
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock()

        db = AsyncMock()

        # Sequence of db.execute / db.scalar calls:
        # 1. get_campaign_public_info → scalar_one_or_none → campaign
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign

        # 2. duplicate check → db.scalar → None (no existing member)
        # 3. org lookup → db.scalar → org
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        result = await service.register_volunteer("smith-for-senate", user, db, zitadel)

        assert result["campaign_id"] == str(campaign.id)
        assert result["campaign_slug"] == campaign.slug
        assert "volunteer_id" in result
        zitadel.assign_project_role.assert_awaited_once()
        db.commit.assert_awaited_once()

    @pytest.mark.anyio
    async def test_raises_campaign_not_found(self):
        service = JoinService()
        user = _make_user()
        zitadel = AsyncMock()

        db = AsyncMock()
        exec_result = MagicMock()
        exec_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=exec_result)

        with pytest.raises(CampaignNotFoundError):
            await service.register_volunteer("no-such-slug", user, db, zitadel)

    @pytest.mark.anyio
    async def test_raises_value_error_when_already_registered(self):
        service = JoinService()
        campaign = _make_campaign()
        user = _make_user()
        zitadel = AsyncMock()
        existing_member = MagicMock(spec=CampaignMember)

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        # Duplicate check returns an existing member
        db.scalar = AsyncMock(return_value=existing_member)

        with pytest.raises(ValueError, match=f"already_registered:{campaign.id}"):
            await service.register_volunteer("smith-for-senate", user, db, zitadel)

        db.commit.assert_not_awaited()

    @pytest.mark.anyio
    async def test_splits_display_name_into_first_last(self):
        """Volunteer record is created with correct first/last name split."""
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user(display_name="John Smith")
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock()

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        captured_volunteer: list[Volunteer] = []

        def _capture_add(obj):
            if isinstance(obj, Volunteer):
                captured_volunteer.append(obj)

        db.add = MagicMock(side_effect=_capture_add)

        await service.register_volunteer("smith-for-senate", user, db, zitadel)

        assert len(captured_volunteer) == 1
        vol = captured_volunteer[0]
        assert vol.first_name == "John"
        assert vol.last_name == "Smith"
        assert vol.email == user.email
        assert vol.status == "active"
        assert vol.skills == []

    @pytest.mark.anyio
    async def test_handles_single_word_display_name(self):
        """Single-word display_name results in empty last_name."""
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user(display_name="Mononymous")
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock()

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])

        captured_volunteer: list[Volunteer] = []

        def _capture_add(obj):
            if isinstance(obj, Volunteer):
                captured_volunteer.append(obj)

        db.add = MagicMock(side_effect=_capture_add)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        await service.register_volunteer("smith-for-senate", user, db, zitadel)

        vol = captured_volunteer[0]
        assert vol.first_name == "Mononymous"
        assert vol.last_name == ""

    @pytest.mark.anyio
    async def test_handles_none_display_name(self):
        """None display_name results in empty first and last name."""
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user(display_name=None)
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock()

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])

        captured_volunteer: list[Volunteer] = []

        def _capture_add(obj):
            if isinstance(obj, Volunteer):
                captured_volunteer.append(obj)

        db.add = MagicMock(side_effect=_capture_add)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        await service.register_volunteer("smith-for-senate", user, db, zitadel)

        vol = captured_volunteer[0]
        assert vol.first_name == ""
        assert vol.last_name == ""

    @pytest.mark.anyio
    async def test_zitadel_failure_aborts_registration(self):
        """ZITADEL role assignment failure causes registration to fail atomically.

        If ZITADEL fails, the exception propagates and DB transaction rolls back.
        This ensures atomicity: either both DB and ZITADEL succeed, or both fail.
        """
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user()
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock(
            side_effect=RuntimeError("ZITADEL down")
        )

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        # Should raise — ZITADEL failure causes atomic rollback
        with pytest.raises(RuntimeError, match="ZITADEL down"):
            await service.register_volunteer("smith-for-senate", user, db, zitadel)

        # Commit should NOT have been called due to the ZITADEL failure
        db.commit.assert_not_awaited()

    @pytest.mark.anyio
    async def test_db_commit_failure_triggers_compensating_rollback(self):
        """When DB commit fails after ZITADEL role assignment, the orphaned
        ZITADEL role is removed via compensating transaction."""
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user()
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock()
        zitadel.remove_project_role = AsyncMock()

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])
        db.add = MagicMock()
        db.commit = AsyncMock(side_effect=RuntimeError("DB commit failed"))
        db.refresh = AsyncMock()

        with pytest.raises(RuntimeError, match="DB commit failed"):
            await service.register_volunteer("smith-for-senate", user, db, zitadel)

        # Compensating rollback should have removed the ZITADEL role
        zitadel.remove_project_role.assert_awaited_once()

    @pytest.mark.anyio
    async def test_db_commit_failure_with_cleanup_failure_propagates_original(self):
        """When both DB commit and ZITADEL cleanup fail, the original commit
        exception propagates (not the cleanup exception)."""
        service = JoinService()
        campaign = _make_campaign()
        org = _make_org()
        user = _make_user()
        zitadel = AsyncMock()
        zitadel.assign_project_role = AsyncMock()
        zitadel.remove_project_role = AsyncMock(
            side_effect=RuntimeError("ZITADEL cleanup failed")
        )

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        db.scalar = AsyncMock(side_effect=[None, org])
        db.add = MagicMock()
        db.commit = AsyncMock(side_effect=RuntimeError("DB commit failed"))
        db.refresh = AsyncMock()

        # The ORIGINAL commit exception should propagate, not the cleanup one
        with pytest.raises(RuntimeError, match="DB commit failed"):
            await service.register_volunteer("smith-for-senate", user, db, zitadel)

        zitadel.remove_project_role.assert_awaited_once()

    @pytest.mark.anyio
    async def test_integrity_error_on_flush_raises_already_registered(self):
        """Concurrent registration race: IntegrityError on flush triggers
        rollback and raises ValueError with already_registered prefix."""
        service = JoinService()
        campaign = _make_campaign()
        user = _make_user()
        zitadel = AsyncMock()

        db = AsyncMock()
        exec_result_campaign = MagicMock()
        exec_result_campaign.scalar_one_or_none.return_value = campaign
        db.execute = AsyncMock(return_value=exec_result_campaign)
        # Duplicate check returns None (no existing member at app level)
        db.scalar = AsyncMock(return_value=None)
        db.add = MagicMock()
        db.flush = AsyncMock(
            side_effect=IntegrityError("", {}, Exception("unique violation"))
        )
        db.rollback = AsyncMock()

        with pytest.raises(ValueError, match=f"already_registered:{campaign.id}"):
            await service.register_volunteer("smith-for-senate", user, db, zitadel)

        db.rollback.assert_awaited_once()
        # ZITADEL should NOT have been called since flush failed before step 5
        zitadel.assign_project_role.assert_not_awaited()
