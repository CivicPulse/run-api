"""Unit tests for shift management -- VOL-02 through VOL-06."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.time import utcnow
from app.models.shift import (
    Shift,
    ShiftStatus,
    ShiftType,
    ShiftVolunteer,
    SignupStatus,
)
from app.models.volunteer import Volunteer, VolunteerStatus
from app.services.shift import ShiftService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_shift(**overrides) -> MagicMock:
    """Create a mock Shift with sensible defaults."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "name": "Morning Canvass",
        "description": None,
        "type": ShiftType.GENERAL,
        "status": ShiftStatus.SCHEDULED,
        "start_at": utcnow() + timedelta(hours=2),
        "end_at": utcnow() + timedelta(hours=6),
        "max_volunteers": 5,
        "location_name": "HQ",
        "street": None,
        "city": None,
        "state": None,
        "zip_code": None,
        "latitude": None,
        "longitude": None,
        "turf_id": None,
        "phone_bank_session_id": None,
        "created_by": "manager-1",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=Shift)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_volunteer(**overrides) -> MagicMock:
    """Create a mock Volunteer."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "user_id": "user-1",
        "first_name": "Jane",
        "last_name": "Doe",
        "phone": "5551234567",
        "email": "jane@example.com",
        "emergency_contact_name": "John Doe",
        "emergency_contact_phone": "5559876543",
        "status": VolunteerStatus.ACTIVE,
        "skills": [],
        "created_by": "manager-1",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=Volunteer)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_shift_volunteer(**overrides) -> MagicMock:
    """Create a mock ShiftVolunteer."""
    defaults = {
        "id": uuid.uuid4(),
        "shift_id": uuid.uuid4(),
        "volunteer_id": uuid.uuid4(),
        "status": SignupStatus.SIGNED_UP,
        "waitlist_position": None,
        "check_in_at": None,
        "check_out_at": None,
        "adjusted_hours": None,
        "adjustment_reason": None,
        "adjusted_by": None,
        "adjusted_at": None,
        "signed_up_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=ShiftVolunteer)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _mock_db():
    """Create a mock AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    db.delete = AsyncMock()
    return db


