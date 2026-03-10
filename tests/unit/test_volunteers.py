"""Unit tests for volunteer management -- VOL-01."""

from __future__ import annotations

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.time import utcnow
from app.models.volunteer import (
    Volunteer,
    VolunteerAvailability,
    VolunteerStatus,
    VolunteerTag,
    VolunteerTagMember,
)
from app.services.volunteer import VolunteerService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_volunteer(**overrides) -> MagicMock:
    """Create a mock Volunteer with sensible defaults."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "user_id": "user-1",
        "first_name": "Jane",
        "last_name": "Doe",
        "phone": "5551234567",
        "email": "jane@example.com",
        "street": "123 Main St",
        "city": "Springfield",
        "state": "IL",
        "zip_code": "62701",
        "emergency_contact_name": "John Doe",
        "emergency_contact_phone": "5559876543",
        "notes": None,
        "status": VolunteerStatus.PENDING,
        "skills": ["canvassing", "phone_banking"],
        "created_by": "manager-1",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=Volunteer)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_availability(**overrides) -> MagicMock:
    """Create a mock VolunteerAvailability."""
    defaults = {
        "id": uuid.uuid4(),
        "volunteer_id": uuid.uuid4(),
        "start_at": utcnow(),
        "end_at": utcnow() + timedelta(hours=4),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=VolunteerAvailability)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_tag(**overrides) -> MagicMock:
    """Create a mock VolunteerTag."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "name": "bilingual-spanish",
        "created_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=VolunteerTag)
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
    return result


