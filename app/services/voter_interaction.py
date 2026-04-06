"""Voter interaction service -- event log operations with mutable notes."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.errors import VoterNotFoundError
from app.core.time import utcnow
from app.models.voter import Voter
from app.models.voter_interaction import InteractionType, VoterInteraction

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class InteractionPage:
    """Paginated interaction history result."""

    items: list[VoterInteraction] = field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool = False


class VoterInteractionService:
    """Voter interaction event service.

    System-generated events are append-only (never modified or deleted).
    Note-type interactions may be updated or deleted by users.
    Corrections for system events are recorded as new events referencing
    the original event ID in the payload.
    """

    async def _ensure_voter_in_campaign(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
    ) -> None:
        result = await session.execute(
            select(Voter.id).where(
                Voter.id == voter_id,
                Voter.campaign_id == campaign_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise VoterNotFoundError(voter_id)

    async def record_interaction(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        interaction_type: InteractionType,
        payload: dict,
        user_id: str,
    ) -> VoterInteraction:
        """Create an immutable interaction event.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID (for RLS).
            voter_id: Voter UUID.
            interaction_type: Type of interaction event.
            payload: JSONB event data.
            user_id: ID of the user creating the event.

        Returns:
            The created VoterInteraction record.
        """
        await self._ensure_voter_in_campaign(session, campaign_id, voter_id)
        interaction = VoterInteraction(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            voter_id=voter_id,
            type=interaction_type,
            payload=payload,
            created_by=user_id,
            created_at=utcnow(),
        )
        session.add(interaction)
        await session.flush()
        return interaction

    async def get_voter_history(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        type_filter: InteractionType | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> InteractionPage:
        """Retrieve voter interaction history ordered by created_at DESC.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            type_filter: Optional filter by interaction type.
            cursor: Opaque cursor (created_at|id format).
            limit: Maximum number of items to return.

        Returns:
            PaginatedResponse with interaction events, newest first.
        """
        query = (
            select(VoterInteraction)
            .where(
                VoterInteraction.campaign_id == campaign_id,
                VoterInteraction.voter_id == voter_id,
            )
            .order_by(
                VoterInteraction.created_at.desc(),
                VoterInteraction.id.desc(),
            )
        )

        if type_filter is not None:
            query = query.where(VoterInteraction.type == type_filter)

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (VoterInteraction.created_at < cursor_ts)
                    | (
                        (VoterInteraction.created_at == cursor_ts)
                        & (VoterInteraction.id < cursor_id)
                    )
                )

        query = query.limit(limit + 1)
        result = await session.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        return InteractionPage(
            items=items,
            next_cursor=next_cursor,
            has_more=has_more,
        )

    async def record_correction(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        original_event_id: uuid.UUID,
        correction_payload: dict,
        user_id: str,
    ) -> VoterInteraction:
        """Record a correction as a new event referencing the original.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            voter_id: Voter UUID.
            original_event_id: ID of the event being corrected.
            correction_payload: Correction data to include in payload.
            user_id: ID of the user creating the correction.

        Returns:
            The created correction VoterInteraction record.
        """
        payload = {
            "original_event_id": str(original_event_id),
            "correction": True,
            **correction_payload,
        }
        return await self.record_interaction(
            session=session,
            campaign_id=campaign_id,
            voter_id=voter_id,
            interaction_type=InteractionType.NOTE,
            payload=payload,
            user_id=user_id,
        )

    async def update_note(
        self,
        session: AsyncSession,
        interaction_id: uuid.UUID,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
        payload: dict,
    ) -> VoterInteraction:
        """Update a note interaction's payload.

        Only interactions with type=NOTE can be updated.
        System-generated events remain immutable.

        Args:
            session: Async database session.
            interaction_id: Interaction UUID.
            campaign_id: Campaign UUID (for scoping).
            voter_id: Voter UUID (for scoping).
            payload: New payload dict to replace existing.

        Returns:
            The updated VoterInteraction record.

        Raises:
            ValueError: If interaction not found or is not a note type.
        """
        result = await session.execute(
            select(VoterInteraction).where(
                VoterInteraction.id == interaction_id,
                VoterInteraction.campaign_id == campaign_id,
                VoterInteraction.voter_id == voter_id,
            )
        )
        interaction = result.scalar_one_or_none()
        if interaction is None:
            raise ValueError(f"Interaction {interaction_id} not found")
        if interaction.type != InteractionType.NOTE:
            raise ValueError(
                f"Interaction {interaction_id} is not a note (only notes can be edited)"
            )
        interaction.payload = payload
        await session.flush()
        return interaction

    async def delete_note(
        self,
        session: AsyncSession,
        interaction_id: uuid.UUID,
        campaign_id: uuid.UUID,
        voter_id: uuid.UUID,
    ) -> None:
        """Delete a note interaction.

        Only interactions with type=NOTE can be deleted.
        System-generated events remain immutable.

        Args:
            session: Async database session.
            interaction_id: Interaction UUID.
            campaign_id: Campaign UUID (for scoping).
            voter_id: Voter UUID (for scoping).

        Raises:
            ValueError: If interaction not found or is not a note type.
        """
        result = await session.execute(
            select(VoterInteraction).where(
                VoterInteraction.id == interaction_id,
                VoterInteraction.campaign_id == campaign_id,
                VoterInteraction.voter_id == voter_id,
            )
        )
        interaction = result.scalar_one_or_none()
        if interaction is None:
            raise ValueError(f"Interaction {interaction_id} not found")
        if interaction.type != InteractionType.NOTE:
            raise ValueError(
                f"Interaction {interaction_id} is not a note"
                " (only notes can be deleted)"
            )
        await session.delete(interaction)
        await session.flush()
