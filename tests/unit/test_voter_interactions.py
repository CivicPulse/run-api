"""Unit tests for VoterInteractionService -- append-only event log."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from app.models.voter_interaction import InteractionType, VoterInteraction


class TestVoterInteractionService:
    """Tests for immutable interaction event creation and retrieval."""

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
        result = await service.record_interaction(
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
        """record_interaction sets created_at explicitly (not relying on server_default)."""
        before = datetime.now(UTC)
        await service.record_interaction(
            session=mock_db,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.NOTE,
            payload={},
            user_id=user_id,
        )
        after = datetime.now(UTC)

        added_obj = mock_db.add.call_args[0][0]
        assert before <= added_obj.created_at <= after

    async def test_service_has_no_update_or_delete_methods(self, service):
        """VoterInteractionService has no update or delete methods for interactions."""
        method_names = [m for m in dir(service) if not m.startswith("_")]
        for name in method_names:
            assert "update_interaction" not in name
            assert "delete_interaction" not in name

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
