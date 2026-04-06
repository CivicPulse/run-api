"""Tests for the field/me endpoint service layer."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.call_list import CallListStatus
from app.services.field import FieldService


def _make_walk_list(
    *,
    wl_id: uuid.UUID | None = None,
    name: str = "Walk List 1",
    total: int = 47,
    visited: int = 12,
) -> MagicMock:
    """Create a mock WalkList row."""
    wl = MagicMock()
    wl.id = wl_id or uuid.uuid4()
    wl.name = name
    wl.total_entries = total
    wl.visited_entries = visited
    return wl


def _make_phone_session(
    *,
    session_id: uuid.UUID | None = None,
    name: str = "Evening Calls",
    call_list_id: uuid.UUID | None = None,
) -> MagicMock:
    """Create a mock PhoneBankSession row."""
    s = MagicMock()
    s.id = session_id or uuid.uuid4()
    s.name = name
    s.call_list_id = call_list_id or uuid.uuid4()
    return s


def _make_call_list(*, total: int = 100, completed: int = 25) -> MagicMock:
    """Create a mock CallList row."""
    cl = MagicMock()
    cl.total_entries = total
    cl.completed_entries = completed
    cl.status = CallListStatus.ACTIVE
    return cl


def _make_campaign(name: str = "Johnson for Mayor") -> MagicMock:
    """Create a mock Campaign row."""
    c = MagicMock()
    c.name = name
    return c


def _make_counts_result(total: int, visited: int) -> MagicMock:
    result = MagicMock()
    result.one.return_value = (total, visited)
    return result


class TestFieldService:
    """Test FieldService.get_field_me with mocked DB session."""

    @pytest.fixture
    def service(self):
        return FieldService()

    @pytest.fixture
    def campaign_id(self):
        return uuid.uuid4()

    @pytest.fixture
    def user_id(self):
        return "user-123"

    @pytest.mark.asyncio
    async def test_both_assignments(self, service, campaign_id, user_id):
        """Volunteer with both canvassing and phone banking assignments."""
        wl = _make_walk_list(total=47, visited=12)
        cl_id = uuid.uuid4()
        session = _make_phone_session(call_list_id=cl_id)
        call_list = _make_call_list(total=100, completed=25)
        campaign = _make_campaign("Johnson for Mayor")

        db = AsyncMock()
        # Setup execute calls to return mocks in order:
        # 1. canvassing query -> walk_list
        # 2. phone banking query -> session
        # 3. call list query -> call_list
        canvassing_result = MagicMock()
        canvassing_result.scalar_one_or_none.return_value = wl

        phone_result = MagicMock()
        phone_result.scalar_one_or_none.return_value = session

        call_list_result = MagicMock()
        call_list_result.scalar_one_or_none.return_value = call_list

        counts_result = _make_counts_result(47, 12)

        db.execute = AsyncMock(
            side_effect=[
                canvassing_result,
                phone_result,
                call_list_result,
                counts_result,
            ]
        )
        db.scalar = AsyncMock(return_value=campaign)

        result = await service.get_field_me(
            db=db,
            campaign_id=campaign_id,
            user_id=user_id,
            display_name="Sarah Johnson",
            email="sarah@example.com",
        )

        assert result["volunteer_name"] == "Sarah Johnson"
        assert result["campaign_name"] == "Johnson for Mayor"
        assert result["canvassing"]["walk_list_id"] == wl.id
        assert result["canvassing"]["name"] == "Walk List 1"
        assert result["canvassing"]["total"] == 47
        assert result["canvassing"]["completed"] == 12
        assert result["phone_banking"]["session_id"] == session.id
        assert result["phone_banking"]["name"] == "Evening Calls"
        assert result["phone_banking"]["total"] == 100
        assert result["phone_banking"]["completed"] == 25

    @pytest.mark.asyncio
    async def test_only_canvassing(self, service, campaign_id, user_id):
        """Volunteer with only a canvassing assignment."""
        wl = _make_walk_list()
        campaign = _make_campaign()

        db = AsyncMock()
        canvassing_result = MagicMock()
        canvassing_result.scalar_one_or_none.return_value = wl

        phone_result = MagicMock()
        phone_result.scalar_one_or_none.return_value = None

        counts_result = _make_counts_result(47, 12)

        db.execute = AsyncMock(
            side_effect=[canvassing_result, phone_result, counts_result]
        )
        db.scalar = AsyncMock(return_value=campaign)

        result = await service.get_field_me(
            db=db,
            campaign_id=campaign_id,
            user_id=user_id,
            display_name="Sarah",
            email=None,
        )

        assert result["canvassing"] is not None
        assert result["phone_banking"] is None

    @pytest.mark.asyncio
    async def test_only_phone_banking(self, service, campaign_id, user_id):
        """Volunteer with only a phone banking assignment."""
        session = _make_phone_session()
        call_list = _make_call_list()
        campaign = _make_campaign()

        db = AsyncMock()
        canvassing_result = MagicMock()
        canvassing_result.scalar_one_or_none.return_value = None

        phone_result = MagicMock()
        phone_result.scalar_one_or_none.return_value = session

        call_list_result = MagicMock()
        call_list_result.scalar_one_or_none.return_value = call_list

        db.execute = AsyncMock(
            side_effect=[canvassing_result, phone_result, call_list_result]
        )
        db.scalar = AsyncMock(return_value=campaign)

        result = await service.get_field_me(
            db=db,
            campaign_id=campaign_id,
            user_id=user_id,
            display_name=None,
            email="sarah@example.com",
        )

        assert result["canvassing"] is None
        assert result["phone_banking"] is not None
        # Falls back to email when no display_name
        assert result["volunteer_name"] == "sarah@example.com"

    @pytest.mark.asyncio
    async def test_no_assignments(self, service, campaign_id, user_id):
        """Volunteer with no assignments at all."""
        campaign = _make_campaign()

        db = AsyncMock()
        canvassing_result = MagicMock()
        canvassing_result.scalar_one_or_none.return_value = None

        phone_result = MagicMock()
        phone_result.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[canvassing_result, phone_result])
        db.scalar = AsyncMock(return_value=campaign)

        result = await service.get_field_me(
            db=db,
            campaign_id=campaign_id,
            user_id=user_id,
            display_name=None,
            email=None,
        )

        assert result["canvassing"] is None
        assert result["phone_banking"] is None
        assert result["volunteer_name"] == "Volunteer"

    @pytest.mark.asyncio
    async def test_fallback_campaign_name(self, service, campaign_id, user_id):
        """Campaign name defaults when campaign not found."""
        db = AsyncMock()
        canvassing_result = MagicMock()
        canvassing_result.scalar_one_or_none.return_value = None
        phone_result = MagicMock()
        phone_result.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[canvassing_result, phone_result])
        db.scalar = AsyncMock(return_value=None)

        result = await service.get_field_me(
            db=db,
            campaign_id=campaign_id,
            user_id=user_id,
            display_name="Test",
            email=None,
        )

        assert result["campaign_name"] == "Campaign"
