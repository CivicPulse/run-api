"""Unit tests for voter tag operations."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.voter import VoterTag, VoterTagMember


class TestVoterTagOperations:
    """Tests for tag CRUD and voter-tag assignment."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    async def test_create_tag(self, mock_db):
        """create_tag creates a new campaign-scoped tag."""
        from app.services.voter import VoterService

        service = VoterService()
        campaign_id = uuid.uuid4()
        tag = await service.create_tag(mock_db, campaign_id, "yard-sign")
        mock_db.add.assert_called_once()
        mock_db.commit.assert_awaited_once()

    async def test_list_tags(self, mock_db):
        """list_tags returns all tags for a campaign."""
        from app.services.voter import VoterService

        service = VoterService()
        campaign_id = uuid.uuid4()

        tag1 = MagicMock(spec=VoterTag)
        tag1.name = "yard-sign"
        tag2 = MagicMock(spec=VoterTag)
        tag2.name = "strong-supporter"

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tag1, tag2]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.list_tags(mock_db, campaign_id)
        assert len(result) == 2

    async def test_add_tag_to_voter(self, mock_db):
        """add_tag_to_voter inserts into voter_tag_members."""
        from app.services.voter import VoterService

        service = VoterService()
        voter_id = uuid.uuid4()
        tag_id = uuid.uuid4()

        await service.add_tag_to_voter(mock_db, voter_id, tag_id)
        mock_db.add.assert_called_once()
        mock_db.commit.assert_awaited_once()

    async def test_remove_tag_from_voter(self, mock_db):
        """remove_tag_from_voter deletes from voter_tag_members."""
        from app.services.voter import VoterService

        service = VoterService()
        voter_id = uuid.uuid4()
        tag_id = uuid.uuid4()

        await service.remove_tag_from_voter(mock_db, voter_id, tag_id)
        # Should execute a delete and commit
        mock_db.execute.assert_awaited()
        mock_db.commit.assert_awaited()

    async def test_get_voter_tags(self, mock_db):
        """get_voter_tags returns tags for a specific voter."""
        from app.services.voter import VoterService

        service = VoterService()
        voter_id = uuid.uuid4()

        tag1 = MagicMock(spec=VoterTag)
        tag1.name = "yard-sign"

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tag1]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_voter_tags(mock_db, voter_id)
        assert len(result) == 1
