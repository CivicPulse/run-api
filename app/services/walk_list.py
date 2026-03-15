"""Walk list service -- generation, household clustering, entry management."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import delete, desc, func, select
from sqlalchemy.orm import aliased

from app.core.time import utcnow
from app.models.turf import Turf
from app.models.voter import Voter
from app.models.voter_list import VoterListMember
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.walk_list import (
    WalkList,
    WalkListCanvasser,
    WalkListEntry,
    WalkListEntryStatus,
)
from app.services.turf import household_key, parse_address_sort_key

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.walk_list import WalkListCreate


class WalkListService:
    """Walk list generation, entry management, and canvasser assignment."""

    async def generate_walk_list(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: WalkListCreate,
        user_id: str,
    ) -> WalkList:
        """Generate a frozen walk list from a turf with household clustering.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            data: WalkListCreate schema with turf_id, optional voter_list_id, name.
            user_id: Creating user ID.

        Returns:
            The created WalkList with entry stats.

        Raises:
            ValueError: If turf not found or doesn't belong to campaign.
        """
        # Verify turf exists and belongs to campaign
        turf_result = await session.execute(
            select(Turf).where(Turf.id == data.turf_id, Turf.campaign_id == campaign_id)
        )
        turf = turf_result.scalar_one_or_none()
        if turf is None:
            msg = f"Turf {data.turf_id} not found in campaign {campaign_id}"
            raise ValueError(msg)

        # Build spatial query: voters inside turf boundary
        turf_boundary = (
            select(Turf.boundary).where(Turf.id == data.turf_id).scalar_subquery()
        )
        query = (
            select(Voter)
            .where(
                Voter.campaign_id == campaign_id,
                Voter.geom.is_not(None),
                func.ST_Contains(turf_boundary, Voter.geom),
            )
        )

        # Optional voter list intersection
        if data.voter_list_id is not None:
            query = query.join(
                VoterListMember,
                VoterListMember.voter_id == Voter.id,
            ).where(VoterListMember.voter_list_id == data.voter_list_id)

        result = await session.execute(query)
        voters = list(result.scalars().all())

        # Sort by street address: (street_name, house_number, last_name)
        voters.sort(key=lambda v: parse_address_sort_key(v.registration_line1, v.last_name))

        # Create walk list record
        now = utcnow()
        walk_list = WalkList(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            turf_id=data.turf_id,
            voter_list_id=data.voter_list_id,
            script_id=data.script_id,
            name=data.name,
            total_entries=0,
            visited_entries=0,
            created_by=user_id,
            created_at=now,
        )
        session.add(walk_list)

        # Create entries with household clustering
        sequence = 1
        for voter in voters:
            hkey = household_key(voter)
            entry = WalkListEntry(
                id=uuid.uuid4(),
                walk_list_id=walk_list.id,
                voter_id=voter.id,
                household_key=hkey,
                sequence=sequence,
                status=WalkListEntryStatus.PENDING,
            )
            session.add(entry)
            sequence += 1

        walk_list.total_entries = sequence - 1
        await session.flush()
        return walk_list

    async def get_walk_list(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
    ) -> WalkList | None:
        """Get a walk list by ID.

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.

        Returns:
            The WalkList or None.
        """
        result = await session.execute(
            select(WalkList).where(WalkList.id == walk_list_id)
        )
        return result.scalar_one_or_none()

    async def list_walk_lists(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        turf_id: uuid.UUID | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> tuple[list[WalkList], str | None, bool]:
        """List walk lists with optional turf filter and pagination.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            turf_id: Optional turf filter.
            cursor: Opaque cursor (created_at|id).
            limit: Max items to return.

        Returns:
            Tuple of (walk_lists, next_cursor, has_more).
        """
        query = (
            select(WalkList)
            .where(WalkList.campaign_id == campaign_id)
            .order_by(WalkList.created_at.desc(), WalkList.id.desc())
        )

        if turf_id is not None:
            query = query.where(WalkList.turf_id == turf_id)

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (WalkList.created_at < cursor_ts)
                    | (
                        (WalkList.created_at == cursor_ts)
                        & (WalkList.id < cursor_id)
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

        return items, next_cursor, has_more

    async def get_entries(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
        status_filter: WalkListEntryStatus | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> tuple[list[WalkListEntry], str | None, bool]:
        """Get walk list entries ordered by sequence.

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.
            status_filter: Optional status filter.
            cursor: Opaque cursor (sequence|id).
            limit: Max items.

        Returns:
            Tuple of (entries, next_cursor, has_more).
        """
        query = (
            select(WalkListEntry)
            .where(WalkListEntry.walk_list_id == walk_list_id)
            .order_by(WalkListEntry.sequence, WalkListEntry.id)
        )

        if status_filter is not None:
            query = query.where(WalkListEntry.status == status_filter)

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_seq = int(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (WalkListEntry.sequence > cursor_seq)
                    | (
                        (WalkListEntry.sequence == cursor_seq)
                        & (WalkListEntry.id > cursor_id)
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
            next_cursor = f"{last.sequence}|{last.id}"

        return items, next_cursor, has_more

    async def update_entry_status(
        self,
        session: AsyncSession,
        entry_id: uuid.UUID,
        status: WalkListEntryStatus,
    ) -> WalkListEntry:
        """Update an individual entry's status.

        Args:
            session: Async database session.
            entry_id: Entry UUID.
            status: New status value.

        Returns:
            The updated WalkListEntry.

        Raises:
            ValueError: If entry not found.
        """
        result = await session.execute(
            select(WalkListEntry).where(WalkListEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            msg = f"Walk list entry {entry_id} not found"
            raise ValueError(msg)
        entry.status = status
        await session.flush()
        return entry

    async def assign_canvasser(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
        user_id: str,
    ) -> WalkListCanvasser:
        """Assign a canvasser to a walk list.

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.
            user_id: Canvasser user ID.

        Returns:
            The created WalkListCanvasser.
        """
        now = utcnow()
        canvasser = WalkListCanvasser(
            walk_list_id=walk_list_id,
            user_id=user_id,
            assigned_at=now,
        )
        session.add(canvasser)
        await session.flush()
        return canvasser

    async def remove_canvasser(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
        user_id: str,
    ) -> None:
        """Remove a canvasser assignment from a walk list.

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.
            user_id: Canvasser user ID.
        """
        await session.execute(
            delete(WalkListCanvasser).where(
                WalkListCanvasser.walk_list_id == walk_list_id,
                WalkListCanvasser.user_id == user_id,
            )
        )
        await session.flush()

    async def list_canvassers(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
    ) -> list[WalkListCanvasser]:
        """List canvassers assigned to a walk list.

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.

        Returns:
            List of WalkListCanvasser records.
        """
        result = await session.execute(
            select(WalkListCanvasser).where(
                WalkListCanvasser.walk_list_id == walk_list_id
            )
        )
        return list(result.scalars().all())

    async def delete_walk_list(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
    ) -> None:
        """Delete a walk list (CASCADE on entries and canvassers).

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.

        Raises:
            ValueError: If walk list not found.
        """
        walk_list = await self.get_walk_list(session, walk_list_id)
        if walk_list is None:
            msg = f"Walk list {walk_list_id} not found"
            raise ValueError(msg)

        # Delete entries and canvassers first (in case CASCADE not set at DB level)
        await session.execute(
            delete(WalkListEntry).where(WalkListEntry.walk_list_id == walk_list_id)
        )
        await session.execute(
            delete(WalkListCanvasser).where(WalkListCanvasser.walk_list_id == walk_list_id)
        )
        await session.delete(walk_list)
        await session.flush()

    async def get_enriched_entries(
        self,
        session: AsyncSession,
        walk_list_id: uuid.UUID,
        limit: int = 500,
    ) -> list[dict]:
        """Get walk list entries enriched with voter details and interaction history.

        Joins WalkListEntry with Voter and aggregates door-knock interactions
        via correlated subqueries.

        Args:
            session: Async database session.
            walk_list_id: Walk list UUID.
            limit: Max entries to return (default 500).

        Returns:
            List of dicts mappable to EnrichedEntryResponse.
        """
        # Correlated subquery: count of door-knock interactions per voter
        attempt_count_sq = (
            select(func.count(VoterInteraction.id))
            .where(
                VoterInteraction.voter_id == WalkListEntry.voter_id,
                VoterInteraction.type == InteractionType.DOOR_KNOCK,
            )
            .correlate(WalkListEntry)
            .scalar_subquery()
            .label("attempt_count")
        )

        # Correlated subquery: latest door-knock interaction per voter
        latest_interaction = (
            select(VoterInteraction)
            .where(
                VoterInteraction.voter_id == WalkListEntry.voter_id,
                VoterInteraction.type == InteractionType.DOOR_KNOCK,
            )
            .correlate(WalkListEntry)
            .order_by(desc(VoterInteraction.created_at))
            .limit(1)
            .subquery()
        )

        last_result_sq = (
            select(latest_interaction.c.payload["result_code"].as_string())
            .scalar_subquery()
            .label("last_result")
        )
        last_date_sq = (
            select(latest_interaction.c.created_at)
            .scalar_subquery()
            .label("last_date")
        )

        query = (
            select(
                WalkListEntry.id,
                WalkListEntry.voter_id,
                WalkListEntry.household_key,
                WalkListEntry.sequence,
                WalkListEntry.status,
                Voter.first_name,
                Voter.last_name,
                Voter.party,
                Voter.age,
                Voter.propensity_combined,
                Voter.registration_line1,
                Voter.registration_line2,
                Voter.registration_city,
                Voter.registration_state,
                Voter.registration_zip,
                attempt_count_sq,
                last_result_sq,
                last_date_sq,
            )
            .join(Voter, Voter.id == WalkListEntry.voter_id)
            .where(WalkListEntry.walk_list_id == walk_list_id)
            .order_by(WalkListEntry.sequence.asc())
            .limit(limit)
        )

        result = await session.execute(query)
        rows = result.all()

        enriched = []
        for row in rows:
            enriched.append(
                {
                    "id": row.id,
                    "voter_id": row.voter_id,
                    "household_key": row.household_key,
                    "sequence": row.sequence,
                    "status": row.status,
                    "voter": {
                        "first_name": row.first_name,
                        "last_name": row.last_name,
                        "party": row.party,
                        "age": row.age,
                        "propensity_combined": row.propensity_combined,
                        "registration_line1": row.registration_line1,
                        "registration_line2": row.registration_line2,
                        "registration_city": row.registration_city,
                        "registration_state": row.registration_state,
                        "registration_zip": row.registration_zip,
                    },
                    "prior_interactions": {
                        "attempt_count": row.attempt_count or 0,
                        "last_result": row.last_result,
                        "last_date": (
                            row.last_date.isoformat() if row.last_date else None
                        ),
                    },
                }
            )
        return enriched
