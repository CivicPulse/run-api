"""Unit tests for phone bank sessions, calling,
and supervisor ops -- PHONE-02 to PHONE-05."""

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
    CallResultCode,
    EntryStatus,
)
from app.models.dnc import DNCReason
from app.models.phone_bank import PhoneBankSession, SessionCaller, SessionStatus
from app.schemas.phone_bank import CallRecordCreate
from app.services.phone_bank import PhoneBankService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_session_obj(**overrides) -> MagicMock:
    """Create a mock PhoneBankSession with sensible defaults."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "call_list_id": uuid.uuid4(),
        "name": "Test Session",
        "status": SessionStatus.DRAFT,
        "scheduled_start": None,
        "scheduled_end": None,
        "created_by": "user-1",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=PhoneBankSession)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_caller(**overrides) -> MagicMock:
    """Create a mock SessionCaller."""
    defaults = {
        "id": uuid.uuid4(),
        "session_id": uuid.uuid4(),
        "user_id": "caller-1",
        "check_in_at": None,
        "check_out_at": None,
        "created_at": utcnow(),
    }
    defaults.update(overrides)
    obj = MagicMock(spec=SessionCaller)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_entry(**overrides) -> MagicMock:
    """Create a mock CallListEntry."""
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
            },
            {
                "phone_id": str(uuid.uuid4()),
                "value": "5559876543",
                "type": "home",
                "is_primary": False,
            },
        ],
        "status": EntryStatus.IN_PROGRESS,
        "attempt_count": 0,
        "claimed_by": "caller-1",
        "claimed_at": utcnow(),
        "last_attempt_at": None,
        "phone_attempts": None,
    }
    defaults.update(overrides)
    obj = MagicMock(spec=CallListEntry)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_call_list(**overrides) -> MagicMock:
    """Create a mock CallList."""
    defaults = {
        "id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "script_id": uuid.uuid4(),
        "name": "Test Call List",
        "status": CallListStatus.ACTIVE,
        "total_entries": 10,
        "completed_entries": 0,
        "max_attempts": 3,
    }
    defaults.update(overrides)
    obj = MagicMock(spec=CallList)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _mock_db():
    """Create a mock AsyncSession with standard query support."""
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


class TestPhoneBankSession:
    """Tests for session creation and lifecycle."""

    @pytest.mark.asyncio
    async def test_create_session(self) -> None:
        """Session creation with call list reference."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()

        from app.schemas.phone_bank import PhoneBankSessionCreate

        data = PhoneBankSessionCreate(
            name="Evening Calls",
            call_list_id=uuid.uuid4(),
        )
        db.execute.return_value = _mock_scalar_result(
            _make_call_list(id=data.call_list_id, campaign_id=campaign_id)
        )

        result = await svc.create_session(db, campaign_id, data, "user-1")

        assert result.name == "Evening Calls"
        assert result.status == SessionStatus.DRAFT
        assert result.campaign_id == campaign_id
        db.add.assert_called_once()

    def test_call_record_rejects_negative_duration(self) -> None:
        now = utcnow()
        with pytest.raises(
            ValueError,
            match="call_ended_at must be greater than or equal to call_started_at",
        ):
            CallRecordCreate(
                call_list_entry_id=uuid.uuid4(),
                result_code=CallResultCode.ANSWERED,
                phone_number_used="5551234567",
                call_started_at=now,
                call_ended_at=now - timedelta(minutes=1),
            )

    @pytest.mark.asyncio
    async def test_create_session_rejects_missing_call_list(self) -> None:
        """Missing call_list_id fails cleanly before hitting FK constraints."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()

        from app.schemas.phone_bank import PhoneBankSessionCreate

        data = PhoneBankSessionCreate(
            name="Evening Calls",
            call_list_id=uuid.uuid4(),
        )
        db.execute.return_value = _mock_scalar_result(None)

        with pytest.raises(ValueError, match="Call list .* not found"):
            await svc.create_session(db, campaign_id, data, "user-1")

        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_session_status_lifecycle(self) -> None:
        """Session lifecycle: draft->active, active->paused,
        paused->active, active->completed."""
        db = _mock_db()
        svc = PhoneBankService()

        # draft -> active: allowed
        session_obj = _make_session_obj(status=SessionStatus.DRAFT)
        db.execute.return_value = _mock_scalar_result(session_obj)
        from app.schemas.phone_bank import PhoneBankSessionUpdate

        result = await svc.update_session(
            db, session_obj.id, PhoneBankSessionUpdate(status="active")
        )
        assert result.status == SessionStatus.ACTIVE

        # active -> paused: allowed
        session_obj2 = _make_session_obj(status=SessionStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(session_obj2)
        result = await svc.update_session(
            db, session_obj2.id, PhoneBankSessionUpdate(status="paused")
        )
        assert result.status == SessionStatus.PAUSED

        # paused -> active: allowed
        session_obj3 = _make_session_obj(status=SessionStatus.PAUSED)
        db.execute.return_value = _mock_scalar_result(session_obj3)
        result = await svc.update_session(
            db, session_obj3.id, PhoneBankSessionUpdate(status="active")
        )
        assert result.status == SessionStatus.ACTIVE

        # active -> completed: allowed (should force-release entries)
        session_obj4 = _make_session_obj(status=SessionStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(session_obj4)
        result = await svc.update_session(
            db, session_obj4.id, PhoneBankSessionUpdate(status="completed")
        )
        assert result.status == SessionStatus.COMPLETED

        # completed -> active: NOT allowed
        session_obj5 = _make_session_obj(status=SessionStatus.COMPLETED)
        db.execute.return_value = _mock_scalar_result(session_obj5)
        with pytest.raises(ValueError, match="Invalid status transition"):
            await svc.update_session(
                db, session_obj5.id, PhoneBankSessionUpdate(status="active")
            )

    @pytest.mark.asyncio
    async def test_session_with_script(self) -> None:
        """Session's call list has script attached, questions retrievable."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj()
        call_list = _make_call_list(id=session_obj.call_list_id, script_id=uuid.uuid4())

        # get_session returns session, then get_call_list returns call list
        db.execute.side_effect = [
            _mock_scalar_result(session_obj),
            _mock_scalar_result(call_list),
        ]

        result = await svc.get_session(db, session_obj.id)
        assert result is not None
        assert result.call_list_id == call_list.id

    @pytest.mark.asyncio
    async def test_session_pause_blocks_claims(self) -> None:
        """Paused session raises error when trying to claim entries."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj(status=SessionStatus.PAUSED)
        db.execute.return_value = _mock_scalar_result(session_obj)

        with pytest.raises(ValueError, match="not active"):
            await svc.claim_entries_for_session(db, session_obj.id, "caller-1")

    @pytest.mark.asyncio
    async def test_session_complete_releases_entries(self) -> None:
        """Completing session force-releases all in_progress entries."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj(status=SessionStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(session_obj)

        from app.schemas.phone_bank import PhoneBankSessionUpdate

        await svc.update_session(
            db, session_obj.id, PhoneBankSessionUpdate(status="completed")
        )

        # Verify an UPDATE query was issued to release entries
        # The service should have called execute to release IN_PROGRESS entries
        assert db.execute.call_count >= 2  # at least: get session + release entries

    @pytest.mark.asyncio
    async def test_delete_session_non_active_removes_session_and_callers(self) -> None:
        """Deleting non-active session removes callers and session."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj(status=SessionStatus.DRAFT)
        db.execute.side_effect = [
            _mock_scalar_result(session_obj),
            MagicMock(),
        ]

        await svc.delete_session(db, session_obj.id)

        assert db.execute.call_count == 2
        db.delete.assert_awaited_once_with(session_obj)

    @pytest.mark.asyncio
    async def test_delete_session_active_raises_validation_error(self) -> None:
        """Deleting active session is rejected (D-02)."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj(status=SessionStatus.ACTIVE)
        db.execute.return_value = _mock_scalar_result(session_obj)

        with pytest.raises(ValueError, match="active and cannot be deleted"):
            await svc.delete_session(db, session_obj.id)

        db.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_delete_session_not_found_raises(self) -> None:
        """Deleting unknown session raises not-found error."""
        db = _mock_db()
        svc = PhoneBankService()
        missing_session_id = uuid.uuid4()
        db.execute.return_value = _mock_scalar_result(None)

        with pytest.raises(ValueError, match="not found"):
            await svc.delete_session(db, missing_session_id)

        db.delete.assert_not_called()


