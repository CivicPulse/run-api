"""Volunteer service -- profile CRUD, skills, tags, availability, and search."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import delete, select

from app.core.time import utcnow
from app.models.volunteer import (
    Volunteer,
    VolunteerAvailability,
    VolunteerStatus,
    VolunteerTag,
    VolunteerTagMember,
)

if TYPE_CHECKING:
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.volunteer import (
        AvailabilityCreate,
        VolunteerCreate,
        VolunteerUpdate,
    )

logger = logging.getLogger(__name__)

# Valid status transitions (forward only)
_VALID_TRANSITIONS: dict[str, set[str]] = {
    VolunteerStatus.PENDING: {VolunteerStatus.ACTIVE, VolunteerStatus.INACTIVE},
    VolunteerStatus.ACTIVE: {VolunteerStatus.INACTIVE},
    VolunteerStatus.INACTIVE: set(),
}


class VolunteerService:
    """Volunteer profile CRUD, skills, tags, availability, and search."""

    # -------------------------------------------------------------------
    # Volunteer CRUD
    # -------------------------------------------------------------------

    async def create_volunteer(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: VolunteerCreate,
        created_by: str,
        user_id: str | None = None,
    ) -> Volunteer:
        """Create a volunteer record (manager-created, optionally with user_id).

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            data: VolunteerCreate schema.
            created_by: User ID of the creator.
            user_id: Optional user account link.

        Returns:
            The created Volunteer.
        """
        now = utcnow()
        volunteer = Volunteer(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            user_id=user_id,
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            email=data.email,
            street=data.street,
            city=data.city,
            state=data.state,
            zip_code=data.zip_code,
            emergency_contact_name=data.emergency_contact_name,
            emergency_contact_phone=data.emergency_contact_phone,
            notes=data.notes,
            skills=data.skills or [],
            status=VolunteerStatus.PENDING,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        session.add(volunteer)
        return volunteer

    async def self_register(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        user_id: str,
        data: VolunteerCreate,
    ) -> Volunteer:
        """Logged-in user self-registers as a volunteer.

        Auto-links user_id and sets created_by to the user.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            user_id: Authenticated user ID.
            data: VolunteerCreate schema.

        Returns:
            The created Volunteer.

        Raises:
            ValueError: If user already registered for this campaign.
        """
        # Check for existing volunteer with same user_id in campaign
        existing = await session.execute(
            select(Volunteer).where(
                Volunteer.campaign_id == campaign_id,
                Volunteer.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            msg = f"User {user_id} already registered as volunteer for campaign {campaign_id}"
            raise ValueError(msg)

        return await self.create_volunteer(
            session, campaign_id, data, created_by=user_id, user_id=user_id
        )

    async def get_volunteer(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
    ) -> Volunteer | None:
        """Fetch a volunteer by ID.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.

        Returns:
            Volunteer or None.
        """
        result = await session.execute(
            select(Volunteer).where(Volunteer.id == volunteer_id)
        )
        return result.scalar_one_or_none()

    async def get_volunteer_detail(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
    ) -> dict | None:
        """Fetch a volunteer with tags and availability included.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.

        Returns:
            Dict with volunteer data plus tags and availability, or None.
        """
        volunteer = await self.get_volunteer(session, volunteer_id)
        if volunteer is None:
            return None

        # Fetch tags
        tag_result = await session.execute(
            select(VolunteerTag.name)
            .join(
                VolunteerTagMember,
                VolunteerTagMember.tag_id == VolunteerTag.id,
            )
            .where(VolunteerTagMember.volunteer_id == volunteer_id)
        )
        tags = list(tag_result.scalars().all())

        # Fetch availability
        avail_result = await session.execute(
            select(VolunteerAvailability).where(
                VolunteerAvailability.volunteer_id == volunteer_id
            )
        )
        availability = list(avail_result.scalars().all())

        return {
            "volunteer": volunteer,
            "tags": tags,
            "availability": availability,
        }

    async def update_volunteer(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        data: VolunteerUpdate,
    ) -> Volunteer:
        """Partial update of volunteer profile.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.
            data: VolunteerUpdate schema with fields to update.

        Returns:
            The updated Volunteer.

        Raises:
            ValueError: If volunteer not found.
        """
        volunteer = await self.get_volunteer(session, volunteer_id)
        if volunteer is None:
            msg = f"Volunteer {volunteer_id} not found"
            raise ValueError(msg)

        update_fields = data.model_dump(exclude_unset=True)
        # Status updates go through update_status
        update_fields.pop("status", None)

        for key, value in update_fields.items():
            setattr(volunteer, key, value)

        volunteer.updated_at = utcnow()
        return volunteer

    async def update_status(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        new_status: str,
    ) -> Volunteer:
        """Update volunteer status with transition enforcement.

        Valid transitions: pending->active, pending->inactive, active->inactive.
        No backward transitions.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.
            new_status: Target status string.

        Returns:
            The updated Volunteer.

        Raises:
            ValueError: If volunteer not found or invalid transition.
        """
        volunteer = await self.get_volunteer(session, volunteer_id)
        if volunteer is None:
            msg = f"Volunteer {volunteer_id} not found"
            raise ValueError(msg)

        valid_targets = _VALID_TRANSITIONS.get(volunteer.status, set())
        if new_status not in valid_targets:
            msg = f"Invalid status transition from {volunteer.status} to {new_status}"
            raise ValueError(msg)

        volunteer.status = new_status
        volunteer.updated_at = utcnow()
        return volunteer

    # -------------------------------------------------------------------
    # Listing / search
    # -------------------------------------------------------------------

    async def list_volunteers(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        *,
        status: str | None = None,
        skills: list[str] | None = None,
        name_search: str | None = None,
        tag_ids: list[uuid.UUID] | None = None,
        cursor: tuple[datetime, uuid.UUID] | None = None,
        limit: int = 50,
    ) -> list[Volunteer]:
        """List volunteers with optional filters and cursor pagination.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            status: Filter by volunteer status.
            skills: Filter by any matching skill.
            name_search: ILIKE search on first_name || last_name.
            tag_ids: Filter by tag IDs (volunteers with any of these tags).
            cursor: (created_at, id) tuple for pagination.
            limit: Max results to return.

        Returns:
            List of Volunteer objects.
        """

        stmt = select(Volunteer).where(Volunteer.campaign_id == campaign_id)

        if status is not None:
            stmt = stmt.where(Volunteer.status == status)

        if skills:
            # ANY match: volunteer has at least one of the requested skills
            stmt = stmt.where(Volunteer.skills.overlap(skills))

        if name_search:
            search_term = f"%{name_search}%"
            stmt = stmt.where(
                (Volunteer.first_name + " " + Volunteer.last_name).ilike(search_term)
            )

        if tag_ids:
            stmt = stmt.where(
                Volunteer.id.in_(
                    select(VolunteerTagMember.volunteer_id).where(
                        VolunteerTagMember.tag_id.in_(tag_ids)
                    )
                )
            )

        if cursor:
            cursor_time, cursor_id = cursor
            stmt = stmt.where(
                (Volunteer.created_at, Volunteer.id) > (cursor_time, cursor_id)
            )

        stmt = stmt.order_by(Volunteer.created_at, Volunteer.id).limit(limit)

        result = await session.execute(stmt)
        return list(result.scalars().all())

    # -------------------------------------------------------------------
    # Tags
    # -------------------------------------------------------------------

    async def create_tag(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        name: str,
    ) -> VolunteerTag:
        """Create a campaign-scoped volunteer tag.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            name: Tag name.

        Returns:
            The created VolunteerTag.
        """
        tag = VolunteerTag(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            name=name,
            created_at=utcnow(),
        )
        session.add(tag)
        return tag

    async def list_tags(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
    ) -> list[VolunteerTag]:
        """List all volunteer tags for a campaign.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.

        Returns:
            List of VolunteerTag objects.
        """
        result = await session.execute(
            select(VolunteerTag)
            .where(VolunteerTag.campaign_id == campaign_id)
            .order_by(VolunteerTag.name)
        )
        return list(result.scalars().all())

    async def update_tag(
        self,
        session: AsyncSession,
        tag_id: uuid.UUID,
        name: str,
    ) -> VolunteerTag:
        """Rename a campaign-scoped volunteer tag.

        Args:
            session: Async database session.
            tag_id: Tag UUID.
            name: New tag name.

        Returns:
            The updated VolunteerTag.

        Raises:
            ValueError: If tag not found.
        """
        result = await session.execute(
            select(VolunteerTag).where(VolunteerTag.id == tag_id)
        )
        tag = result.scalar_one_or_none()
        if tag is None:
            msg = f"Volunteer tag {tag_id} not found"
            raise ValueError(msg)

        tag.name = name
        return tag

    async def delete_tag(
        self,
        session: AsyncSession,
        tag_id: uuid.UUID,
    ) -> None:
        """Delete a campaign-scoped volunteer tag and its member associations.

        Args:
            session: Async database session.
            tag_id: Tag UUID.

        Raises:
            ValueError: If tag not found.
        """
        result = await session.execute(
            select(VolunteerTag).where(VolunteerTag.id == tag_id)
        )
        tag = result.scalar_one_or_none()
        if tag is None:
            msg = f"Volunteer tag {tag_id} not found"
            raise ValueError(msg)

        # Cascade: remove all volunteer-tag member associations first
        await session.execute(
            delete(VolunteerTagMember).where(VolunteerTagMember.tag_id == tag_id)
        )
        await session.delete(tag)

    async def add_tag(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        tag_id: uuid.UUID,
    ) -> VolunteerTagMember:
        """Add a tag to a volunteer.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.
            tag_id: Tag UUID.

        Returns:
            The created VolunteerTagMember.
        """
        tag_member = VolunteerTagMember(
            volunteer_id=volunteer_id,
            tag_id=tag_id,
        )
        session.add(tag_member)
        return tag_member

    async def remove_tag(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        tag_id: uuid.UUID,
    ) -> None:
        """Remove a tag from a volunteer.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.
            tag_id: Tag UUID.

        Raises:
            ValueError: If tag assignment not found.
        """
        result = await session.execute(
            select(VolunteerTagMember).where(
                VolunteerTagMember.volunteer_id == volunteer_id,
                VolunteerTagMember.tag_id == tag_id,
            )
        )
        tag_member = result.scalar_one_or_none()
        if tag_member is None:
            msg = f"Tag {tag_id} not assigned to volunteer {volunteer_id}"
            raise ValueError(msg)
        await session.delete(tag_member)

    # -------------------------------------------------------------------
    # Availability
    # -------------------------------------------------------------------

    async def add_availability(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        data: AvailabilityCreate,
    ) -> VolunteerAvailability:
        """Add an availability time slot for a volunteer.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.
            data: AvailabilityCreate with start_at and end_at.

        Returns:
            The created VolunteerAvailability.

        Raises:
            ValueError: If end_at is not after start_at.
        """
        if data.end_at <= data.start_at:
            msg = "end_at must be after start_at"
            raise ValueError(msg)

        availability = VolunteerAvailability(
            id=uuid.uuid4(),
            volunteer_id=volunteer_id,
            start_at=data.start_at,
            end_at=data.end_at,
        )
        session.add(availability)
        return availability

    async def delete_availability(
        self,
        session: AsyncSession,
        availability_id: uuid.UUID,
    ) -> None:
        """Remove an availability slot.

        Args:
            session: Async database session.
            availability_id: Availability UUID.

        Raises:
            ValueError: If availability not found.
        """
        result = await session.execute(
            select(VolunteerAvailability).where(
                VolunteerAvailability.id == availability_id
            )
        )
        availability = result.scalar_one_or_none()
        if availability is None:
            msg = f"Availability {availability_id} not found"
            raise ValueError(msg)
        await session.delete(availability)

    async def list_availability(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
    ) -> list[VolunteerAvailability]:
        """List all availability slots for a volunteer.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.

        Returns:
            List of VolunteerAvailability objects.
        """
        result = await session.execute(
            select(VolunteerAvailability)
            .where(VolunteerAvailability.volunteer_id == volunteer_id)
            .order_by(VolunteerAvailability.start_at)
        )
        return list(result.scalars().all())

    async def find_available_volunteers(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
    ) -> list[Volunteer]:
        """Find active volunteers available during the given time window.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            start_at: Window start time.
            end_at: Window end time.

        Returns:
            List of Volunteer objects with covering availability.
        """
        stmt = (
            select(Volunteer)
            .join(
                VolunteerAvailability,
                VolunteerAvailability.volunteer_id == Volunteer.id,
            )
            .where(
                Volunteer.campaign_id == campaign_id,
                Volunteer.status == VolunteerStatus.ACTIVE,
                VolunteerAvailability.start_at <= start_at,
                VolunteerAvailability.end_at >= end_at,
            )
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())