def _mock_scalar_result(value):
    """Create a mock result that returns value from scalar_one_or_none."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.scalar.return_value = value
    return result


def _mock_count_result(count):
    """Create a mock result for count queries."""
    result = MagicMock()
    result.scalar.return_value = count
    return result


def _mock_scalars_result(values):
    """Create a mock result for scalars().all()."""
    result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = values
    result.scalars.return_value = scalars_mock
    return result


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestShiftCRUD:
    """Tests for shift creation and management (VOL-03)."""

    @pytest.mark.asyncio
    async def test_create_shift_canvassing(self) -> None:
        """Create canvassing shift with turf_id."""
        db = _mock_db()
        svc = ShiftService()
        campaign_id = uuid.uuid4()
        turf_id = uuid.uuid4()

        from app.schemas.shift import ShiftCreate

        data = ShiftCreate(
            name="Door Knock AM",
            type=ShiftType.CANVASSING,
            start_at=utcnow() + timedelta(hours=1),
            end_at=utcnow() + timedelta(hours=5),
            max_volunteers=10,
            turf_id=turf_id,
        )

        result = await svc.create_shift(db, campaign_id, data, "manager-1")

        assert result.type == ShiftType.CANVASSING
        assert result.turf_id == turf_id
        assert result.status == ShiftStatus.SCHEDULED
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_shift_phone_banking(self) -> None:
        """Create phone banking shift with session_id."""
        db = _mock_db()
        svc = ShiftService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()

        from app.schemas.shift import ShiftCreate

        data = ShiftCreate(
            name="Evening Calls",
            type=ShiftType.PHONE_BANKING,
            start_at=utcnow() + timedelta(hours=1),
            end_at=utcnow() + timedelta(hours=4),
            max_volunteers=8,
            phone_bank_session_id=session_id,
        )

        result = await svc.create_shift(db, campaign_id, data, "manager-1")

        assert result.type == ShiftType.PHONE_BANKING
        assert result.phone_bank_session_id == session_id

    @pytest.mark.asyncio
    async def test_create_shift_general(self) -> None:
        """Create general shift (no operational link)."""
        db = _mock_db()
        svc = ShiftService()
        campaign_id = uuid.uuid4()

        from app.schemas.shift import ShiftCreate

        data = ShiftCreate(
            name="Yard Sign Setup",
            type=ShiftType.GENERAL,
            start_at=utcnow() + timedelta(hours=1),
            end_at=utcnow() + timedelta(hours=3),
            max_volunteers=5,
        )

        result = await svc.create_shift(db, campaign_id, data, "manager-1")

        assert result.type == ShiftType.GENERAL
        assert result.turf_id is None
        assert result.phone_bank_session_id is None

    @pytest.mark.asyncio
    async def test_update_shift(self) -> None:
        """Update shift fields only when SCHEDULED."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(status=ShiftStatus.SCHEDULED)
        db.execute.return_value = _mock_scalar_result(shift)

        from app.schemas.shift import ShiftUpdate

        data = ShiftUpdate(name="Updated Name", max_volunteers=20)
        result = await svc.update_shift(db, shift.id, data)

        assert result.name == "Updated Name"
        assert result.max_volunteers == 20

    @pytest.mark.asyncio
    async def test_update_shift_not_scheduled_fails(self) -> None:
        """Cannot update active shift."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(status=ShiftStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(shift)

        from app.schemas.shift import ShiftUpdate

        data = ShiftUpdate(name="Should Fail")
        with pytest.raises(ValueError, match="SCHEDULED"):
            await svc.update_shift(db, shift.id, data)

    @pytest.mark.asyncio
    async def test_shift_status_transitions(self) -> None:
        """Scheduled -> active -> completed, scheduled -> cancelled."""
        db = _mock_db()
        svc = ShiftService()

        # scheduled -> active: allowed
        s1 = _make_shift(status=ShiftStatus.SCHEDULED)
        db.execute.return_value = _mock_scalar_result(s1)
        result = await svc.update_status(db, s1.id, ShiftStatus.ACTIVE)
        assert result.status == ShiftStatus.ACTIVE

        # active -> completed: allowed
        s2 = _make_shift(status=ShiftStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(s2)
        result = await svc.update_status(db, s2.id, ShiftStatus.COMPLETED)
        assert result.status == ShiftStatus.COMPLETED

        # scheduled -> cancelled: allowed
        s3 = _make_shift(status=ShiftStatus.SCHEDULED)
        db.execute.return_value = _mock_scalar_result(s3)
        result = await svc.update_status(db, s3.id, ShiftStatus.CANCELLED)
        assert result.status == ShiftStatus.CANCELLED

        # completed -> active: NOT allowed
        s4 = _make_shift(status=ShiftStatus.COMPLETED)
        db.execute.return_value = _mock_scalar_result(s4)
        with pytest.raises(ValueError, match="Invalid status transition"):
            await svc.update_status(db, s4.id, ShiftStatus.ACTIVE)

        # cancelled -> scheduled: NOT allowed
        s5 = _make_shift(status=ShiftStatus.CANCELLED)
        db.execute.return_value = _mock_scalar_result(s5)
        with pytest.raises(ValueError, match="Invalid status transition"):
            await svc.update_status(db, s5.id, ShiftStatus.SCHEDULED)


class TestShiftSignup:
    """Tests for volunteer signup flow (VOL-02, VOL-04)."""

    @pytest.mark.asyncio
    async def test_volunteer_signup(self) -> None:
        """Active volunteer signs up for shift with capacity."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(max_volunteers=10)
        volunteer = _make_volunteer(status=VolunteerStatus.ACTIVE)

        db.execute.side_effect = [
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
            _mock_scalar_result(None),  # check existing signup
            _mock_count_result(3),  # signed_up count
        ]

        result = await svc.signup_volunteer(db, shift.id, volunteer.id)

        assert result.status == SignupStatus.SIGNED_UP
        assert result.waitlist_position is None
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_signup_capacity_full_waitlisted(self) -> None:
        """Signup when at capacity goes to waitlist."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(max_volunteers=2)
        volunteer = _make_volunteer(status=VolunteerStatus.ACTIVE)

        db.execute.side_effect = [
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
            _mock_scalar_result(None),  # check existing signup
            _mock_count_result(2),  # signed_up count (at capacity)
            _mock_count_result(1),  # max waitlist position (coalesce)
        ]

        result = await svc.signup_volunteer(db, shift.id, volunteer.id)

        assert result.status == SignupStatus.WAITLISTED
        assert result.waitlist_position == 2  # 1 + 1

    @pytest.mark.asyncio
    async def test_signup_manager_override_capacity(self) -> None:
        """Manager can assign beyond capacity via manager_assign."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(max_volunteers=1)
        volunteer = _make_volunteer(status=VolunteerStatus.ACTIVE)

        db.execute.side_effect = [
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
            _mock_scalar_result(None),  # check existing
        ]

        result = await svc.manager_assign(db, shift.id, volunteer.id)

        # Manager assign always creates SIGNED_UP, no capacity check
        assert result.status == SignupStatus.SIGNED_UP
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_emergency_contact_required_for_field_shift(self) -> None:
        """Blocks signup without emergency contact for canvassing/phone banking."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(type=ShiftType.CANVASSING)
        volunteer = _make_volunteer(
            status=VolunteerStatus.ACTIVE,
            emergency_contact_name=None,
            emergency_contact_phone=None,
        )

        db.execute.side_effect = [
            _mock_scalar_result(shift),
            _mock_scalar_result(volunteer),
        ]

        with pytest.raises(ValueError, match="Emergency contact required"):
            await svc.signup_volunteer(db, shift.id, volunteer.id)

    @pytest.mark.asyncio
    async def test_emergency_contact_not_required_for_general(self) -> None:
        """General shifts do not require emergency contact."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(type=ShiftType.GENERAL, max_volunteers=10)
        volunteer = _make_volunteer(
            status=VolunteerStatus.ACTIVE,
            emergency_contact_name=None,
            emergency_contact_phone=None,
        )

        db.execute.side_effect = [
            _mock_scalar_result(shift),
            _mock_scalar_result(volunteer),
            _mock_scalar_result(None),  # no existing signup
            _mock_count_result(0),  # signed_up count
        ]

        result = await svc.signup_volunteer(db, shift.id, volunteer.id)

        assert result.status == SignupStatus.SIGNED_UP