class TestCallerManagement:
    """Tests for caller assignment and check-in/out."""

    @pytest.mark.asyncio
    async def test_assign_caller(self) -> None:
        """Assign caller to session."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj()
        db.execute.side_effect = [
            _mock_scalar_result(session_obj),
            _mock_scalar_result(None),
        ]

        result = await svc.assign_caller(db, session_obj.id, "caller-1")

        assert result.session_id == session_obj.id
        assert result.user_id == "caller-1"
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_caller_check_in_check_out(self) -> None:
        """check_in_at/check_out_at timestamps set correctly."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj(status=SessionStatus.ACTIVE)
        caller_obj = _make_caller(session_id=session_obj.id, check_in_at=utcnow())

        # check_in: session lookup + pg_insert upsert (returns caller via scalar_one)
        db.execute.side_effect = [
            _mock_scalar_result(session_obj),
            _mock_scalar_result(caller_obj),
        ]
        result = await svc.check_in(db, session_obj.id, "caller-1")
        assert result.check_in_at is not None

        # check_out: need caller lookup + session lookup (for entry release)
        caller_obj2 = _make_caller(session_id=session_obj.id, check_in_at=utcnow())
        db.execute.side_effect = [
            _mock_scalar_result(caller_obj2),
            _mock_scalar_result(session_obj),
            AsyncMock(),  # release entries update
        ]
        result = await svc.check_out(db, session_obj.id, "caller-1")
        assert result.check_out_at is not None


