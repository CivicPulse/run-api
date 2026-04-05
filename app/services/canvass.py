"""Canvass service -- door-knock recording with atomic entry status updates."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, cast

from sqlalchemy import func, select

from app.models.survey import SurveyScript
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import WalkList, WalkListEntry, WalkListEntryStatus
from app.schemas.canvass import DoorKnockResponse
from app.services.survey import SurveyService
from app.services.voter_interaction import VoterInteractionService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.canvass import DoorKnockCreate


class CanvassService:
    """Door-knock recording with atomic entry status and walk list stat updates."""

    def __init__(self) -> None:
        self._interaction_service = VoterInteractionService()
        self._survey_service = SurveyService()

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
        entry_result = await session.execute(
            select(WalkListEntry).where(
                WalkListEntry.id == data.walk_list_entry_id,
                WalkListEntry.walk_list_id == walk_list_id,
            )
        )
        entry = entry_result.scalar_one_or_none()
        if entry is None:
            msg = (
                f"Entry {data.walk_list_entry_id} not found in walk list {walk_list_id}"
            )
            raise ValueError(msg)

        walk_list_result = await session.execute(
            select(WalkList).where(WalkList.id == walk_list_id)
        )
        walk_list = walk_list_result.scalar_one()

        payload = {
            "result_code": data.result_code.value,
            "walk_list_id": str(walk_list_id),
            "notes": data.notes,
            "survey_complete": data.survey_complete,
        }

        script_id: uuid.UUID | None = None
        if data.survey_responses:
            script_id = await self._resolve_walk_list_script_id(
                session=session,
                campaign_id=campaign_id,
                walk_list=walk_list,
            )
            payload["script_id"] = str(script_id)
            payload["survey_response_count"] = len(data.survey_responses)

        interaction = await self._interaction_service.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=data.voter_id,
            interaction_type=InteractionType.DOOR_KNOCK,
            payload=payload,
            user_id=user_id,
        )

        if data.survey_responses:
            assert script_id is not None
            await self._survey_service.record_responses_batch(
                session=session,
                campaign_id=campaign_id,
                script_id=script_id,
                voter_id=data.voter_id,
                responses=data.survey_responses,
                user_id=user_id,
            )

        entry.status = WalkListEntryStatus.VISITED
        walk_list.visited_entries = WalkList.visited_entries + 1

        await session.flush()

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

    async def _resolve_walk_list_script_id(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        walk_list: WalkList,
    ) -> uuid.UUID:
        """Resolve the authoritative survey script for a walk list contact.

        Door-knock survey responses must persist under the same
        ``campaign_id/script_id/voter_id`` contract used by readback.
        Reject response batches when the walk list has no attached script or
        the script cannot be resolved in the same campaign context.
        """
        script_id = walk_list.script_id
        if script_id is None:
            msg = (
                "Survey responses require a walk list with an attached survey script"
            )
            raise ValueError(msg)

        script_result = await session.execute(
            select(SurveyScript).where(
                SurveyScript.id == script_id,
                SurveyScript.campaign_id == campaign_id,
            )
        )
        script = script_result.scalar_one_or_none()
        if script is None:
            msg = (
                f"Walk list {walk_list.id} references survey script {script_id} "
                f"outside campaign {campaign_id}"
            )
            raise ValueError(msg)

        return cast(uuid.UUID, script.id)
