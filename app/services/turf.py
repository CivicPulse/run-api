"""Turf service -- CRUD with GeoJSON validation and spatial voter queries."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape
from shapely.validation import explain_validity
from sqlalchemy import func, select

from app.core.time import utcnow
from app.models.turf import Turf, TurfStatus
from app.models.voter import Voter

if TYPE_CHECKING:
    from geoalchemy2 import WKBElement
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.turf import TurfCreate, TurfUpdate

# Valid status transitions (from -> allowed targets)
_STATUS_TRANSITIONS: dict[TurfStatus, set[TurfStatus]] = {
    TurfStatus.DRAFT: {TurfStatus.ACTIVE},
    TurfStatus.ACTIVE: {TurfStatus.COMPLETED},
    TurfStatus.COMPLETED: set(),
}


def _validate_polygon(geojson: dict[str, Any]) -> WKBElement:
    """Convert GeoJSON geometry dict to WKBElement with validation.

    Args:
        geojson: GeoJSON geometry dict (e.g. {"type": "Polygon", "coordinates": [...]}).

    Returns:
        WKBElement for storage.

    Raises:
        ValueError: If geometry is not a valid polygon.
    """
    coordinates = geojson.get("coordinates")
    if not isinstance(coordinates, list):
        raise ValueError("Polygon coordinates are required")
    for ring in coordinates:
        if not isinstance(ring, list):
            raise ValueError("Polygon coordinates must contain linear rings")
        for point in ring:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                raise ValueError("Polygon points must be [longitude, latitude]")
            longitude, latitude = point[0], point[1]
            if not isinstance(longitude, (int, float)) or not isinstance(
                latitude, (int, float)
            ):
                raise ValueError("Polygon coordinates must be numeric")
            if not (-180 <= float(longitude) <= 180):
                raise ValueError("Longitude must be between -180 and 180")
            if not (-90 <= float(latitude) <= 90):
                raise ValueError("Latitude must be between -90 and 90")

    geom = shape(geojson)
    if geom.geom_type != "Polygon":
        msg = f"Expected Polygon, got {geom.geom_type}"
        raise ValueError(msg)
    if not geom.is_valid:
        msg = f"Invalid polygon: {explain_validity(geom)}"
        raise ValueError(msg)
    if geom.area == 0:
        msg = "Degenerate polygon: area is zero"
        raise ValueError(msg)
    return from_shape(geom, srid=4326)


def _wkb_to_geojson(wkb: WKBElement) -> dict[str, Any]:
    """Convert WKBElement to GeoJSON dict.

    Args:
        wkb: PostGIS WKBElement.

    Returns:
        GeoJSON geometry dict.
    """
    geom = to_shape(wkb)
    return mapping(geom)


def parse_address_sort_key(
    address: str | None, last_name: str | None = None
) -> tuple[str, int, str]:
    """Extract (street_name, house_number, last_name) for walk order sorting.

    Args:
        address: The registration_line1 value.
        last_name: The voter's last name (tiebreaker).

    Returns:
        Tuple for sorting: (street_name_upper, house_number, last_name_upper).
    """
    addr = (address or "").strip()
    match = re.match(r"^(\d+)\s+(.+)$", addr)
    if match:
        return (match.group(2).upper(), int(match.group(1)), (last_name or "").upper())
    return (addr.upper(), 0, (last_name or "").upper())


def household_key(voter: Voter) -> str:
    """Generate normalized household key from voter address.

    Uses household_id if available, otherwise normalizes address fields.

    Args:
        voter: Voter model instance.

    Returns:
        String household key.
    """
    if voter.household_id:
        return voter.household_id
    addr = (voter.registration_line1 or "").strip().upper()
    zip5 = (voter.registration_zip or "").strip()[:5]
    return f"{addr}|{zip5}"


class TurfService:
    """Turf CRUD with GeoJSON validation and spatial voter queries."""

    async def create_turf(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: TurfCreate,
        user_id: str,
    ) -> Turf:
        """Create a new turf with validated GeoJSON boundary.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            data: TurfCreate schema.
            user_id: Creating user ID.

        Returns:
            The created Turf.

        Raises:
            ValueError: If GeoJSON boundary is invalid.
        """
        boundary_wkb = _validate_polygon(data.boundary)
        now = utcnow()
        turf = Turf(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            name=data.name,
            description=data.description,
            status=TurfStatus.DRAFT,
            boundary=boundary_wkb,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(turf)
        await session.flush()
        return turf

    async def get_turf(
        self,
        session: AsyncSession,
        turf_id: uuid.UUID,
        campaign_id: uuid.UUID | None = None,
    ) -> Turf | None:
        """Get a turf by ID.

        Args:
            session: Async database session.
            turf_id: Turf UUID.

        Returns:
            The Turf or None.
        """
        stmt = select(Turf).where(Turf.id == turf_id)
        if campaign_id is not None:
            stmt = stmt.where(Turf.campaign_id == campaign_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_turfs(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        status_filter: TurfStatus | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> tuple[list[Turf], str | None, bool]:
        """List turfs with pagination and optional status filter.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            status_filter: Optional status to filter by.
            cursor: Opaque cursor (created_at|id).
            limit: Max items to return.

        Returns:
            Tuple of (turfs, next_cursor, has_more).
        """
        query = (
            select(Turf)
            .where(Turf.campaign_id == campaign_id)
            .order_by(Turf.created_at.desc(), Turf.id.desc())
        )

        if status_filter is not None:
            query = query.where(Turf.status == status_filter)

        if cursor:
            parts = cursor.split("|", 1)
            if len(parts) == 2:
                cursor_ts = datetime.fromisoformat(parts[0])
                cursor_id = uuid.UUID(parts[1])
                query = query.where(
                    (Turf.created_at < cursor_ts)
                    | ((Turf.created_at == cursor_ts) & (Turf.id < cursor_id))
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

    async def update_turf(
        self,
        session: AsyncSession,
        turf_id: uuid.UUID,
        data: TurfUpdate,
    ) -> Turf:
        """Update turf fields with status transition enforcement.

        Args:
            session: Async database session.
            turf_id: Turf UUID.
            data: TurfUpdate schema.

        Returns:
            The updated Turf.

        Raises:
            ValueError: If turf not found, invalid boundary,
                or invalid status transition.
        """
        turf = await self.get_turf(session, turf_id)
        if turf is None:
            msg = f"Turf {turf_id} not found"
            raise ValueError(msg)

        update_fields = data.model_dump(exclude_unset=True)

        if "boundary" in update_fields and update_fields["boundary"] is not None:
            update_fields["boundary"] = _validate_polygon(update_fields["boundary"])

        if "status" in update_fields and update_fields["status"] is not None:
            new_status = TurfStatus(update_fields["status"])
            allowed = _STATUS_TRANSITIONS.get(TurfStatus(turf.status), set())
            if new_status not in allowed:
                msg = f"Cannot transition from {turf.status} to {new_status}"
                raise ValueError(msg)

        for field, value in update_fields.items():
            if value is not None:
                setattr(turf, field, value)

        turf.updated_at = utcnow()
        await session.flush()
        return turf

    async def delete_turf(
        self,
        session: AsyncSession,
        turf_id: uuid.UUID,
    ) -> None:
        """Delete a turf (CASCADE handles walk lists).

        Args:
            session: Async database session.
            turf_id: Turf UUID.

        Raises:
            ValueError: If turf not found.
        """
        turf = await self.get_turf(session, turf_id)
        if turf is None:
            msg = f"Turf {turf_id} not found"
            raise ValueError(msg)
        await session.delete(turf)
        await session.flush()

    async def get_voter_counts_batch(
        self,
        session: AsyncSession,
        turf_ids: list[uuid.UUID],
    ) -> dict[uuid.UUID, int]:
        """Get voter counts for multiple turfs in a single query.

        Args:
            session: Async database session.
            turf_ids: List of turf UUIDs.

        Returns:
            Dict mapping turf ID to voter count.
        """
        if not turf_ids:
            return {}
        query = (
            select(
                Turf.id,
                func.count(Voter.id).label("voter_count"),
            )
            .outerjoin(
                Voter,
                (Voter.geom.is_not(None))
                & (Voter.campaign_id == Turf.campaign_id)
                & func.ST_Contains(Turf.boundary, Voter.geom),
            )
            .where(Turf.id.in_(turf_ids))
            .group_by(Turf.id)
        )
        result = await session.execute(query)
        return {row.id: row.voter_count for row in result.all()}

    async def get_voter_count(
        self,
        session: AsyncSession,
        turf_id: uuid.UUID,
    ) -> int:
        """Count voters whose geom is within the turf boundary.

        Args:
            session: Async database session.
            turf_id: Turf UUID.

        Returns:
            Count of voters within the turf boundary.
        """
        turf_boundary = (
            select(Turf.boundary).where(Turf.id == turf_id).scalar_subquery()
        )
        query = select(func.count(Voter.id)).where(
            Voter.geom.is_not(None),
            Voter.campaign_id
            == select(Turf.campaign_id).where(Turf.id == turf_id).scalar_subquery(),
            func.ST_Contains(turf_boundary, Voter.geom),
        )
        result = await session.execute(query)
        return result.scalar_one()
