"""Unit tests for call list generation, claiming, and lifecycle.

Covers PHONE-01, PHONE-03.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.time import utcnow
from app.models.call_list import (
    CallList,
    CallListEntry,
    CallListStatus,
    EntryStatus,
)


def _make_call_list(**overrides) -> MagicMock:
    """Create a mock CallList with sensible defaults."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "voter_list_id": None,
        "script_id": None,
        "name": "Test Call List",
        "status": CallListStatus.DRAFT,
        "total_entries": 0,
        "completed_entries": 0,
        "max_attempts": 3,
        "claim_timeout_minutes": 30,
        "cooldown_minutes": 60,
        "created_by": "user-1",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    defaults.update(overrides)
    cl = MagicMock(spec=CallList)
    for k, v in defaults.items():
        setattr(cl, k, v)
    return cl


def _make_entry(**overrides) -> MagicMock:
    """Create a mock CallListEntry with sensible defaults."""
    defaults = {
        "id": uuid.uuid4(),
        "call_list_id": uuid.uuid4(),
        "voter_id": uuid.uuid4(),
        "priority_score": 50,
        "phone_numbers": [
            {
                "phone_id": str(uuid.uuid4()),
                "value": "5551234567",
                "type": "cell",
                "is_primary": True,
            }
        ],
        "status": EntryStatus.AVAILABLE,
        "attempt_count": 0,
        "claimed_by": None,
        "claimed_at": None,
        "last_attempt_at": None,
        "phone_attempts": None,
    }
    defaults.update(overrides)
    entry = MagicMock(spec=CallListEntry)
    for k, v in defaults.items():
        setattr(entry, k, v)
    return entry


def _phone_row(
    voter_id, phone_id, value, phone_type="cell", is_primary=True
):
    """Create a mock phone query result row."""
    return MagicMock(
        voter_id=voter_id,
        phone_id=phone_id,
        phone_value=value,
        phone_type=phone_type,
        is_primary=is_primary,
    )


class TestCallListGeneration:
    """Tests for call list generation from voter universes."""

    @pytest.mark.asyncio
    async def test_generate_call_list_from_voter_list(self) -> None:
        """PHONE-01: generates frozen snapshot with phone/DNC filter."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()
        voter_list_id = uuid.uuid4()

        # Mock voter list lookup
        voter_list_result = MagicMock()
        voter_list_obj = MagicMock()
        voter_list_obj.filter_query = {"party": "D"}
        voter_list_obj.list_type = "dynamic"
        voter_list_result.scalar_one_or_none.return_value = (
            voter_list_obj
        )

        # Mock voter+phone query: two voters with valid phones
        v1 = uuid.uuid4()
        v2 = uuid.uuid4()
        rows = [
            _phone_row(v1, uuid.uuid4(), "5551234567"),
            _phone_row(v2, uuid.uuid4(), "5559876543", "home"),
        ]
        voter_phone_result = MagicMock()
        voter_phone_result.all.return_value = rows

        # Mock DNC check: no DNC numbers
        dnc_result = MagicMock()
        dnc_result.scalars.return_value.all.return_value = []

        # Mock interaction count for priority
        interaction_result = MagicMock()
        interaction_result.all.return_value = []

        session.execute = AsyncMock(side_effect=[
            voter_list_result,
            voter_phone_result,
            dnc_result,
            interaction_result,
        ])

        from app.schemas.call_list import CallListCreate

        data = CallListCreate(
            name="Test List",
            voter_list_id=voter_list_id,
        )

        result = await svc.generate_call_list(
            session, campaign_id, data, "user-1"
        )

        assert result is not None
        assert result.status == CallListStatus.DRAFT
        assert result.total_entries == 2
        add_calls = list(session.add.call_args_list)
        assert len(add_calls) >= 3  # 2 entries + 1 call list

    @pytest.mark.asyncio
    async def test_generate_call_list_phone_validation(self) -> None:
        """PHONE-01: filters out invalid phone numbers."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        v1 = uuid.uuid4()
        v2 = uuid.uuid4()
        rows = [
            _phone_row(v1, uuid.uuid4(), "123"),
            _phone_row(v2, uuid.uuid4(), "5551234567"),
        ]
        voter_phone_result = MagicMock()
        voter_phone_result.all.return_value = rows

        dnc_result = MagicMock()
        dnc_result.scalars.return_value.all.return_value = []

        interaction_result = MagicMock()
        interaction_result.all.return_value = []

        session.execute = AsyncMock(side_effect=[
            voter_phone_result,
            dnc_result,
            interaction_result,
        ])

        from app.schemas.call_list import CallListCreate

        data = CallListCreate(name="Phone Validation Test")

        result = await svc.generate_call_list(
            session, campaign_id, data, "user-1"
        )

        # Only v2 included (v1's only phone is invalid)
        assert result.total_entries == 1

    @pytest.mark.asyncio
    async def test_generate_call_list_dnc_filtering(self) -> None:
        """PHONE-01: excludes voters with all phones on DNC."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        v1 = uuid.uuid4()
        v2 = uuid.uuid4()
        rows = [
            _phone_row(v1, uuid.uuid4(), "5551111111"),
            _phone_row(v2, uuid.uuid4(), "5552222222"),
        ]
        voter_phone_result = MagicMock()
        voter_phone_result.all.return_value = rows

        # v1's phone is on DNC
        dnc_result = MagicMock()
        dnc_result.scalars.return_value.all.return_value = [
            "5551111111"
        ]

        interaction_result = MagicMock()
        interaction_result.all.return_value = []

        session.execute = AsyncMock(side_effect=[
            voter_phone_result,
            dnc_result,
            interaction_result,
        ])

        from app.schemas.call_list import CallListCreate

        data = CallListCreate(name="DNC Filter Test")

        result = await svc.generate_call_list(
            session, campaign_id, data, "user-1"
        )

        # Only v2 should be included (v1 fully DNC'd)
        assert result.total_entries == 1

    @pytest.mark.asyncio
    async def test_multi_phone_entry(self) -> None:
        """PHONE-01: entry phones ordered primary-first."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()

        vid = uuid.uuid4()
        p1 = uuid.uuid4()
        p2 = uuid.uuid4()
        rows = [
            _phone_row(vid, p1, "5551234567", "home", False),
            _phone_row(vid, p2, "5559876543", "cell", True),
        ]
        voter_phone_result = MagicMock()
        voter_phone_result.all.return_value = rows

        dnc_result = MagicMock()
        dnc_result.scalars.return_value.all.return_value = []

        interaction_result = MagicMock()
        interaction_result.all.return_value = []

        session.execute = AsyncMock(side_effect=[
            voter_phone_result,
            dnc_result,
            interaction_result,
        ])

        from app.schemas.call_list import CallListCreate

        data = CallListCreate(name="Multi Phone Test")

        result = await svc.generate_call_list(
            session, campaign_id, data, "user-1"
        )

        assert result.total_entries == 1
        # Find the entry that was added
        entry_added = None
        for call in session.add.call_args_list:
            obj = call[0][0]
            if isinstance(obj, CallListEntry):
                entry_added = obj
                break

        assert entry_added is not None
        # Primary phone should be first
        assert entry_added.phone_numbers[0]["is_primary"] is True
        assert entry_added.phone_numbers[0]["value"] == "5559876543"
        assert len(entry_added.phone_numbers) == 2


