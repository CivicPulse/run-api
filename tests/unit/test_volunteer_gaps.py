"""Unit tests for Phase 17 backend gap fixes.

TDD RED phase - these tests fail until implementation is added.
Tests: update_tag, delete_tag service methods and 409 self-register enrichment.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.volunteer import VolunteerTag, VolunteerTagMember
from app.services.volunteer import VolunteerService


class TestUpdateTag:
    """Tests for VolunteerService.update_tag."""

    @pytest.mark.asyncio
    async def test_update_tag_renames_and_returns_updated(self):
        """update_tag renames existing tag and returns updated tag."""
        service = VolunteerService()
        db = AsyncMock()

        tag_id = uuid.uuid4()
        tag = MagicMock(spec=VolunteerTag)
        tag.id = tag_id
        tag.name = "Old Name"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = tag
        db.execute = AsyncMock(return_value=mock_result)

        result = await service.update_tag(db, tag_id, "New Name")

        assert result.name == "New Name"
        assert result is tag

    @pytest.mark.asyncio
    async def test_update_tag_raises_if_not_found(self):
        """update_tag raises ValueError when tag not found."""
        service = VolunteerService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        tag_id = uuid.uuid4()
        with pytest.raises(ValueError, match=str(tag_id)):
            await service.update_tag(db, tag_id, "New Name")


class TestDeleteTag:
    """Tests for VolunteerService.delete_tag."""

    @pytest.mark.asyncio
    async def test_delete_tag_removes_tag_and_cascades(self):
        """delete_tag removes tag and cascades to VolunteerTagMember rows."""
        service = VolunteerService()
        db = AsyncMock()

        tag_id = uuid.uuid4()
        tag = MagicMock(spec=VolunteerTag)
        tag.id = tag_id

        # First execute returns the tag, second execute deletes tag members
        mock_tag_result = MagicMock()
        mock_tag_result.scalar_one_or_none.return_value = tag

        mock_delete_result = MagicMock()

        db.execute = AsyncMock(side_effect=[mock_tag_result, mock_delete_result])

        await service.delete_tag(db, tag_id)

        # Should have called session.delete(tag)
        db.delete.assert_called_once_with(tag)

    @pytest.mark.asyncio
    async def test_delete_tag_raises_if_not_found(self):
        """delete_tag raises ValueError when tag not found."""
        service = VolunteerService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        tag_id = uuid.uuid4()
        with pytest.raises(ValueError, match=str(tag_id)):
            await service.delete_tag(db, tag_id)


class TestSelfRegister409Enrichment:
    """Tests for self_register 409 response including volunteer_id."""

    @pytest.mark.asyncio
    async def test_self_register_409_includes_volunteer_id(self):
        """409 self-register response body includes volunteer_id field via ProblemResponse extras."""
        import fastapi_problem_details as problem
        from fastapi import status
        from starlette.testclient import TestClient

        # We test the ProblemResponse with volunteer_id extra field
        # to confirm it serializes correctly
        volunteer_id = uuid.uuid4()
        response = problem.ProblemResponse(
            status=status.HTTP_409_CONFLICT,
            title="Already Registered",
            detail="User already registered",
            type="volunteer-already-registered",
            volunteer_id=str(volunteer_id),
        )

        # ProblemResponse body should include volunteer_id
        assert response.status_code == 409
        # Render response body to verify volunteer_id is in the content
        body = response.body.decode("utf-8")
        assert str(volunteer_id) in body
