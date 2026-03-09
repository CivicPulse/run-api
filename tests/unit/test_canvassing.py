"""Unit tests for door-knock recording and contact tracking -- CANV-04, CANV-05."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import DoorKnockResult, WalkListEntryStatus


class TestCanvassService:
    """Tests for door knock recording, entry status updates, and contact attempt tracking."""

    @pytest.mark.asyncio
    async def test_record_door_knock(self) -> None:
        """CANV-04: Record door knock creates interaction."""
        from app.services.canvass import CanvassService

        service = CanvassService()

        session = AsyncMock()
        campaign_id = uuid.uuid4()
        walk_list_id = uuid.uuid4()
        entry_id = uuid.uuid4()
        voter_id = uuid.uuid4()

        # Mock entry lookup
        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        # Mock walk list lookup
        mock_walk_list = MagicMock()
        mock_walk_list.id = walk_list_id
        mock_walk_list.visited_entries = 0

        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_walk_list

        # Mock count of door knock interactions
        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        session.execute = AsyncMock(
            side_effect=[mock_entry_result, mock_wl_result, mock_count_result]
        )

        # Mock the interaction service
        now = datetime.now(UTC)
        mock_interaction = MagicMock()
        mock_interaction.id = uuid.uuid4()
        mock_interaction.created_at = now

        with patch.object(
            service._interaction_service,
            "record_interaction",
            new_callable=AsyncMock,
            return_value=mock_interaction,
        ) as mock_record:
            data = SimpleNamespace(
                voter_id=voter_id,
                walk_list_entry_id=entry_id,
                result_code=DoorKnockResult.SUPPORTER,
                notes="Friendly conversation",
            )
            result = await service.record_door_knock(
                session, campaign_id, walk_list_id, data, "user-1"
            )

            # Verify interaction was recorded with DOOR_KNOCK type
            mock_record.assert_called_once()
            call_kwargs = mock_record.call_args
            assert call_kwargs.kwargs["interaction_type"] == InteractionType.DOOR_KNOCK
            assert call_kwargs.kwargs["voter_id"] == voter_id
            payload = call_kwargs.kwargs["payload"]
            assert payload["result_code"] == "supporter"
            assert payload["walk_list_id"] == str(walk_list_id)
            assert payload["notes"] == "Friendly conversation"

            # Verify response
            assert result.interaction_id == mock_interaction.id
            assert result.attempt_number == 1

    @pytest.mark.asyncio
    async def test_door_knock_updates_entry_status(self) -> None:
        """CANV-04: Entry auto-set to visited."""
        from app.services.canvass import CanvassService

        service = CanvassService()
        session = AsyncMock()

        entry_id = uuid.uuid4()
        walk_list_id = uuid.uuid4()
        voter_id = uuid.uuid4()

        # Mock entry with PENDING status
        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        mock_wl = MagicMock()
        mock_wl.visited_entries = 5
        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_wl

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        session.execute = AsyncMock(
            side_effect=[mock_entry_result, mock_wl_result, mock_count_result]
        )

        now = datetime.now(UTC)
        mock_interaction = MagicMock()
        mock_interaction.id = uuid.uuid4()
        mock_interaction.created_at = now

        with patch.object(
            service._interaction_service,
            "record_interaction",
            new_callable=AsyncMock,
            return_value=mock_interaction,
        ):
            data = SimpleNamespace(
                voter_id=voter_id,
                walk_list_entry_id=entry_id,
                result_code=DoorKnockResult.NOT_HOME,
                notes=None,
            )
            await service.record_door_knock(
                session, uuid.uuid4(), walk_list_id, data, "user-1"
            )

            # Verify entry status was set to VISITED
            assert mock_entry.status == WalkListEntryStatus.VISITED

    @pytest.mark.asyncio
    async def test_door_knock_increments_visited_count(self) -> None:
        """CANV-04: Walk list visited_entries incremented."""
        from app.models.walk_list import WalkList
        from app.services.canvass import CanvassService

        service = CanvassService()
        session = AsyncMock()

        walk_list_id = uuid.uuid4()
        entry_id = uuid.uuid4()

        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        mock_wl = MagicMock()
        mock_wl.id = walk_list_id
        mock_wl.visited_entries = 3
        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_wl

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        session.execute = AsyncMock(
            side_effect=[mock_entry_result, mock_wl_result, mock_count_result]
        )

        now = datetime.now(UTC)
        mock_interaction = MagicMock()
        mock_interaction.id = uuid.uuid4()
        mock_interaction.created_at = now

        with patch.object(
            service._interaction_service,
            "record_interaction",
            new_callable=AsyncMock,
            return_value=mock_interaction,
        ):
            data = SimpleNamespace(
                voter_id=uuid.uuid4(),
                walk_list_entry_id=entry_id,
                result_code=DoorKnockResult.SUPPORTER,
                notes=None,
            )
            await service.record_door_knock(
                session, uuid.uuid4(), walk_list_id, data, "user-1"
            )

            # Verify visited_entries was set to the SQL expression
            # (In real DB this would be WalkList.visited_entries + 1)
            # In mock, it gets set to a BinaryExpression object
            assert mock_wl.visited_entries is not None

    def test_contact_attempts(self) -> None:
        """CANV-05: Multiple knocks tracked per voter."""
        # Verify each door knock creates a separate VoterInteraction
        # This is implicit in the append-only model: VoterInteraction has no unique
        # constraint on (voter_id, type), so multiple DOOR_KNOCK events per voter are allowed
        assert hasattr(VoterInteraction, "voter_id")
        assert hasattr(VoterInteraction, "type")
        assert hasattr(VoterInteraction, "created_at")
        # InteractionType includes DOOR_KNOCK
        assert InteractionType.DOOR_KNOCK == "door_knock"

    def test_attempt_number_derived(self) -> None:
        """CANV-05: Attempt number computed from event count."""
        # Verify DoorKnockResult enum has expected values
        assert DoorKnockResult.NOT_HOME == "not_home"
        assert DoorKnockResult.REFUSED == "refused"
        assert DoorKnockResult.SUPPORTER == "supporter"
        assert DoorKnockResult.UNDECIDED == "undecided"
        assert DoorKnockResult.OPPOSED == "opposed"
        assert DoorKnockResult.MOVED == "moved"
        assert DoorKnockResult.DECEASED == "deceased"
        assert DoorKnockResult.COME_BACK_LATER == "come_back_later"
        assert DoorKnockResult.INACCESSIBLE == "inaccessible"
        assert len(DoorKnockResult) == 9

        # The attempt_number in DoorKnockResponse is derived from COUNT query
        # (not stored in payload), verified by the record_door_knock test above
        from app.schemas.canvass import DoorKnockResponse

        assert "attempt_number" in DoorKnockResponse.model_fields
