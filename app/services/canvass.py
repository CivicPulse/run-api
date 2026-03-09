"""Canvass service -- door-knock recording with atomic entry status updates."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import WalkList, WalkListEntry, WalkListEntryStatus
from app.schemas.canvass import DoorKnockResponse
from app.services.voter_interaction import VoterInteractionService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.canvass import DoorKnockCreate


class CanvassService:
    """Door-knock recording with atomic entry status and walk list stat updates."""

    def __init__(self) -> None:
        self._interaction_service = VoterInteractionService()

    async def record_door_knock(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        walk_list_id: uuid.UUID,
        data: DoorKnockCreate,
        user_id: str,
    ) -> DoorKnockResponse:
        """Record a door knock atomically: interaction + entry status + list stats.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            walk_list_id: Walk list UUID.
            data: DoorKnockCreate schema.
            user_id: Recording user ID.

        Returns:
            DoorKnockResponse with interaction details and attempt number.

        Raises:
            ValueError: If entry doesn't belong to the walk list.
        """
        # Verify walk_list_entry belongs to this walk_list
        entry_result = await session.execute(
            select(WalkListEntry).where(
                WalkListEntry.id == data.walk_list_entry_id,
                WalkListEntry.walk_list_id == walk_list_id,
            )
        )
        entry = entry_result.scalar_one_or_none()
        if entry is None:
            msg = f"Entry {data.walk_list_entry_id} not found in walk list {walk_list_id}"
            raise ValueError(msg)

        # Record VoterInteraction with DOOR_KNOCK type
        payload = {
            "result_code": data.result_code.value,
            "walk_list_id": str(walk_list_id),
            "notes": data.notes,
        }
        interaction = await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=data.voter_id,
            interaction_type=InteractionType.DOOR_KNOCK,
            payload=payload,
            user_id=user_id,
        )

        # Update entry status to VISITED atomically
        entry.status = WalkListEntryStatus.VISITED

        # Increment walk list visited_entries using SQL expression
        walk_list_result = await session.execute(
            select(WalkList).where(WalkList.id == walk_list_id)
        )
        walk_list = walk_list_result.scalar_one()
        walk_list.visited_entries = WalkList.visited_entries + 1

        await session.flush()

        # Compute attempt_number on read: count of DOOR_KNOCK interactions for this voter
        count_result = await session.execute(
            select(func.count(VoterInteraction.id)).where(
                VoterInteraction.voter_id == data.voter_id,
                VoterInteraction.campaign_id == campaign_id,
                VoterInteraction.type == InteractionType.DOOR_KNOCK,
            )
        )
        attempt_number = count_result.scalar_one()

        return DoorKnockResponse(
            interaction_id=interaction.id,
            voter_id=data.voter_id,
            result_code=data.result_code,
            walk_list_id=walk_list_id,
            notes=data.notes,
            attempt_number=attempt_number,
            created_at=interaction.created_at,
        )
