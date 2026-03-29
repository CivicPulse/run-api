"""Unit tests for VoterInteractionService -- event log with mutable notes."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.time import utcnow
from app.models.voter_interaction import InteractionType, VoterInteraction


class TestVoterInteractionService:
    """Tests for interaction event creation, retrieval, and note mutation."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    @pytest.fixture
    def service(self):
        from app.services.voter_interaction import VoterInteractionService

        return VoterInteractionService()

    @pytest.fixture
    def voter_id(self):
        return uuid.uuid4()

    @pytest.fixture
    def campaign_id(self):
        return uuid.uuid4()

    @pytest.fixture
    def user_id(self):
        return "user-abc-123"

    async def test_record_interaction_creates_immutable_record(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """record_interaction creates a VoterInteraction record with correct fields."""
        await service.record_interaction(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.NOTE,
            payload={"text": "Called, no answer"},
            user_id=user_id,
        )

        mock_db.add.assert_called_once()
        added_obj = mock_db.add.call_args[0][0]
        assert isinstance(added_obj, VoterInteraction)
        assert added_obj.voter_id == voter_id
        assert added_obj.campaign_id == campaign_id
        assert added_obj.type == InteractionType.NOTE
        assert added_obj.payload == {"text": "Called, no answer"}
        assert added_obj.created_by == user_id
        assert added_obj.created_at is not None
        mock_db.flush.assert_awaited_once()

    async def test_record_interaction_sets_created_at_explicitly(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """record_interaction sets created_at explicitly
        (not relying on server_default)."""
        before = utcnow()
        await service.record_interaction(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.NOTE,
            payload={},
            user_id=user_id,
        )
        after = utcnow()

        added_obj = mock_db.add.call_args[0][0]
        assert before <= added_obj.created_at <= after

    async def test_get_voter_history_returns_ordered_events(
        self, service, mock_db, voter_id, campaign_id
    ):
        """get_voter_history returns events ordered by created_at DESC."""
        event1 = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.NOTE,
            payload={"text": "First"},
            created_by="user-1",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        event2 = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.TAG_ADDED,
            payload={"tag": "priority"},
            created_by="user-1",
            created_at=datetime(2026, 1, 2, tzinfo=UTC),
        )

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [event2, event1]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_voter_history(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
        )

        assert result.items[0].created_at > result.items[1].created_at

    async def test_get_voter_history_filters_by_type(
        self, service, mock_db, voter_id, campaign_id
    ):
        """get_voter_history supports filtering by interaction type."""
        event = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.NOTE,
            payload={"text": "A note"},
            created_by="user-1",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [event]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_voter_history(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
            type_filter=InteractionType.NOTE,
        )

        assert len(result.items) == 1
        assert result.items[0].type == InteractionType.NOTE

    async def test_record_correction_creates_new_event_referencing_original(
        self, service, mock_db, voter_id, campaign_id, user_id
    ):
        """Corrections are new events referencing the original event ID in payload."""
        original_event_id = uuid.uuid4()

        await service.record_correction(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
            original_event_id=original_event_id,
            correction_payload={"text": "Corrected info"},
            user_id=user_id,
        )

        mock_db.add.assert_called_once()
        added_obj = mock_db.add.call_args[0][0]
        assert isinstance(added_obj, VoterInteraction)
        assert added_obj.type == InteractionType.NOTE
        assert added_obj.payload["original_event_id"] == str(original_event_id)
        assert added_obj.payload["correction"] is True
        assert added_obj.payload["text"] == "Corrected info"

    async def test_update_note(self, service, mock_db, voter_id, campaign_id):
        """update_note updates a note interaction's payload."""
        interaction = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.NOTE,
            payload={"text": "Original"},
            created_by="user-1",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = interaction
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.update_note(
            session=mock_db,
            interaction_id=interaction.id,
            campaign_id=campaign_id,
            voter_id=voter_id,
            payload={"text": "Updated"},
        )

        assert result.payload == {"text": "Updated"}
        mock_db.flush.assert_awaited()

    async def test_update_rejects_non_note(
        self, service, mock_db, voter_id, campaign_id
    ):
        """update_note raises ValueError for non-note interaction types."""
        interaction = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.TAG_ADDED,
            payload={"tag": "priority"},
            created_by="user-1",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = interaction
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not a note"):
            await service.update_note(
                session=mock_db,
                interaction_id=interaction.id,
                campaign_id=campaign_id,
                voter_id=voter_id,
                payload={"text": "Should fail"},
            )

    async def test_update_note_not_found(self, service, mock_db, voter_id, campaign_id):
        """update_note raises ValueError when interaction not found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not found"):
            await service.update_note(
                session=mock_db,
                interaction_id=uuid.uuid4(),
                campaign_id=campaign_id,
                voter_id=voter_id,
                payload={"text": "Should fail"},
            )

    async def test_delete_note(self, service, mock_db, voter_id, campaign_id):
        """delete_note deletes a note interaction."""
        interaction = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.NOTE,
            payload={"text": "To be deleted"},
            created_by="user-1",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = interaction
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.delete = AsyncMock()

        await service.delete_note(
            session=mock_db,
            interaction_id=interaction.id,
            campaign_id=campaign_id,
            voter_id=voter_id,
        )

        mock_db.delete.assert_awaited_once_with(interaction)
        mock_db.flush.assert_awaited()

    async def test_delete_rejects_non_note(
        self, service, mock_db, voter_id, campaign_id
    ):
        """delete_note raises ValueError for non-note interaction types."""
        interaction = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=InteractionType.DOOR_KNOCK,
            payload={"result_code": "not_home"},
            created_by="user-1",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = interaction
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not a note"):
            await service.delete_note(
                session=mock_db,
                interaction_id=interaction.id,
                campaign_id=campaign_id,
                voter_id=voter_id,
            )

    async def test_delete_note_not_found(self, service, mock_db, voter_id, campaign_id):
        """delete_note raises ValueError when interaction not found."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not found"):
            await service.delete_note(
                session=mock_db,
                interaction_id=uuid.uuid4(),
                campaign_id=campaign_id,
                voter_id=voter_id,
            )
