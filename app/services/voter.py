"""Voter business logic: CRUD, search, query builder, and tag operations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import Select, and_, delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.voter import Voter, VoterTag, VoterTagMember
from app.models.voter_contact import VoterPhone
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.voter import VoterResponse
from app.schemas.voter_filter import VoterFilter

if TYPE_CHECKING:
    pass


def build_voter_query(filters: VoterFilter) -> Select:
    """Build a composable SQLAlchemy query from structured voter filters.

    Each non-None filter field appends a condition. Conditions are combined
    with AND (default) or OR based on ``filters.logic``.

    Args:
        filters: The structured filter object.

    Returns:
        A SQLAlchemy Select statement (caller adds pagination/ordering).
    """
    query = select(Voter)
    conditions: list = []

    # Exact match fields
    if filters.party is not None:
        conditions.append(Voter.party == filters.party)

    if filters.parties is not None:
        conditions.append(Voter.party.in_(filters.parties))

    if filters.precinct is not None:
        conditions.append(Voter.precinct == filters.precinct)

    if filters.registration_city is not None:
        conditions.append(Voter.registration_city == filters.registration_city)

    if filters.registration_state is not None:
        conditions.append(Voter.registration_state == filters.registration_state)

    if filters.registration_zip is not None:
        conditions.append(Voter.registration_zip == filters.registration_zip)

    if filters.registration_county is not None:
        conditions.append(Voter.registration_county == filters.registration_county)

    if filters.congressional_district is not None:
        conditions.append(
            Voter.congressional_district == filters.congressional_district
        )

    if filters.gender is not None:
        conditions.append(Voter.gender == filters.gender)

    # Age range
    if filters.age_min is not None:
        conditions.append(Voter.age >= filters.age_min)

    if filters.age_max is not None:
        conditions.append(Voter.age <= filters.age_max)

    # Voting history (array containment)
    if filters.voted_in is not None:
        for election in filters.voted_in:
            conditions.append(
                Voter.voting_history.contains([election])
            )

    if filters.not_voted_in is not None:
        for election in filters.not_voted_in:
            conditions.append(
                ~Voter.voting_history.contains([election])
            )

    # Tags — voter must have ALL tags
    if filters.tags is not None and len(filters.tags) > 0:
        tag_subquery = (
            select(VoterTagMember.voter_id)
            .join(VoterTag, VoterTag.id == VoterTagMember.tag_id)
            .where(VoterTag.name.in_(filters.tags))
            .group_by(VoterTagMember.voter_id)
            .having(func.count(VoterTagMember.tag_id) == len(filters.tags))
        ).correlate(Voter)
        conditions.append(Voter.id.in_(tag_subquery))

    # Tags any — voter must have ANY tag
    if filters.tags_any is not None and len(filters.tags_any) > 0:
        tag_any_subquery = (
            select(VoterTagMember.voter_id)
            .join(VoterTag, VoterTag.id == VoterTagMember.tag_id)
            .where(VoterTag.name.in_(filters.tags_any))
        ).correlate(Voter)
        conditions.append(Voter.id.in_(tag_any_subquery))

    # Registration date
    if filters.registered_after is not None:
        conditions.append(Voter.registration_date >= filters.registered_after)

    if filters.registered_before is not None:
        conditions.append(Voter.registration_date <= filters.registered_before)

    # Phone existence
    if filters.has_phone is not None:
        phone_subquery = select(VoterPhone).where(
            VoterPhone.voter_id == Voter.id
        ).correlate(Voter)
        if filters.has_phone:
            conditions.append(exists(phone_subquery))
        else:
            conditions.append(~exists(phone_subquery))

    # Free-text search on name
    if filters.search is not None:
        search_term = f"%{filters.search}%"
        name_expr = func.concat(
            func.coalesce(Voter.first_name, ""),
            " ",
            func.coalesce(Voter.last_name, ""),
        )
        conditions.append(name_expr.ilike(search_term))

    # Combine conditions
    if conditions:
        if filters.logic == "OR":
            query = query.where(or_(*conditions))
        else:
            query = query.where(and_(*conditions))

    return query


class VoterService:
    """Voter CRUD operations, search, and tag management."""

    async def search_voters(
        self,
        db: AsyncSession,
        filters: VoterFilter,
        cursor: str | None = None,
        limit: int = 50,
    ) -> PaginatedResponse[VoterResponse]:
        """Search voters with composable filters and cursor pagination.

        Args:
            db: Async database session (with RLS context set).
            filters: Structured voter filter.
            cursor: Opaque cursor string (created_at|id format).
            limit: Maximum number of items to return.

        Returns:
            PaginatedResponse with VoterResponse items.
        """
        query = build_voter_query(filters)
        query = query.order_by(Voter.created_at.desc(), Voter.id.desc())

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (Voter.created_at < cursor_ts)
                    | (
                        (Voter.created_at == cursor_ts)
                        & (Voter.id < cursor_id)
                    )
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

    async def get_voter(self, db: AsyncSession, voter_id: uuid.UUID) -> Voter:
        """Get a single voter by ID.

        Args:
            db: Async database session.
            voter_id: The voter UUID.

        Returns:
            The Voter object.

        Raises:
            ValueError: If voter not found.
        """
        result = await db.execute(select(Voter).where(Voter.id == voter_id))
        voter = result.scalar_one_or_none()
        if voter is None:
            msg = f"Voter {voter_id} not found"
            raise ValueError(msg)
        return voter

    async def create_voter(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        data: object,
    ) -> Voter:
        """Create a voter record manually.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.
            data: Pydantic model with voter fields.

        Returns:
            The created Voter.
        """
        voter = Voter(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            **data.model_dump(exclude_unset=True),
        )
        db.add(voter)
        await db.commit()
        await db.refresh(voter)
        return voter

    async def update_voter(
        self,
        db: AsyncSession,
        voter_id: uuid.UUID,
        data: object,
    ) -> Voter:
        """Update voter fields (partial update).

        Args:
            db: Async database session.
            voter_id: The voter UUID.
            data: Pydantic model with fields to update.

        Returns:
            The updated Voter.

        Raises:
            ValueError: If voter not found.
        """
        voter = await self.get_voter(db, voter_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(voter, field, value)
        voter.updated_at = utcnow()
        await db.commit()
        await db.refresh(voter)
        return voter

    # --- Tag operations ---

    async def create_tag(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        name: str,
    ) -> VoterTag:
        """Create a campaign-scoped voter tag.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.
            name: Tag name.

        Returns:
            The created VoterTag.
        """
        tag = VoterTag(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            name=name,
        )
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        return tag

    async def list_tags(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[VoterTag]:
        """List all tags for a campaign.

        Args:
            db: Async database session.
            campaign_id: The campaign UUID.

        Returns:
            List of VoterTag objects.
        """
        result = await db.execute(
            select(VoterTag).where(VoterTag.campaign_id == campaign_id)
        )
        return list(result.scalars().all())

    async def add_tag_to_voter(
        self,
        db: AsyncSession,
        voter_id: uuid.UUID,
        tag_id: uuid.UUID,
    ) -> None:
        """Add a tag to a voter.

        Args:
            db: Async database session.
            voter_id: The voter UUID.
            tag_id: The tag UUID.
        """
        member = VoterTagMember(voter_id=voter_id, tag_id=tag_id)
        db.add(member)
        await db.commit()

    async def remove_tag_from_voter(
        self,
        db: AsyncSession,
        voter_id: uuid.UUID,
        tag_id: uuid.UUID,
    ) -> None:
        """Remove a tag from a voter.

        Args:
            db: Async database session.
            voter_id: The voter UUID.
            tag_id: The tag UUID.
        """
        await db.execute(
            delete(VoterTagMember).where(
                and_(
                    VoterTagMember.voter_id == voter_id,
                    VoterTagMember.tag_id == tag_id,
                )
            )
        )
        await db.commit()

    async def get_voter_tags(
        self,
        db: AsyncSession,
        voter_id: uuid.UUID,
    ) -> list[VoterTag]:
        """Get all tags for a specific voter.

        Args:
            db: Async database session.
            voter_id: The voter UUID.

        Returns:
            List of VoterTag objects.
        """
        result = await db.execute(
            select(VoterTag)
            .join(VoterTagMember, VoterTag.id == VoterTagMember.tag_id)
            .where(VoterTagMember.voter_id == voter_id)
        )
        return list(result.scalars().all())