class TestCallListClaiming:
    """Tests for claim-on-fetch entry distribution."""

    @pytest.mark.asyncio
    async def test_claim_entries_returns_batch(self) -> None:
        """PHONE-01: claim returns correct batch ordered by priority."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        call_list_id = uuid.uuid4()
        caller_id = "caller-1"

        call_list = _make_call_list(
            id=call_list_id,
            status=CallListStatus.ACTIVE,
            max_attempts=3,
        )

        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = call_list

        stale_result = MagicMock()
        stale_result.rowcount = 0

        entries = [
            _make_entry(
                call_list_id=call_list_id, priority_score=90
            ),
            _make_entry(
                call_list_id=call_list_id, priority_score=70
            ),
            _make_entry(
                call_list_id=call_list_id, priority_score=50
            ),
        ]
        entries_result = MagicMock()
        entries_result.scalars.return_value.all.return_value = (
            entries
        )

        claim_result = MagicMock()

        session.execute = AsyncMock(side_effect=[
            cl_result,
            stale_result,
            entries_result,
            claim_result,
        ])

        result = await svc.claim_entries(
            session, call_list_id, caller_id, batch_size=3
        )

        assert len(result) == 3
        for entry in result:
            assert entry.status == EntryStatus.IN_PROGRESS
            assert entry.claimed_by == caller_id

    @pytest.mark.asyncio
    async def test_release_stale_claims(self) -> None:
        """PHONE-01: stale entries released on next claim."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        call_list_id = uuid.uuid4()

        call_list = _make_call_list(
            id=call_list_id,
            status=CallListStatus.ACTIVE,
            claim_timeout_minutes=30,
        )

        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = call_list

        stale_result = MagicMock()
        stale_result.rowcount = 2

        entries_result = MagicMock()
        entries_result.scalars.return_value.all.return_value = []

        session.execute = AsyncMock(side_effect=[
            cl_result,
            stale_result,
            entries_result,
        ])

        await svc.claim_entries(
            session, call_list_id, "caller-1", batch_size=5
        )

        assert session.execute.call_count >= 2

    @pytest.mark.asyncio
    async def test_priority_score_ordering(self) -> None:
        """PHONE-01: entries in descending priority order."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        call_list_id = uuid.uuid4()

        call_list = _make_call_list(
            id=call_list_id, status=CallListStatus.ACTIVE
        )

        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = call_list

        stale_result = MagicMock()
        stale_result.rowcount = 0

        entries = [
            _make_entry(
                call_list_id=call_list_id, priority_score=100
            ),
            _make_entry(
                call_list_id=call_list_id, priority_score=80
            ),
            _make_entry(
                call_list_id=call_list_id, priority_score=60
            ),
        ]
        entries_result = MagicMock()
        entries_result.scalars.return_value.all.return_value = (
            entries
        )

        claim_result = MagicMock()

        session.execute = AsyncMock(side_effect=[
            cl_result, stale_result, entries_result, claim_result,
        ])

        result = await svc.claim_entries(
            session, call_list_id, "caller-1", batch_size=5
        )

        assert len(result) == 3
        scores = [e.priority_score for e in result]
        assert scores == [100, 80, 60]


class TestCallListEntryStatus:
    """Tests for entry status transitions and recycling."""

    @pytest.mark.asyncio
    async def test_auto_recycle_no_answer(self) -> None:
        """PHONE-01: no_answer entries return after cooldown."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        call_list_id = uuid.uuid4()

        call_list = _make_call_list(
            id=call_list_id,
            status=CallListStatus.ACTIVE,
            cooldown_minutes=60,
            max_attempts=3,
        )

        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = call_list

        stale_result = MagicMock()
        stale_result.rowcount = 0

        cooled_entry = _make_entry(
            call_list_id=call_list_id,
            status=EntryStatus.AVAILABLE,
            attempt_count=1,
            last_attempt_at=utcnow() - timedelta(hours=2),
        )
        entries_result = MagicMock()
        entries_result.scalars.return_value.all.return_value = [
            cooled_entry
        ]

        claim_result = MagicMock()

        session.execute = AsyncMock(side_effect=[
            cl_result, stale_result, entries_result, claim_result,
        ])

        result = await svc.claim_entries(
            session, call_list_id, "caller-1", batch_size=5
        )

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_terminal_outcome_never_retried(self) -> None:
        """PHONE-03: terminal entries never return to pool."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()
        call_list_id = uuid.uuid4()

        call_list = _make_call_list(
            id=call_list_id, status=CallListStatus.ACTIVE
        )

        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = call_list

        stale_result = MagicMock()
        stale_result.rowcount = 0

        entries_result = MagicMock()
        entries_result.scalars.return_value.all.return_value = []

        session.execute = AsyncMock(side_effect=[
            cl_result, stale_result, entries_result,
        ])

        result = await svc.claim_entries(
            session, call_list_id, "caller-1", batch_size=5
        )

        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_call_list_status_lifecycle(self) -> None:
        """Lifecycle: draft->active->completed, no backward."""
        from app.services.call_list import CallListService

        svc = CallListService()
        session = AsyncMock()

        call_list = _make_call_list(status=CallListStatus.DRAFT)
        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = call_list
        session.execute = AsyncMock(return_value=cl_result)

        # Draft -> Active should succeed
        result = await svc.update_status(
            session, call_list.id, CallListStatus.ACTIVE
        )
        assert result.status == CallListStatus.ACTIVE

        # Active -> Completed should succeed
        cl_active = _make_call_list(status=CallListStatus.ACTIVE)
        cl_result2 = MagicMock()
        cl_result2.scalar_one_or_none.return_value = cl_active
        session.execute = AsyncMock(return_value=cl_result2)

        result2 = await svc.update_status(
            session, cl_active.id, CallListStatus.COMPLETED
        )
        assert result2.status == CallListStatus.COMPLETED

        # Completed -> Active should fail
        cl_done = _make_call_list(status=CallListStatus.COMPLETED)
        cl_result3 = MagicMock()
        cl_result3.scalar_one_or_none.return_value = cl_done
        session.execute = AsyncMock(return_value=cl_result3)

        with pytest.raises(ValueError, match="Invalid status"):
            await svc.update_status(
                session, cl_done.id, CallListStatus.ACTIVE
            )


class TestCalculatePriorityScore:
    """Tests for priority score calculation."""

    def test_calculate_priority_score_zero_interactions(self) -> None:
        """No interactions should give max score."""
        from app.services.call_list import calculate_priority_score

        assert calculate_priority_score(0) == 100

    def test_calculate_priority_score_some_interactions(self) -> None:
        """Score decreases by 20 per interaction."""
        from app.services.call_list import calculate_priority_score

        assert calculate_priority_score(2) == 60

    def test_calculate_priority_score_many_interactions(self) -> None:
        """Score floors at 0."""
        from app.services.call_list import calculate_priority_score

        assert calculate_priority_score(10) == 0