class TestCallRecording:
    """Tests for recording call outcomes."""

    @pytest.mark.asyncio
    async def test_record_call_answered(self) -> None:
        """PHONE-03: ANSWERED outcome creates interaction and marks entry COMPLETED."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1")
        call_list = _make_call_list(id=entry.call_list_id)
        _make_session_obj(id=session_id, call_list_id=call_list.id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )

        # DB calls: get entry, get call list, get session
        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.ANSWERED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
        )
        result = await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        assert result.interaction_id == interaction.id
        assert entry.status == EntryStatus.COMPLETED
        svc._interaction_service.record_interaction.assert_called_once()

    @pytest.mark.asyncio
    async def test_record_call_no_answer(self) -> None:
        """NO_ANSWER increments attempt_count and recycles entry to AVAILABLE."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1", attempt_count=0)
        call_list = _make_call_list(id=entry.call_list_id, max_attempts=3)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.NO_ANSWER,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        assert entry.attempt_count == 1
        assert entry.status == EntryStatus.AVAILABLE

    @pytest.mark.asyncio
    async def test_record_call_with_survey(self) -> None:
        """ANSWERED + survey_responses -> records interaction
        + calls SurveyService."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        script_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1")
        call_list = _make_call_list(id=entry.call_list_id, script_id=script_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )
        svc._survey_service.record_responses_batch = AsyncMock(return_value=[])

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        survey_data = [{"question_id": str(uuid.uuid4()), "answer_value": "Yes"}]
        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.ANSWERED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
            survey_responses=survey_data,
            survey_complete=True,
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        svc._survey_service.record_responses_batch.assert_called_once()
        # Verify payload contains survey_complete=True
        call_args = svc._interaction_service.record_interaction.call_args
        assert call_args[1]["payload"]["survey_complete"] is True

    @pytest.mark.asyncio
    async def test_partial_survey_saved(self) -> None:
        """ANSWERED + survey_responses + survey_complete=False
        -> partial survey saved."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        script_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1")
        call_list = _make_call_list(id=entry.call_list_id, script_id=script_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )
        svc._survey_service.record_responses_batch = AsyncMock(return_value=[])

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.ANSWERED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
            survey_responses=[
                {"question_id": str(uuid.uuid4()), "answer_value": "Maybe"}
            ],
            survey_complete=False,
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        svc._survey_service.record_responses_batch.assert_called_once()
        call_args = svc._interaction_service.record_interaction.call_args
        assert call_args[1]["payload"]["survey_complete"] is False

    @pytest.mark.asyncio
    async def test_wrong_number_marks_phone_only(self) -> None:
        """WRONG_NUMBER marks only that phone; entry stays
        AVAILABLE if other phones remain."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        # Entry with 2 phones
        entry = _make_entry(
            claimed_by="caller-1",
            phone_numbers=[
                {
                    "phone_id": "ph1",
                    "value": "5551234567",
                    "type": "cell",
                    "is_primary": True,
                },
                {
                    "phone_id": "ph2",
                    "value": "5559876543",
                    "type": "home",
                    "is_primary": False,
                },
            ],
            phone_attempts=None,
        )
        call_list = _make_call_list(id=entry.call_list_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.WRONG_NUMBER,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        # Phone_attempts should have the bad phone marked
        assert entry.phone_attempts is not None
        assert "5551234567" in entry.phone_attempts
        # Entry still AVAILABLE because there's another phone
        assert entry.status == EntryStatus.AVAILABLE


class TestInteractionEvents:
    """Tests for interaction event emission."""

    @pytest.mark.asyncio
    async def test_interaction_events_created(self) -> None:
        """PHONE_CALL interaction event emitted with correct payload."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1")
        call_list = _make_call_list(id=entry.call_list_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.models.voter_interaction import InteractionType
        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.ANSWERED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
            notes="Supportive voter",
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        call_args = svc._interaction_service.record_interaction.call_args
        assert call_args[1]["interaction_type"] == InteractionType.PHONE_CALL
        payload = call_args[1]["payload"]
        assert payload["result_code"] == CallResultCode.ANSWERED
        assert payload["session_id"] == str(session_id)
        assert payload["phone_number_used"] == "5551234567"
        assert payload["notes"] == "Supportive voter"

    @pytest.mark.asyncio
    async def test_survey_response_interaction(self) -> None:
        """SurveyService.record_responses_batch emits SURVEY_RESPONSE interaction."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        script_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1")
        call_list = _make_call_list(id=entry.call_list_id, script_id=script_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )
        svc._survey_service.record_responses_batch = AsyncMock(return_value=[])

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.ANSWERED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
            survey_responses=[
                {"question_id": str(uuid.uuid4()), "answer_value": "Yes"}
            ],
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        # SurveyService.record_responses_batch should have been called
        svc._survey_service.record_responses_batch.assert_called_once()

    @pytest.mark.asyncio
    async def test_refused_auto_dnc(self) -> None:
        """REFUSED outcome auto-adds to DNC."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        entry = _make_entry(claimed_by="caller-1")
        call_list = _make_call_list(id=entry.call_list_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )
        svc._dnc_service.add_entry = AsyncMock()

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.REFUSED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        svc._dnc_service.add_entry.assert_called_once_with(
            db, campaign_id, "5551234567", DNCReason.REFUSED, "caller-1"
        )
        assert entry.status == EntryStatus.TERMINAL


class TestSupervisorOps:
    """Tests for supervisor session management."""

    @pytest.mark.asyncio
    async def test_session_progress(self) -> None:
        """Supervisor progress view with per-caller stats."""
        db = _mock_db()
        svc = PhoneBankService()
        session_obj = _make_session_obj()

        # Mock: get session, then entry count queries, then caller queries
        db.execute.side_effect = [
            _mock_scalar_result(session_obj),
            # Entry stats: total, completed, in_progress, available
            MagicMock(
                all=MagicMock(
                    return_value=[
                        (EntryStatus.AVAILABLE, 5),
                        (EntryStatus.IN_PROGRESS, 3),
                        (EntryStatus.COMPLETED, 2),
                    ]
                )
            ),
            # Callers for the session
            _mock_scalars_result(
                [
                    _make_caller(user_id="caller-1", check_in_at=utcnow()),
                    _make_caller(user_id="caller-2"),
                ]
            ),
            # Call counts per caller
            MagicMock(
                all=MagicMock(
                    return_value=[
                        ("caller-1", 5),
                        ("caller-2", 2),
                    ]
                )
            ),
        ]

        result = await svc.get_progress(db, session_obj.id)

        assert result.session_id == session_obj.id
        assert result.total_entries == 10  # 5+3+2
        assert result.available == 5

    @pytest.mark.asyncio
    async def test_reassign_entry(self) -> None:
        """Supervisor reassign entry between callers."""
        db = _mock_db()
        svc = PhoneBankService()
        entry = _make_entry(claimed_by="caller-1")

        db.execute.return_value = _mock_scalar_result(entry)

        result = await svc.reassign_entry(db, entry.id, "caller-2")
        assert result.claimed_by == "caller-2"

    @pytest.mark.asyncio
    async def test_force_release_entry(self) -> None:
        """Supervisor force-release claimed entry."""
        db = _mock_db()
        svc = PhoneBankService()
        entry = _make_entry(claimed_by="caller-1", status=EntryStatus.IN_PROGRESS)

        db.execute.return_value = _mock_scalar_result(entry)

        result = await svc.force_release_entry(db, entry.id)
        assert result.status == EntryStatus.AVAILABLE
        assert result.claimed_by is None
        assert result.claimed_at is None

    @pytest.mark.asyncio
    async def test_deceased_marks_person_terminal(self) -> None:
        """DECEASED sets entry to TERMINAL regardless of remaining phones."""
        db = _mock_db()
        svc = PhoneBankService()
        campaign_id = uuid.uuid4()
        session_id = uuid.uuid4()
        entry = _make_entry(
            claimed_by="caller-1",
            phone_numbers=[
                {
                    "phone_id": "ph1",
                    "value": "5551234567",
                    "type": "cell",
                    "is_primary": True,
                },
                {
                    "phone_id": "ph2",
                    "value": "5559876543",
                    "type": "home",
                    "is_primary": False,
                },
            ],
        )
        call_list = _make_call_list(id=entry.call_list_id)

        interaction = MagicMock()
        interaction.id = uuid.uuid4()
        svc._interaction_service.record_interaction = AsyncMock(
            return_value=interaction
        )

        db.execute.side_effect = [
            _mock_scalar_result(entry),
            _mock_scalar_result(call_list),
        ]

        from app.schemas.phone_bank import CallRecordCreate

        data = CallRecordCreate(
            call_list_entry_id=entry.id,
            result_code=CallResultCode.DECEASED,
            phone_number_used="5551234567",
            call_started_at=utcnow(),
            call_ended_at=utcnow(),
        )
        await svc.record_call(db, campaign_id, session_id, data, "caller-1")

        # Person-level terminal: TERMINAL regardless of other phones
        assert entry.status == EntryStatus.TERMINAL
