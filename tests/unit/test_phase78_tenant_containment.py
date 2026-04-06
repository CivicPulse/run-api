"""Unit regressions for Phase 78 tenant-containment fixes."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors import VoterNotFoundError


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


class TestPhase78UnitContainment:
    @pytest.mark.asyncio
    async def test_voter_list_add_members_rejects_foreign_voter(self):
        from app.models.voter_list import ListType
        from app.services.voter_list import VoterListService

        db = AsyncMock()
        service = VoterListService()
        campaign_id = uuid.uuid4()
        list_id = uuid.uuid4()
        foreign_voter_id = uuid.uuid4()

        voter_list = MagicMock()
        voter_list.list_type = ListType.STATIC
        db.execute.side_effect = [
            _scalar_result(voter_list),
            MagicMock(
                scalars=MagicMock(
                    return_value=MagicMock(all=MagicMock(return_value=[]))
                )
            ),
        ]

        with pytest.raises(VoterNotFoundError):
            await service.add_members(db, list_id, campaign_id, [foreign_voter_id])

    @pytest.mark.asyncio
    async def test_call_list_generation_rejects_foreign_voter_list(self):
        from app.schemas.call_list import CallListCreate
        from app.services.call_list import CallListService

        session = AsyncMock()
        service = CallListService()
        campaign_id = uuid.uuid4()
        voter_list_id = uuid.uuid4()
        session.execute.return_value = _scalar_result(None)

        with pytest.raises(ValueError, match=str(voter_list_id)):
            await service.generate_call_list(
                session,
                campaign_id,
                CallListCreate(name="test", voter_list_id=voter_list_id),
                "user-1",
            )

    @pytest.mark.asyncio
    async def test_record_interaction_rejects_foreign_voter(self):
        from app.models.voter_interaction import InteractionType
        from app.services.voter_interaction import VoterInteractionService

        session = AsyncMock()
        session.execute.return_value = _scalar_result(None)
        service = VoterInteractionService()

        with pytest.raises(VoterNotFoundError):
            await service.record_interaction(
                session=session,
                campaign_id=uuid.uuid4(),
                voter_id=uuid.uuid4(),
                interaction_type=InteractionType.NOTE,
                payload={"text": "nope"},
                user_id="user-1",
            )
        session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_shift_hours_rejects_foreign_volunteer(self):
        from app.services.shift import ShiftService

        session = AsyncMock()
        session.execute.return_value = _scalar_result(None)
        service = ShiftService()

        with pytest.raises(ValueError, match="not found"):
            await service.get_volunteer_hours(
                session,
                volunteer_id=uuid.uuid4(),
                campaign_id=uuid.uuid4(),
            )

    def test_field_route_requires_campaign_role_resolution(self):
        import inspect

        from app.api.v1.field import get_field_me

        source = inspect.getsource(get_field_me)
        assert 'Depends(require_role("volunteer"))' in source
