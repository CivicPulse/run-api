"""Voter business logic: CRUD, search, query builder, and tag operations."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

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

_YEAR_ONLY_RE = re.compile(r"^\d{4}$")

# Columns that are stored as integers and need int() parsing in cursor decode.
_INT_SORT_COLUMNS = frozenset(
    {
        "age",
        "propensity_general",
        "propensity_primary",
        "propensity_combined",
        "household_size",
    }
)

# Columns that are stored as datetimes and need fromisoformat() parsing.
_DATETIME_SORT_COLUMNS = frozenset({"created_at", "updated_at"})


def encode_cursor(item: object, sort_by: str | None) -> str:
    """Encode a cursor from the last item in a result set.

    Format: ``sort_column_value|id``.  For datetime values the ISO
    representation is used.  ``None`` values are encoded as the literal
    string ``"None"``.
    """
    col = sort_by or "created_at"
    val = getattr(item, col)
    if isinstance(val, datetime):
        val = val.isoformat()
    elif val is None:
        val = "None"
    else:
        val = str(val)
    return f"{val}|{item.id}"


def decode_cursor(cursor: str, sort_by: str | None) -> tuple:
    """Decode a cursor string into ``(sort_value, id)``."""
    val_str, id_str = cursor.split("|", 1)
    cursor_id = uuid.UUID(id_str)
    col = sort_by or "created_at"

    if val_str == "None":
        return None, cursor_id

    if col in _DATETIME_SORT_COLUMNS:
        cursor_val = datetime.fromisoformat(val_str)
    elif col in _INT_SORT_COLUMNS:
        cursor_val = int(val_str)
    else:
        cursor_val = val_str

    return cursor_val, cursor_id


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
        conditions.append(
            func.lower(Voter.registration_city) == filters.registration_city.lower()
        )

    if filters.registration_state is not None:
        conditions.append(
            func.lower(Voter.registration_state) == filters.registration_state.lower()
        )

    if filters.registration_zip is not None:
        conditions.append(Voter.registration_zip == filters.registration_zip)

    if filters.registration_county is not None:
        conditions.append(
            func.lower(Voter.registration_county) == filters.registration_county.lower()
        )

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

    # Propensity score ranges
    if filters.propensity_general_min is not None:
        conditions.append(Voter.propensity_general >= filters.propensity_general_min)

    if filters.propensity_general_max is not None:
        conditions.append(Voter.propensity_general <= filters.propensity_general_max)

    if filters.propensity_primary_min is not None:
        conditions.append(Voter.propensity_primary >= filters.propensity_primary_min)

    if filters.propensity_primary_max is not None:
        conditions.append(Voter.propensity_primary <= filters.propensity_primary_max)

    if filters.propensity_combined_min is not None:
        conditions.append(Voter.propensity_combined >= filters.propensity_combined_min)

    if filters.propensity_combined_max is not None:
        conditions.append(Voter.propensity_combined <= filters.propensity_combined_max)

    # Multi-select demographics (case-insensitive)
    if filters.ethnicities is not None:
        conditions.append(
            func.lower(Voter.ethnicity).in_([v.lower() for v in filters.ethnicities])
        )

    if filters.spoken_languages is not None:
        conditions.append(
            func.lower(Voter.spoken_language).in_(
                [v.lower() for v in filters.spoken_languages]
            )
        )

    if filters.military_statuses is not None:
        conditions.append(
            func.lower(Voter.military_status).in_(
                [v.lower() for v in filters.military_statuses]
            )
        )

    # Mailing address
    if filters.mailing_city is not None:
        conditions.append(
            func.lower(Voter.mailing_city) == filters.mailing_city.lower()
        )

    if filters.mailing_state is not None:
        conditions.append(
            func.lower(Voter.mailing_state) == filters.mailing_state.lower()
        )

    if filters.mailing_zip is not None:
        conditions.append(Voter.mailing_zip == filters.mailing_zip)

    # Voting history (year-aware expansion for backward compatibility)
    if filters.voted_in is not None:
        for election in filters.voted_in:
            if _YEAR_ONLY_RE.match(election):
                # Year-only: voter participated in ANY election that year (OR)
                expanded = [f"General_{election}", f"Primary_{election}"]
                conditions.append(Voter.voting_history.overlap(expanded))
            else:
                # Canonical format: exact containment (existing behavior)
                conditions.append(Voter.voting_history.contains([election]))

    if filters.not_voted_in is not None:
        for election in filters.not_voted_in:
            if _YEAR_ONLY_RE.match(election):
                # Year-only: voter did NOT vote in ANY election that year
                # Two separate NOT CONTAINS (AND semantics: skipped BOTH)
                conditions.append(
                    ~Voter.voting_history.contains([f"General_{election}"])
                )
                conditions.append(
                    ~Voter.voting_history.contains([f"Primary_{election}"])
                )
            else:
                # Canonical format: exact NOT containment (existing behavior)
                conditions.append(~Voter.voting_history.contains([election]))

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
        phone_subquery = (
            select(VoterPhone).where(VoterPhone.voter_id == Voter.id).correlate(Voter)
        )
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
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> PaginatedResponse[VoterResponse]:
        """Search voters with composable filters and cursor pagination.

        Args:
            db: Async database session (with RLS context set).
            filters: Structured voter filter.
            cursor: Opaque cursor string (sort_value|id format).
            limit: Maximum number of items to return.
            sort_by: Column name to sort by (None defaults to created_at).
            sort_dir: Sort direction - "asc" or "desc" (None defaults to "desc").

        Returns:
            PaginatedResponse with VoterResponse items.
        """
        query = build_voter_query(filters)

        # Dynamic sort column with tiebreaker on id
        sort_col = getattr(Voter, sort_by) if sort_by else Voter.created_at
        is_desc = (sort_dir or "desc") == "desc"

        if is_desc:
            query = query.order_by(sort_col.desc(), Voter.id.desc())
        else:
            query = query.order_by(sort_col.asc().nullslast(), Voter.id.asc())

        # Cursor-based pagination with dynamic column
        if cursor:
            cursor_val, cursor_id = decode_cursor(cursor, sort_by)

            if cursor_val is None:
                # NULL sort value: only compare by id among NULL rows
                if is_desc:
                    query = query.where(
                        (sort_col.is_not(None))
                        | ((sort_col.is_(None)) & (Voter.id < cursor_id))
                    )
                else:
                    query = query.where((sort_col.is_(None)) & (Voter.id > cursor_id))
            else:
                if is_desc:
                    query = query.where(
                        (sort_col < cursor_val)
                        | ((sort_col == cursor_val) & (Voter.id < cursor_id))
                    )
                else:
                    query = query.where(
                        (sort_col > cursor_val)
                        | ((sort_col == cursor_val) & (Voter.id > cursor_id))
                    )

        query = query.limit(limit + 1)
        result = await db.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            next_cursor = encode_cursor(items[-1], sort_by)

        return PaginatedResponse[VoterResponse](
            items=[VoterResponse.model_validate(v) for v in items],
            pagination=PaginationResponse(
                next_cursor=next_cursor,
                has_more=has_more,
            ),
        )

    async def distinct_values(
        self,
        db: AsyncSession,
        fields: set[str],
    ) -> dict[str, list[dict[str, str | int]]]:
        """Return distinct values with counts for the requested fields.

        For each field, queries non-NULL values grouped by value and ordered
        by count descending.

        Args:
            db: Async database session (with RLS context set).
            fields: Set of column names to query.

        Returns:
            Dict mapping field name to list of {"value": str, "count": int}.
        """
        result: dict[str, list[dict[str, str | int]]] = {}
        for field in fields:
            col = getattr(Voter, field)
            stmt = (
                select(col, func.count().label("cnt"))
                .where(col.is_not(None))
                .group_by(col)
                .order_by(func.count().desc())
            )
            rows = await db.execute(stmt)
            result[field] = [{"value": str(row[0]), "count": row[1]} for row in rows]
        return result

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
        # Use exclude_none (not exclude_unset) so that schema defaults
        # like source_type="manual" are included in the INSERT.
        voter = Voter(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            **data.model_dump(exclude_none=True),
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

    async def delete_voter(
        self,
        db: AsyncSession,
        voter_id: uuid.UUID,
    ) -> None:
        """Delete a voter record.

        Args:
            db: Async database session.
            voter_id: The voter UUID.

        Raises:
            ValueError: If voter not found.
        """
        voter = await self.get_voter(db, voter_id)
        await db.delete(voter)
        await db.flush()

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