class TestShiftCancel:
    """Tests for signup cancellation (VOL-02, VOL-04)."""

    @pytest.mark.asyncio
    async def test_self_cancel_before_start(self) -> None:
        """Volunteer cancels before shift.start_at."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(start_at=utcnow() + timedelta(hours=2))
        shift_vol = _make_shift_volunteer(status=SignupStatus.SIGNED_UP)
        volunteer = _make_volunteer(user_id="user-1")

        db.execute.side_effect = [
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(shift_vol),  # _get_shift_volunteer
            _mock_scalar_result(volunteer),  # _get_volunteer (for is_self check)
            _mock_scalar_result(None),  # _promote_from_waitlist
        ]

        from app.core.security import CampaignRole

        result = await svc.cancel_signup(
            db, shift.id, volunteer.id, "user-1", CampaignRole.VOLUNTEER
        )

        assert result.status == SignupStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_self_cancel_after_start_blocked(self) -> None:
        """Volunteer cannot cancel after shift has started."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(start_at=utcnow() - timedelta(hours=1))
        shift_vol = _make_shift_volunteer(status=SignupStatus.SIGNED_UP)
        volunteer = _make_volunteer(user_id="user-1")

        db.execute.side_effect = [
            _mock_scalar_result(shift),
            _mock_scalar_result(shift_vol),
            _mock_scalar_result(volunteer),
        ]

        from app.core.security import CampaignRole

        with pytest.raises(ValueError, match="Cannot self-cancel"):
            await svc.cancel_signup(
                db, shift.id, volunteer.id, "user-1", CampaignRole.VOLUNTEER
            )

    @pytest.mark.asyncio
    async def test_manager_remove_volunteer(self) -> None:
        """Manager removes volunteer from shift (any time)."""
        db = _mock_db()
        svc = ShiftService()
        # Shift started in the past
        shift = _make_shift(start_at=utcnow() - timedelta(hours=1))
        shift_vol = _make_shift_volunteer(status=SignupStatus.SIGNED_UP)
        volunteer = _make_volunteer(user_id="user-1")

        db.execute.side_effect = [
            _mock_scalar_result(shift),
            _mock_scalar_result(shift_vol),
            _mock_scalar_result(volunteer),
            _mock_scalar_result(None),  # _promote_from_waitlist
        ]

        from app.core.security import CampaignRole

        # Manager (not the volunteer themselves) can cancel after start
        result = await svc.cancel_signup(
            db, shift.id, volunteer.id, "manager-1", CampaignRole.MANAGER
        )

        assert result.status == SignupStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_waitlist_auto_promote(self) -> None:
        """Cancellation promotes next waitlisted volunteer."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(start_at=utcnow() + timedelta(hours=2))
        shift_vol = _make_shift_volunteer(status=SignupStatus.SIGNED_UP)
        volunteer = _make_volunteer(user_id="user-1")

        # Waitlisted volunteer to promote
        waitlisted = _make_shift_volunteer(
            status=SignupStatus.WAITLISTED,
            waitlist_position=1,
        )

        db.execute.side_effect = [
            _mock_scalar_result(shift),  # _get_shift_raw (cancel_signup)
            _mock_scalar_result(shift_vol),  # _get_shift_volunteer
            _mock_scalar_result(volunteer),  # _get_volunteer
            _mock_scalar_result(waitlisted),  # _promote_from_waitlist
        ]

        from app.core.security import CampaignRole

        await svc.cancel_signup(
            db, shift.id, volunteer.id, "user-1", CampaignRole.VOLUNTEER
        )

        assert waitlisted.status == SignupStatus.SIGNED_UP
        assert waitlisted.waitlist_position is None


class TestCheckInOut:
    """Tests for check-in/out with side effects (VOL-05)."""

    @pytest.mark.asyncio
    async def test_check_in_volunteer(self) -> None:
        """Check-in records timestamp and sets CHECKED_IN."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(type=ShiftType.GENERAL)
        shift_vol = _make_shift_volunteer()
        volunteer = _make_volunteer()

        db.execute.side_effect = [
            _mock_scalar_result(shift_vol),  # _get_shift_volunteer
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
        ]

        result = await svc.check_in(db, shift.id, volunteer.id)

        assert result.check_in_at is not None
        assert result.status == SignupStatus.CHECKED_IN

    @pytest.mark.asyncio
    async def test_check_in_canvassing_creates_walk_list_canvasser(self) -> None:
        """Canvassing shift check-in creates WalkListCanvasser."""
        db = _mock_db()
        svc = ShiftService()
        turf_id = uuid.uuid4()
        walk_list_id = uuid.uuid4()
        shift = _make_shift(type=ShiftType.CANVASSING, turf_id=turf_id)
        shift_vol = _make_shift_volunteer()
        volunteer = _make_volunteer(user_id="canvasser-1")

        db.execute.side_effect = [
            _mock_scalar_result(shift_vol),  # _get_shift_volunteer
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
            _mock_scalar_result(walk_list_id),  # walk list query
        ]

        result = await svc.check_in(db, shift.id, volunteer.id)

        assert result.status == SignupStatus.CHECKED_IN
        # WalkListCanvasser should have been added
        db.add.assert_called()
        # Find the WalkListCanvasser add call
        from app.models.walk_list import WalkListCanvasser

        added_objects = [call.args[0] for call in db.add.call_args_list]
        canvasser_added = any(
            isinstance(obj, WalkListCanvasser) for obj in added_objects
        )
        assert canvasser_added

    @pytest.mark.asyncio
    async def test_check_in_phone_banking_creates_session_caller(self) -> None:
        """Phone banking shift check-in creates SessionCaller."""
        db = _mock_db()
        svc = ShiftService()
        pb_session_id = uuid.uuid4()
        shift = _make_shift(
            type=ShiftType.PHONE_BANKING,
            phone_bank_session_id=pb_session_id,
        )
        shift_vol = _make_shift_volunteer()
        volunteer = _make_volunteer(user_id="caller-1")

        db.execute.side_effect = [
            _mock_scalar_result(shift_vol),  # _get_shift_volunteer
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
        ]

        result = await svc.check_in(db, shift.id, volunteer.id)

        assert result.status == SignupStatus.CHECKED_IN
        # SessionCaller should have been added
        from app.models.phone_bank import SessionCaller

        added_objects = [call.args[0] for call in db.add.call_args_list]
        caller_added = any(isinstance(obj, SessionCaller) for obj in added_objects)
        assert caller_added

    @pytest.mark.asyncio
    async def test_check_out_volunteer(self) -> None:
        """Check-out records timestamp and sets CHECKED_OUT."""
        db = _mock_db()
        svc = ShiftService()
        shift = _make_shift(type=ShiftType.GENERAL)
        shift_vol = _make_shift_volunteer(
            status=SignupStatus.CHECKED_IN,
            check_in_at=utcnow() - timedelta(hours=3),
        )
        volunteer = _make_volunteer()

        db.execute.side_effect = [
            _mock_scalar_result(shift_vol),  # _get_shift_volunteer
            _mock_scalar_result(shift),  # _get_shift_raw
            _mock_scalar_result(volunteer),  # _get_volunteer
        ]

        result = await svc.check_out(db, shift.id, volunteer.id)

        assert result.check_out_at is not None
        assert result.status == SignupStatus.CHECKED_OUT