def _mock_scalars_result(values):
    """Create a mock result that returns values from scalars().all()."""
    result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = values
    result.scalars.return_value = scalars_mock
    return result


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestVolunteerCRUD:
    """Tests for volunteer creation and profile management."""

    @pytest.mark.asyncio
    async def test_create_volunteer_with_profile(self) -> None:
        """Manager creates volunteer with full profile."""
        db = _mock_db()
        svc = VolunteerService()
        campaign_id = uuid.uuid4()

        from app.schemas.volunteer import VolunteerCreate

        data = VolunteerCreate(
            first_name="Jane",
            last_name="Doe",
            phone="5551234567",
            email="jane@example.com",
            emergency_contact_name="John Doe",
            emergency_contact_phone="5559876543",
            skills=["canvassing", "phone_banking"],
        )

        result = await svc.create_volunteer(db, campaign_id, data, "manager-1")

        assert result.first_name == "Jane"
        assert result.last_name == "Doe"
        assert result.status == VolunteerStatus.PENDING
        assert result.skills == ["canvassing", "phone_banking"]
        assert result.campaign_id == campaign_id
        assert result.created_by == "manager-1"
        assert result.user_id is None
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_self_register_volunteer(self) -> None:
        """Logged-in user self-registers (auto-links user_id)."""
        db = _mock_db()
        svc = VolunteerService()
        campaign_id = uuid.uuid4()

        # No existing volunteer for this user
        db.execute.return_value = _mock_scalar_result(None)

        from app.schemas.volunteer import VolunteerCreate

        data = VolunteerCreate(first_name="Jane", last_name="Doe")

        result = await svc.self_register(db, campaign_id, "user-1", data)

        assert result.user_id == "user-1"
        assert result.created_by == "user-1"
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_self_register_duplicate_raises(self) -> None:
        """Self-registration fails if user already registered."""
        db = _mock_db()
        svc = VolunteerService()
        campaign_id = uuid.uuid4()

        existing = _make_volunteer(user_id="user-1")
        db.execute.return_value = _mock_scalar_result(existing)

        from app.schemas.volunteer import VolunteerCreate

        data = VolunteerCreate(first_name="Jane", last_name="Doe")

        with pytest.raises(ValueError, match="already registered"):
            await svc.self_register(db, campaign_id, "user-1", data)

    @pytest.mark.asyncio
    async def test_create_volunteer_walk_in(self) -> None:
        """Manager creates walk-in volunteer (no user_id)."""
        db = _mock_db()
        svc = VolunteerService()
        campaign_id = uuid.uuid4()

        from app.schemas.volunteer import VolunteerCreate

        data = VolunteerCreate(first_name="Walk", last_name="In")

        result = await svc.create_volunteer(db, campaign_id, data, "manager-1")

        assert result.user_id is None
        assert result.first_name == "Walk"

    @pytest.mark.asyncio
    async def test_update_volunteer_profile(self) -> None:
        """Update profile fields."""
        db = _mock_db()
        svc = VolunteerService()
        volunteer = _make_volunteer()
        db.execute.return_value = _mock_scalar_result(volunteer)

        from app.schemas.volunteer import VolunteerUpdate

        data = VolunteerUpdate(phone="5550000000", email="new@example.com")

        result = await svc.update_volunteer(db, volunteer.id, data)

        assert result.phone == "5550000000"
        assert result.email == "new@example.com"

    @pytest.mark.asyncio
    async def test_volunteer_status_transitions(self) -> None:
        """Pending -> active -> inactive only. No backward transitions."""
        db = _mock_db()
        svc = VolunteerService()

        # pending -> active: allowed
        vol1 = _make_volunteer(status=VolunteerStatus.PENDING)
        db.execute.return_value = _mock_scalar_result(vol1)
        result = await svc.update_status(db, vol1.id, VolunteerStatus.ACTIVE)
        assert result.status == VolunteerStatus.ACTIVE

        # active -> inactive: allowed
        vol2 = _make_volunteer(status=VolunteerStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(vol2)
        result = await svc.update_status(db, vol2.id, VolunteerStatus.INACTIVE)
        assert result.status == VolunteerStatus.INACTIVE

        # inactive -> active: NOT allowed
        vol3 = _make_volunteer(status=VolunteerStatus.INACTIVE)
        db.execute.return_value = _mock_scalar_result(vol3)
        with pytest.raises(ValueError, match="Invalid status transition"):
            await svc.update_status(db, vol3.id, VolunteerStatus.ACTIVE)

    @pytest.mark.asyncio
    async def test_add_volunteer_skills(self) -> None:
        """Add predefined skill categories via update."""
        db = _mock_db()
        svc = VolunteerService()
        volunteer = _make_volunteer(skills=["canvassing"])
        db.execute.return_value = _mock_scalar_result(volunteer)

        from app.schemas.volunteer import VolunteerUpdate

        data = VolunteerUpdate(skills=["canvassing", "phone_banking", "driving"])

        result = await svc.update_volunteer(db, volunteer.id, data)

        assert result.skills == ["canvassing", "phone_banking", "driving"]


class TestVolunteerTags:
    """Tests for volunteer tag management."""

    @pytest.mark.asyncio
    async def test_add_volunteer_tags(self) -> None:
        """Add free-form campaign-scoped tag to volunteer."""
        db = _mock_db()
        svc = VolunteerService()
        volunteer_id = uuid.uuid4()
        tag_id = uuid.uuid4()

        result = await svc.add_tag(db, volunteer_id, tag_id)

        assert result.volunteer_id == volunteer_id
        assert result.tag_id == tag_id
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_remove_volunteer_tag(self) -> None:
        """Remove tag from volunteer."""
        db = _mock_db()
        svc = VolunteerService()
        volunteer_id = uuid.uuid4()
        tag_id = uuid.uuid4()

        tag_member = MagicMock(spec=VolunteerTagMember)
        db.execute.return_value = _mock_scalar_result(tag_member)

        await svc.remove_tag(db, volunteer_id, tag_id)

        db.delete.assert_called_once_with(tag_member)

    @pytest.mark.asyncio
    async def test_remove_nonexistent_tag_raises(self) -> None:
        """Removing a tag not assigned raises ValueError."""
        db = _mock_db()
        svc = VolunteerService()
        db.execute.return_value = _mock_scalar_result(None)

        with pytest.raises(ValueError, match="not assigned"):
            await svc.remove_tag(db, uuid.uuid4(), uuid.uuid4())


class TestVolunteerAvailability:
    """Tests for availability slot management."""

    @pytest.mark.asyncio
    async def test_create_availability_slot(self) -> None:
        """Add availability time window with valid start/end."""
        db = _mock_db()
        svc = VolunteerService()
        volunteer_id = uuid.uuid4()

        from app.schemas.volunteer import AvailabilityCreate

        now = utcnow()
        data = AvailabilityCreate(
            start_at=now,
            end_at=now + timedelta(hours=4),
        )

        result = await svc.add_availability(db, volunteer_id, data)

        assert result.volunteer_id == volunteer_id
        assert result.start_at == now
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_availability_invalid_times(self) -> None:
        """end_at must be after start_at."""
        db = _mock_db()
        svc = VolunteerService()

        from app.schemas.volunteer import AvailabilityCreate

        now = utcnow()
        data = AvailabilityCreate(
            start_at=now + timedelta(hours=4),
            end_at=now,
        )

        with pytest.raises(ValueError, match="end_at must be after start_at"):
            await svc.add_availability(db, uuid.uuid4(), data)

    @pytest.mark.asyncio
    async def test_delete_availability_slot(self) -> None:
        """Remove availability slot."""
        db = _mock_db()
        svc = VolunteerService()
        availability = _make_availability()
        db.execute.return_value = _mock_scalar_result(availability)

        await svc.delete_availability(db, availability.id)

        db.delete.assert_called_once_with(availability)

    @pytest.mark.asyncio
    async def test_delete_nonexistent_availability_raises(self) -> None:
        """Deleting nonexistent availability raises ValueError."""
        db = _mock_db()
        svc = VolunteerService()
        db.execute.return_value = _mock_scalar_result(None)

        with pytest.raises(ValueError, match="not found"):
            await svc.delete_availability(db, uuid.uuid4())


class TestVolunteerSearch:
    """Tests for volunteer listing and search."""

    @pytest.mark.asyncio
    async def test_list_volunteers_with_filters(self) -> None:
        """Search/filter volunteers returns results."""
        db = _mock_db()
        svc = VolunteerService()
        campaign_id = uuid.uuid4()

        volunteers = [_make_volunteer(), _make_volunteer()]
        db.execute.return_value = _mock_scalars_result(volunteers)

        result = await svc.list_volunteers(
            db, campaign_id, status=VolunteerStatus.ACTIVE
        )

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_get_volunteer_detail(self) -> None:
        """Includes tags and availability."""
        db = _mock_db()
        svc = VolunteerService()
        volunteer = _make_volunteer()
        tags = ["bilingual", "experienced"]
        availability = [_make_availability()]

        # First call: get_volunteer, second: tags, third: availability
        db.execute.side_effect = [
            _mock_scalar_result(volunteer),
            _mock_scalars_result(tags),
            _mock_scalars_result(availability),
        ]

        result = await svc.get_volunteer_detail(db, volunteer.id)

        assert result is not None
        assert result["volunteer"] == volunteer
        assert result["tags"] == tags
        assert len(result["availability"]) == 1

    @pytest.mark.asyncio
    async def test_get_volunteer_detail_not_found(self) -> None:
        """Returns None if volunteer does not exist."""
        db = _mock_db()
        svc = VolunteerService()
        db.execute.return_value = _mock_scalar_result(None)

        result = await svc.get_volunteer_detail(db, uuid.uuid4())

        assert result is None


class TestVolunteerPendingGate:
    """Test that pending volunteers cannot sign up for shifts."""

    @pytest.mark.asyncio
    async def test_volunteer_pending_cannot_signup(self) -> None:
        """Pending status blocks shift signup via ShiftService."""
        from app.models.shift import Shift, ShiftStatus, ShiftType
        from app.services.shift import ShiftService

        db = _mock_db()
        svc = ShiftService()

        shift = MagicMock(spec=Shift)
        shift.id = uuid.uuid4()
        shift.type = ShiftType.GENERAL
        shift.max_volunteers = 10
        shift.status = ShiftStatus.SCHEDULED

        volunteer = _make_volunteer(status=VolunteerStatus.PENDING)

        # get_shift_raw, get_volunteer
        db.execute.side_effect = [
            _mock_scalar_result(shift),
            _mock_scalar_result(volunteer),
        ]

        with pytest.raises(ValueError, match="ACTIVE"):
            await svc.signup_volunteer(db, shift.id, volunteer.id)
