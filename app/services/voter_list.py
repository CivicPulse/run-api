"""Voter list business logic: CRUD, member management, dynamic evaluation."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import VoterNotFoundError
from app.core.time import utcnow
from app.models.voter import Voter
from app.models.voter_list import ListType, VoterList, VoterListMember
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.voter import VoterResponse
from app.schemas.voter_filter import VoterFilter
from app.services.voter import build_voter_query


class VoterListService:
    """Voter list CRUD and evaluation (static + dynamic)."""

    async def create_list(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        data: object,
        user_id: str,
    ) -> VoterList:
        """Create a new voter list.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.
            data: Pydantic model with list fields.
            user_id: The creating user's ID.

        Returns:
            The created VoterList.
        """
        fields = data.model_dump(exclude_unset=True)
        voter_list = VoterList(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            created_by=user_id,
            **fields,
        )
        db.add(voter_list)
        await db.commit()
        await db.refresh(voter_list)
        return voter_list

    async def get_list(
        self,
        db: AsyncSession,
        list_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> VoterList:
        """Get a voter list by ID, scoped to the given campaign.

        Args:
            db: Async database session.
            list_id: The list UUID.
            campaign_id: The campaign UUID used to scope the lookup.

        Returns:
            The VoterList.

        Raises:
            ValueError: If list not found in this campaign.
        """
        result = await db.execute(
            select(VoterList).where(
                VoterList.id == list_id,
                VoterList.campaign_id == campaign_id,
            )
        )
        voter_list = result.scalar_one_or_none()
        if voter_list is None:
            msg = f"Voter list {list_id} not found"
            raise ValueError(msg)
        return voter_list

    async def update_list(
        self,
        db: AsyncSession,
        list_id: uuid.UUID,
        campaign_id: uuid.UUID,
        data: object,
    ) -> VoterList:
        """Update a voter list scoped to a campaign.

        Args:
            db: Async database session.
            list_id: The list UUID.
            campaign_id: The campaign UUID used to scope the lookup.
            data: Pydantic model with fields to update.

        Returns:
            The updated VoterList.

        Raises:
            ValueError: If list not found in this campaign.
        """
        voter_list = await self.get_list(db, list_id, campaign_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(voter_list, field, value)
        voter_list.updated_at = utcnow()
        await db.commit()
        await db.refresh(voter_list)
        return voter_list

    async def delete_list(
        self,
        db: AsyncSession,
        list_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> None:
        """Delete a voter list and its members, scoped to a campaign.

        Args:
            db: Async database session.
            list_id: The list UUID.
            campaign_id: The campaign UUID used to scope the lookup.

        Raises:
            ValueError: If list not found in this campaign.
        """
        voter_list = await self.get_list(db, list_id, campaign_id)
        # Delete members first
        await db.execute(
            delete(VoterListMember).where(VoterListMember.voter_list_id == list_id)
        )
        await db.delete(voter_list)
        await db.commit()

    async def list_lists(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        cursor: str | None = None,
        limit: int = 50,
    ) -> tuple[list[VoterList], PaginationResponse]:
        """List voter lists for a campaign with cursor-based pagination.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID used to scope the listing.
            cursor: Opaque cursor string.
            limit: Maximum number of items.

        Returns:
            Tuple of (lists, pagination metadata).
        """
        query = (
            select(VoterList)
            .where(VoterList.campaign_id == campaign_id)
            .order_by(VoterList.created_at.desc(), VoterList.id.desc())
        )

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (VoterList.created_at < cursor_ts)
                    | ((VoterList.created_at == cursor_ts) & (VoterList.id < cursor_id))
                )

        query = query.limit(limit + 1)
        result = await db.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        pagination = PaginationResponse(
            next_cursor=next_cursor,
            has_more=has_more,
        )
        return items, pagination

    async def add_members(
        self,
        db: AsyncSession,
        list_id: uuid.UUID,
        campaign_id: uuid.UUID,
        voter_ids: list[uuid.UUID],
    ) -> None:
        """Add voters to a static list, scoped to a campaign.

        Args:
            db: Async database session.
            list_id: The list UUID.
            campaign_id: The campaign UUID used to scope the lookup.
            voter_ids: List of voter UUIDs to add.

        Raises:
            ValueError: If list is dynamic or not found in this campaign.
        """
        voter_list = await self.get_list(db, list_id, campaign_id)
        if voter_list.list_type != ListType.STATIC:
            msg = "Can only add members to static lists"
            raise ValueError(msg)

        result = await db.execute(
            select(Voter.id).where(
                Voter.campaign_id == campaign_id,
                Voter.id.in_(voter_ids),
            )
        )
        found_ids = set(result.scalars().all())
        missing_ids = [vid for vid in voter_ids if vid not in found_ids]
        if missing_ids:
            raise VoterNotFoundError(missing_ids[0])

        for vid in voter_ids:
            member = VoterListMember(voter_list_id=list_id, voter_id=vid)
            db.add(member)
        await db.commit()

    async def remove_members(
        self,
        db: AsyncSession,
        list_id: uuid.UUID,
        campaign_id: uuid.UUID,
        voter_ids: list[uuid.UUID],
    ) -> None:
        """Remove voters from a static list, scoped to a campaign.

        Args:
            db: Async database session.
            list_id: The list UUID.
            campaign_id: The campaign UUID used to scope the lookup.
            voter_ids: List of voter UUIDs to remove.

        Raises:
            ValueError: If list is dynamic or not found in this campaign.
        """
        voter_list = await self.get_list(db, list_id, campaign_id)
        if voter_list.list_type != ListType.STATIC:
            msg = "Can only remove members from static lists"
            raise ValueError(msg)

        await db.execute(
            delete(VoterListMember).where(
                and_(
                    VoterListMember.voter_list_id == list_id,
                    VoterListMember.voter_id.in_(voter_ids),
                )
            )
        )
        await db.commit()

    async def get_list_voters(
        self,
        db: AsyncSession,
        list_id: uuid.UUID,
        campaign_id: uuid.UUID,
        cursor: str | None = None,
        limit: int = 50,
    ) -> PaginatedResponse[VoterResponse]:
        """Get voters in a list, scoped to a campaign.

        Args:
            db: Async database session.
            list_id: The list UUID.
            campaign_id: The campaign UUID used to scope the lookup.
            cursor: Opaque cursor string.
            limit: Maximum number of items.

        Returns:
            PaginatedResponse with VoterResponse items.

        Raises:
            ValueError: If list not found in this campaign.
        """
        voter_list = await self.get_list(db, list_id, campaign_id)

        if voter_list.list_type == ListType.DYNAMIC:
            # Deserialize stored filter and evaluate
            filters = VoterFilter(**(voter_list.filter_query or {}))
            query = build_voter_query(filters)
        else:
            # Static list: join through voter_list_members
            query = select(Voter).join(
                VoterListMember,
                and_(
                    VoterListMember.voter_id == Voter.id,
                    VoterListMember.voter_list_id == list_id,
                ),
            )

        query = query.order_by(Voter.created_at.desc(), Voter.id.desc())

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (Voter.created_at < cursor_ts)
                    | ((Voter.created_at == cursor_ts) & (Voter.id < cursor_id))
                )

        query = query.limit(limit + 1)
        result = await db.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        return PaginatedResponse[VoterResponse](
            items=[VoterResponse.model_validate(v) for v in items],
            pagination=PaginationResponse(
                next_cursor=next_cursor,
                has_more=has_more,
            ),
        )