class TestHoursTracking:
    """Tests for hours calculation and adjustment (VOL-05, VOL-06)."""

    @pytest.mark.asyncio
    async def test_hours_calculation(self) -> None:
        """Hours computed from (check_out - check_in)."""
        db = _mock_db()
        svc = ShiftService()
        volunteer_id = uuid.uuid4()
        campaign_id = uuid.uuid4()

        check_in = datetime(2026, 3, 9, 9, 0, tzinfo=UTC)
        check_out = datetime(2026, 3, 9, 12, 30, tzinfo=UTC)

        # Mock the query result
        row = MagicMock()
        row.id = uuid.uuid4()
        row.shift_id = uuid.uuid4()
        row.shift_name = "Morning Canvass"
        row.check_in_at = check_in
        row.check_out_at = check_out
        row.adjusted_hours = None

        mock_result = MagicMock()
        mock_result.all.return_value = [row]
        db.execute.return_value = mock_result

        result = await svc.get_volunteer_hours(db, volunteer_id, campaign_id)

        assert result["total_hours"] == 3.5  # 3 hours 30 minutes
        assert result["shifts_worked"] == 1

    @pytest.mark.asyncio
    async def test_hours_with_adjustment(self) -> None:
        """Adjusted_hours overrides computed hours."""
        db = _mock_db()
        svc = ShiftService()
        volunteer_id = uuid.uuid4()
        campaign_id = uuid.uuid4()

        check_in = datetime(2026, 3, 9, 9, 0, tzinfo=UTC)
        check_out = datetime(2026, 3, 9, 12, 30, tzinfo=UTC)

        row = MagicMock()
        row.id = uuid.uuid4()
        row.shift_id = uuid.uuid4()
        row.shift_name = "Morning Canvass"
        row.check_in_at = check_in
        row.check_out_at = check_out
        row.adjusted_hours = 4.0  # Manager adjusted to 4 hours

        mock_result = MagicMock()
        mock_result.all.return_value = [row]
        db.execute.return_value = mock_result

        result = await svc.get_volunteer_hours(db, volunteer_id, campaign_id)

        assert result["total_hours"] == 4.0  # Adjusted hours override
        assert result["shifts_worked"] == 1

    @pytest.mark.asyncio
    async def test_volunteer_hours_summary(self) -> None:
        """Aggregate hours across multiple shifts."""
        db = _mock_db()
        svc = ShiftService()
        volunteer_id = uuid.uuid4()
        campaign_id = uuid.uuid4()

        row1 = MagicMock()
        row1.id = uuid.uuid4()
        row1.shift_id = uuid.uuid4()
        row1.shift_name = "Morning Shift"
        row1.check_in_at = datetime(2026, 3, 8, 9, 0, tzinfo=UTC)
        row1.check_out_at = datetime(2026, 3, 8, 13, 0, tzinfo=UTC)
        row1.adjusted_hours = None

        row2 = MagicMock()
        row2.id = uuid.uuid4()
        row2.shift_id = uuid.uuid4()
        row2.shift_name = "Evening Shift"
        row2.check_in_at = datetime(2026, 3, 9, 17, 0, tzinfo=UTC)
        row2.check_out_at = datetime(2026, 3, 9, 20, 0, tzinfo=UTC)
        row2.adjusted_hours = None

        mock_result = MagicMock()
        mock_result.all.return_value = [row1, row2]
        db.execute.return_value = mock_result

        result = await svc.get_volunteer_hours(db, volunteer_id, campaign_id)

        assert result["total_hours"] == 7.0  # 4 + 3
        assert result["shifts_worked"] == 2
        assert len(result["shifts"]) == 2

    @pytest.mark.asyncio
    async def test_adjust_hours_audit_trail(self) -> None:
        """Manager adjusts hours with audit fields."""
        db = _mock_db()
        svc = ShiftService()
        shift_vol = _make_shift_volunteer(
            status=SignupStatus.CHECKED_OUT,
            check_in_at=utcnow() - timedelta(hours=4),
            check_out_at=utcnow(),
        )

        db.execute.return_value = _mock_scalar_result(shift_vol)

        result = await svc.adjust_hours(
            db,
            shift_vol.shift_id,
            shift_vol.volunteer_id,
            5.0,
            "Arrived early, not captured in system",
            "manager-1",
        )

        assert result.adjusted_hours == 5.0
        assert result.adjustment_reason == "Arrived early, not captured in system"
        assert result.adjusted_by == "manager-1"
        assert result.adjusted_at is not None
