"""Unit tests for VoterListService."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.time import utcnow
from app.models.voter_list import ListType, VoterList


class TestVoterListService:
    """Tests for voter list CRUD and evaluation."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    @pytest.fixture
    def static_list(self):
        return VoterList(
            id=uuid.uuid4(),
            campaign_id=uuid.uuid4(),
            name="Supporters",
            list_type=ListType.STATIC,
            filter_query=None,
            created_by="user-abc",
            created_at=utcnow(),
            updated_at=utcnow(),
        )

    @pytest.fixture
    def dynamic_list(self):
        return VoterList(
            id=uuid.uuid4(),
            campaign_id=uuid.uuid4(),
            name="Young Democrats",
            list_type=ListType.DYNAMIC,
            filter_query={"party": "DEM", "age_min": 18, "age_max": 35},
            created_by="user-abc",
            created_at=utcnow(),
            updated_at=utcnow(),
        )

    async def test_create_list(self, mock_db):
        """create_list creates a new voter list."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        data = MagicMock()
        data.model_dump.return_value = {
            "name": "Test List",
            "list_type": "static",
            "description": None,
            "filter_query": None,
        }

        campaign_id = uuid.uuid4()
        await service.create_list(mock_db, campaign_id, data, "user-abc")
        mock_db.add.assert_called_once()
        mock_db.commit.assert_awaited_once()

    async def test_get_list_returns_list(self, mock_db, static_list):
        """get_list returns a list when found."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = static_list
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await service.get_list(
            mock_db, static_list.id, static_list.campaign_id
        )
        assert result.id == static_list.id

    async def test_get_list_raises_when_not_found(self, mock_db):
        """get_list raises ValueError when not found."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="not found"):
            await service.get_list(mock_db, uuid.uuid4(), uuid.uuid4())

    async def test_delete_list(self, mock_db, static_list):
        """delete_list removes the list."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = static_list
        mock_db.execute = AsyncMock(return_value=mock_result)

        await service.delete_list(mock_db, static_list.id, static_list.campaign_id)
        mock_db.commit.assert_awaited()

    async def test_add_members_to_static_list(self, mock_db, static_list):
        """add_members inserts voter IDs into join table for static lists."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = static_list
        mock_db.execute = AsyncMock(return_value=mock_result)

        voter_ids = [uuid.uuid4(), uuid.uuid4()]
        await service.add_members(
            mock_db, static_list.id, static_list.campaign_id, voter_ids
        )
        # Should add members and commit
        assert mock_db.add.call_count >= 1
        mock_db.commit.assert_awaited()

    async def test_add_members_rejects_dynamic_list(self, mock_db, dynamic_list):
        """add_members raises ValueError for dynamic lists."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = dynamic_list
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(ValueError, match="static"):
            await service.add_members(
                mock_db, dynamic_list.id, dynamic_list.campaign_id, [uuid.uuid4()]
            )

    async def test_remove_members_from_static_list(self, mock_db, static_list):
        """remove_members deletes voter IDs from join table."""
        from app.services.voter_list import VoterListService

        service = VoterListService()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = static_list
        mock_db.execute = AsyncMock(return_value=mock_result)

        voter_ids = [uuid.uuid4()]
        await service.remove_members(
            mock_db, static_list.id, static_list.campaign_id, voter_ids
        )
        mock_db.commit.assert_awaited()

    async def test_dynamic_list_uses_stored_filter(self, dynamic_list):
        """Dynamic list evaluation deserializes filter_query into VoterFilter."""
        from app.schemas.voter_filter import VoterFilter

        # The dynamic list has filter_query stored as dict
        vf = VoterFilter(**dynamic_list.filter_query)
        assert vf.party == "DEM"
        assert vf.age_min == 18
        assert vf.age_max == 35
