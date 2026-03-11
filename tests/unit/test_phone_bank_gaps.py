"""Unit tests for Phase 16 backend gap fixes.

TDD RED phase - these tests fail until implementation is added.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.call_list import CallListEntry, EntryStatus
from app.models.phone_bank import SessionCaller
from app.services.phone_bank import PhoneBankService


class TestSelfReleaseEntry:
    """Tests for PhoneBankService.self_release_entry."""

    @pytest.mark.asyncio
    async def test_self_release_sets_available_and_clears_claim(self):
        """Caller can release their own claimed entry."""
        service = PhoneBankService()
        db = AsyncMock()

        entry_id = uuid.uuid4()
        user_id = "user-abc"

        entry = MagicMock(spec=CallListEntry)
        entry.id = entry_id
        entry.claimed_by = user_id
        entry.status = EntryStatus.IN_PROGRESS

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = entry
        db.execute = AsyncMock(return_value=mock_result)

        result = await service.self_release_entry(db, entry_id, user_id)

        assert result.status == EntryStatus.AVAILABLE
        assert result.claimed_by is None
        assert result.claimed_at is None

    @pytest.mark.asyncio
    async def test_self_release_raises_if_entry_not_found(self):
        """ValueError raised when entry does not exist."""
        service = PhoneBankService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        entry_id = uuid.uuid4()
        with pytest.raises(ValueError, match=str(entry_id)):
            await service.self_release_entry(db, entry_id, "user-abc")

    @pytest.mark.asyncio
    async def test_self_release_raises_if_claimed_by_different_user(self):
        """ValueError raised when entry is claimed by a different user."""
        service = PhoneBankService()
        db = AsyncMock()

        entry_id = uuid.uuid4()
        entry = MagicMock(spec=CallListEntry)
        entry.id = entry_id
        entry.claimed_by = "other-user"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = entry
        db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not claimed by"):
            await service.self_release_entry(db, entry_id, "requesting-user")


class TestListCallers:
    """Tests for PhoneBankService.list_callers."""

    @pytest.mark.asyncio
    async def test_list_callers_returns_session_callers(self):
        """list_callers returns all SessionCaller rows for the session."""
        service = PhoneBankService()
        db = AsyncMock()

        session_id = uuid.uuid4()
        callers = [MagicMock(spec=SessionCaller), MagicMock(spec=SessionCaller)]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = callers
        db.execute = AsyncMock(return_value=mock_result)

        result = await service.list_callers(db, session_id)

        assert result == callers
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_callers_returns_empty_list_when_no_callers(self):
        """list_callers returns empty list when no callers assigned."""
        service = PhoneBankService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        result = await service.list_callers(db, uuid.uuid4())

        assert result == []


class TestAssignedToMeFilter:
    """Tests for list_sessions assigned_to_me_user_id filter."""

    @pytest.mark.asyncio
    async def test_list_sessions_accepts_assigned_to_me_param(self):
        """list_sessions does not raise when assigned_to_me_user_id is provided."""
        service = PhoneBankService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        # Should not raise TypeError - param must exist in signature
        result = await service.list_sessions(
            db, uuid.uuid4(), assigned_to_me_user_id="user-abc"
        )
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_list_sessions_default_no_filter(self):
        """list_sessions works without assigned_to_me_user_id (backward compat)."""
        service = PhoneBankService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        # Original signature still works
        result = await service.list_sessions(db, uuid.uuid4())
        assert isinstance(result, list)


class TestCallerCountSchema:
    """Tests for PhoneBankSessionResponse.caller_count field."""

    def test_phone_bank_session_response_has_caller_count_field(self):
        """PhoneBankSessionResponse includes caller_count with default 0."""
        from app.schemas.phone_bank import PhoneBankSessionResponse

        assert "caller_count" in PhoneBankSessionResponse.model_fields
        field = PhoneBankSessionResponse.model_fields["caller_count"]
        assert field.default == 0

    def test_phone_bank_session_response_caller_count_defaults_to_zero(self):
        """PhoneBankSessionResponse.caller_count defaults to 0."""
        import uuid as _uuid
        from datetime import datetime, timezone

        from app.schemas.phone_bank import PhoneBankSessionResponse

        now = datetime.now(tz=timezone.utc)
        resp = PhoneBankSessionResponse(
            id=_uuid.uuid4(),
            name="Test",
            status="draft",
            call_list_id=_uuid.uuid4(),
            created_by="user-1",
            created_at=now,
            updated_at=now,
        )
        assert resp.caller_count == 0
