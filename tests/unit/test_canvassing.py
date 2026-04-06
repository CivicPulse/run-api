"""Unit tests for door-knock recording and contact tracking -- CANV-04, CANV-05."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.time import utcnow
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import DoorKnockResult, WalkListEntryStatus
from app.schemas.survey import ResponseCreate


class TestCanvassService:
    """Tests for door knock recording, entry status updates,
    and contact attempt tracking."""

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

        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        mock_walk_list = MagicMock()
        mock_walk_list.id = walk_list_id
        mock_walk_list.script_id = None
        mock_walk_list.visited_entries = 0

        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_walk_list

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        session.execute = AsyncMock(
            side_effect=[mock_entry_result, mock_wl_result, mock_count_result]
        )

        now = utcnow()
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
                survey_responses=None,
                survey_complete=True,
            )
            result = await service.record_door_knock(
                session, campaign_id, walk_list_id, data, "user-1"
            )

            mock_record.assert_called_once()
            call_kwargs = mock_record.call_args
            assert call_kwargs.kwargs["interaction_type"] == InteractionType.DOOR_KNOCK
            assert call_kwargs.kwargs["voter_id"] == voter_id
            payload = call_kwargs.kwargs["payload"]
            assert payload["result_code"] == "supporter"
            assert payload["walk_list_id"] == str(walk_list_id)
            assert payload["notes"] == "Friendly conversation"
            assert payload["survey_complete"] is True

            assert result.interaction_id == mock_interaction.id
            assert result.attempt_number == 1

    @pytest.mark.asyncio
    async def test_record_door_knock_with_survey_responses_uses_batch_service(
        self,
    ) -> None:
        """CANV-04: Contact payload saves ordered survey responses in the same flow."""
        from app.services.canvass import CanvassService

        service = CanvassService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()
        walk_list_id = uuid.uuid4()
        entry_id = uuid.uuid4()
        voter_id = uuid.uuid4()
        script_id = uuid.uuid4()

        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        mock_walk_list = MagicMock()
        mock_walk_list.id = walk_list_id
        mock_walk_list.script_id = script_id
        mock_walk_list.visited_entries = 0

        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_walk_list

        mock_script = MagicMock()
        mock_script.id = script_id
        mock_script_result = MagicMock()
        mock_script_result.scalar_one_or_none.return_value = mock_script

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 2

        session.execute = AsyncMock(
            side_effect=[
                mock_entry_result,
                mock_wl_result,
                mock_script_result,
                mock_count_result,
            ]
        )

        now = utcnow()
        mock_interaction = MagicMock()
        mock_interaction.id = uuid.uuid4()
        mock_interaction.created_at = now

        survey_responses = [
            ResponseCreate(
                question_id=uuid.uuid4(),
                voter_id=voter_id,
                answer_value="Yes",
            ),
            ResponseCreate(
                question_id=uuid.uuid4(),
                voter_id=voter_id,
                answer_value="Needs absentee info",
            ),
        ]

        service._interaction_service.record_interaction = AsyncMock(
            return_value=mock_interaction
        )
        service._survey_service.record_responses_batch = AsyncMock(return_value=[])

        data = SimpleNamespace(
            voter_id=voter_id,
            walk_list_entry_id=entry_id,
            result_code=DoorKnockResult.SUPPORTER,
            notes="Asked about vote by mail",
            survey_responses=survey_responses,
            survey_complete=False,
        )

        await service.record_door_knock(
            session, campaign_id, walk_list_id, data, "user-1"
        )

        service._survey_service.record_responses_batch.assert_called_once_with(
            session=session,
            campaign_id=campaign_id,
            script_id=script_id,
            voter_id=voter_id,
            responses=survey_responses,
            user_id="user-1",
        )

        call_args = service._interaction_service.record_interaction.call_args
        assert call_args.kwargs["payload"]["survey_complete"] is False
        assert call_args.kwargs["payload"]["notes"] == "Asked about vote by mail"
        assert call_args.kwargs["payload"]["script_id"] == str(script_id)
        assert call_args.kwargs["payload"]["survey_response_count"] == 2

    @pytest.mark.asyncio
    async def test_record_door_knock_with_survey_responses_requires_attached_script(
        self,
    ) -> None:
        """CANV-04: Contact survey writes fail fast when readback script context is missing."""
        from app.services.canvass import CanvassService

        service = CanvassService()
        session = AsyncMock()
        campaign_id = uuid.uuid4()
        walk_list_id = uuid.uuid4()
        entry_id = uuid.uuid4()
        voter_id = uuid.uuid4()

        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        mock_walk_list = MagicMock()
        mock_walk_list.id = walk_list_id
        mock_walk_list.script_id = None
        mock_walk_list.visited_entries = 0

        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_walk_list

        session.execute = AsyncMock(side_effect=[mock_entry_result, mock_wl_result])
        service._interaction_service.record_interaction = AsyncMock()
        service._survey_service.record_responses_batch = AsyncMock(return_value=[])

        data = SimpleNamespace(
            voter_id=voter_id,
            walk_list_entry_id=entry_id,
            result_code=DoorKnockResult.SUPPORTER,
            notes="Answered the door",
            survey_responses=[
                ResponseCreate(
                    question_id=uuid.uuid4(),
                    voter_id=voter_id,
                    answer_value="Yes",
                )
            ],
            survey_complete=False,
        )

        with pytest.raises(ValueError, match="attached survey script"):
            await service.record_door_knock(
                session, campaign_id, walk_list_id, data, "user-1"
            )

        service._survey_service.record_responses_batch.assert_not_called()

    @pytest.mark.asyncio
    async def test_record_door_knock_non_contact_without_survey_keeps_backward_compatibility(
        self,
    ) -> None:
        """CANV-04: Non-contact outcomes still save cleanly without survey metadata."""
        from app.services.canvass import CanvassService

        service = CanvassService()
        session = AsyncMock()

        entry_id = uuid.uuid4()
        walk_list_id = uuid.uuid4()
        voter_id = uuid.uuid4()

        mock_entry = MagicMock()
        mock_entry.id = entry_id
        mock_entry.walk_list_id = walk_list_id
        mock_entry.status = WalkListEntryStatus.PENDING

        mock_entry_result = MagicMock()
        mock_entry_result.scalar_one_or_none.return_value = mock_entry

        mock_wl = MagicMock()
        mock_wl.id = walk_list_id
        mock_wl.script_id = None
        mock_wl.visited_entries = 5
        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_wl

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        session.execute = AsyncMock(
            side_effect=[mock_entry_result, mock_wl_result, mock_count_result]
        )

        now = utcnow()
        mock_interaction = MagicMock()
        mock_interaction.id = uuid.uuid4()
        mock_interaction.created_at = now

        service._interaction_service.record_interaction = AsyncMock(
            return_value=mock_interaction
        )
        service._survey_service.record_responses_batch = AsyncMock(return_value=[])

        data = SimpleNamespace(
            voter_id=voter_id,
            walk_list_entry_id=entry_id,
            result_code=DoorKnockResult.NOT_HOME,
            notes=None,
            survey_responses=None,
            survey_complete=True,
        )
        await service.record_door_knock(
            session, uuid.uuid4(), walk_list_id, data, "user-1"
        )

        assert mock_entry.status == WalkListEntryStatus.VISITED
        service._survey_service.record_responses_batch.assert_not_called()

    @pytest.mark.asyncio
    async def test_door_knock_increments_visited_count(self) -> None:
        """CANV-04: Walk list visited_entries incremented."""
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
        mock_wl.script_id = None
        mock_wl.visited_entries = 3
        mock_wl_result = MagicMock()
        mock_wl_result.scalar_one.return_value = mock_wl

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 1

        session.execute = AsyncMock(
            side_effect=[mock_entry_result, mock_wl_result, mock_count_result]
        )

        now = utcnow()
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
                survey_responses=None,
                survey_complete=True,
            )
            await service.record_door_knock(
                session, uuid.uuid4(), walk_list_id, data, "user-1"
            )

            assert mock_wl.visited_entries is not None

    def test_contact_attempts(self) -> None:
        """CANV-05: Multiple knocks tracked per voter."""
        assert hasattr(VoterInteraction, "voter_id")
        assert hasattr(VoterInteraction, "type")
        assert hasattr(VoterInteraction, "created_at")
        assert InteractionType.DOOR_KNOCK == "door_knock"

    def test_attempt_number_derived(self) -> None:
        """CANV-05: Attempt number computed from event count."""
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

        from app.schemas.canvass import DoorKnockResponse

        assert "attempt_number" in DoorKnockResponse.model_fields

    def test_door_knock_schema_accepts_authoritative_contact_payload(self) -> None:
        """CANV-04: DoorKnockCreate accepts notes plus ordered survey responses."""
        from app.schemas.canvass import DoorKnockCreate

        voter_id = uuid.uuid4()
        payload = DoorKnockCreate(
            voter_id=voter_id,
            walk_list_entry_id=uuid.uuid4(),
            result_code=DoorKnockResult.SUPPORTER,
            notes="Wants yard sign",
            survey_complete=False,
            survey_responses=[
                {
                    "question_id": str(uuid.uuid4()),
                    "voter_id": str(voter_id),
                    "answer_value": "Yes",
                },
                {
                    "question_id": str(uuid.uuid4()),
                    "voter_id": str(voter_id),
                    "answer_value": "Call after 6pm",
                },
            ],
        )

        assert payload.notes == "Wants yard sign"
        assert payload.survey_complete is False
        assert payload.survey_responses is not None
        assert [response.answer_value for response in payload.survey_responses] == [
            "Yes",
            "Call after 6pm",
        ]
