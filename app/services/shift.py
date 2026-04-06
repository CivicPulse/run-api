"""Shift service -- CRUD, signup/cancel, waitlist, check-in/out, hours tracking."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.time import utcnow
from app.models.shift import (
    Shift,
    ShiftStatus,
    ShiftType,
    ShiftVolunteer,
    SignupStatus,
)
from app.models.volunteer import Volunteer, VolunteerStatus

if TYPE_CHECKING:
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.shift import ShiftCreate, ShiftUpdate

logger = logging.getLogger(__name__)

# Valid shift status transitions
_VALID_TRANSITIONS: dict[str, set[str]] = {
    ShiftStatus.SCHEDULED: {ShiftStatus.ACTIVE, ShiftStatus.CANCELLED},
    ShiftStatus.ACTIVE: {ShiftStatus.COMPLETED},
    ShiftStatus.COMPLETED: set(),
    ShiftStatus.CANCELLED: set(),
}


class ShiftService:
    """Shift CRUD, signup/cancel, waitlist, check-in/out, and hours tracking."""

    # -------------------------------------------------------------------
    # Shift CRUD
    # -------------------------------------------------------------------

    async def create_shift(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: ShiftCreate,
        created_by: str,
    ) -> Shift:
        """Create a shift.

        Logs a warning if canvassing shift has no turf_id or
        phone banking shift has no phone_bank_session_id.

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            data: ShiftCreate schema.
            created_by: User ID of the creator.

        Returns:
            The created Shift.
        """
        if data.type == ShiftType.CANVASSING and data.turf_id is None:
            logger.warning("Creating canvassing shift without turf_id")
        if data.type == ShiftType.PHONE_BANKING and data.phone_bank_session_id is None:
            logger.warning("Creating phone banking shift without phone_bank_session_id")

        now = utcnow()
        shift = Shift(
            id=uuid.uuid4(),
            campaign_id=campaign_id,
            name=data.name,
            description=data.description,
            type=data.type,
            status=ShiftStatus.SCHEDULED,
            start_at=data.start_at,
            end_at=data.end_at,
            max_volunteers=data.max_volunteers,
            location_name=data.location_name,
            street=data.street,
            city=data.city,
            state=data.state,
            zip_code=data.zip_code,
            latitude=data.latitude,
            longitude=data.longitude,
            turf_id=data.turf_id,
            phone_bank_session_id=data.phone_bank_session_id,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        session.add(shift)
        return shift

    async def get_shift(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
    ) -> dict | None:
        """Fetch a shift with signed_up_count and waitlist_count.

        Args:
            session: Async database session.
            shift_id: Shift UUID.

        Returns:
            Dict with shift, signed_up_count, waitlist_count, or None.
        """
        result = await session.execute(select(Shift).where(Shift.id == shift_id))
        shift = result.scalar_one_or_none()
        if shift is None:
            return None

        # Compute signup counts
        count_result = await session.execute(
            select(
                func.count(ShiftVolunteer.id)
                .filter(ShiftVolunteer.status == SignupStatus.SIGNED_UP)
                .label("signed_up_count"),
                func.count(ShiftVolunteer.id)
                .filter(ShiftVolunteer.status == SignupStatus.WAITLISTED)
                .label("waitlist_count"),
            ).where(ShiftVolunteer.shift_id == shift_id)
        )
        row = count_result.one()

        return {
            "shift": shift,
            "signed_up_count": row.signed_up_count,
            "waitlist_count": row.waitlist_count,
        }

    async def _get_shift_raw(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
    ) -> Shift | None:
        """Fetch shift model directly (no counts).

        Acquires a pessimistic row-level lock (SELECT ... FOR UPDATE) so that
        concurrent write paths (signup_volunteer, update_status, etc.) cannot
        race on capacity/status. Matches the pattern used by
        _promote_from_waitlist.
        """
        result = await session.execute(
            select(Shift).where(Shift.id == shift_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def update_shift(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        data: ShiftUpdate,
    ) -> Shift:
        """Partial update. Only allowed when status is SCHEDULED.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            data: ShiftUpdate schema.

        Returns:
            The updated Shift.

        Raises:
            ValueError: If shift not found or not in SCHEDULED status.
        """
        shift = await self._get_shift_raw(session, shift_id)
        if shift is None:
            msg = f"Shift {shift_id} not found"
            raise ValueError(msg)

        if shift.status != ShiftStatus.SCHEDULED:
            msg = (
                "Shift can only be updated when SCHEDULED,"
                f" current status: {shift.status}"
            )
            raise ValueError(msg)

        update_fields = data.model_dump(exclude_unset=True)
        update_fields.pop("status", None)  # Status changes go through update_status

        for key, value in update_fields.items():
            setattr(shift, key, value)

        shift.updated_at = utcnow()
        return shift

    async def update_status(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        new_status: str,
    ) -> Shift:
        """Update shift status with transition enforcement.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            new_status: Target status string.

        Returns:
            The updated Shift.

        Raises:
            ValueError: If shift not found or invalid transition.
        """
        shift = await self._get_shift_raw(session, shift_id)
        if shift is None:
            msg = f"Shift {shift_id} not found"
            raise ValueError(msg)

        valid_targets = _VALID_TRANSITIONS.get(shift.status, set())
        if new_status not in valid_targets:
            msg = f"Invalid status transition from {shift.status} to {new_status}"
            raise ValueError(msg)

        shift.status = new_status
        shift.updated_at = utcnow()
        return shift

    async def list_shifts(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        *,
        status: str | None = None,
        shift_type: str | None = None,
        start_after: datetime | None = None,
        start_before: datetime | None = None,
        cursor: tuple[datetime, uuid.UUID] | None = None,
        limit: int = 50,
    ) -> list[Shift]:
        """List shifts with filters and cursor pagination on (start_at, id).

        Args:
            session: Async database session.
            campaign_id: Campaign UUID.
            status: Filter by shift status.
            shift_type: Filter by shift type.
            start_after: Filter shifts starting after this time.
            start_before: Filter shifts starting before this time.
            cursor: (start_at, id) tuple for pagination.
            limit: Max results.

        Returns:
            List of Shift objects.
        """
        stmt = select(Shift).where(Shift.campaign_id == campaign_id)

        if status is not None:
            stmt = stmt.where(Shift.status == status)

        if shift_type is not None:
            stmt = stmt.where(Shift.type == shift_type)

        if start_after is not None:
            stmt = stmt.where(Shift.start_at >= start_after)

        if start_before is not None:
            stmt = stmt.where(Shift.start_at <= start_before)

        if cursor:
            cursor_time, cursor_id = cursor
            stmt = stmt.where((Shift.start_at, Shift.id) > (cursor_time, cursor_id))

        stmt = stmt.order_by(Shift.start_at, Shift.id).limit(limit)

        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def delete_shift(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
    ) -> None:
        """Delete a shift. Only if SCHEDULED and no checked-in volunteers.

        Args:
            session: Async database session.
            shift_id: Shift UUID.

        Raises:
            ValueError: If shift not found, not SCHEDULED, or has checked-in volunteers.
        """
        shift = await self._get_shift_raw(session, shift_id)
        if shift is None:
            msg = f"Shift {shift_id} not found"
            raise ValueError(msg)

        if shift.status != ShiftStatus.SCHEDULED:
            msg = f"Cannot delete shift with status {shift.status}"
            raise ValueError(msg)

        # Check for checked-in volunteers
        checked_in_result = await session.execute(
            select(func.count(ShiftVolunteer.id)).where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.status == SignupStatus.CHECKED_IN,
            )
        )
        if checked_in_result.scalar() > 0:
            msg = "Cannot delete shift with checked-in volunteers"
            raise ValueError(msg)

        await session.delete(shift)

    # -------------------------------------------------------------------
    # Signup / Cancel
    # -------------------------------------------------------------------

    async def signup_volunteer(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
    ) -> ShiftVolunteer:
        """Volunteer self-signup for a shift.

        1. Verify volunteer status is ACTIVE.
        2. If field shift, verify emergency contact.
        3. Check not already signed up.
        4. Assign SIGNED_UP or WAITLISTED based on capacity.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            volunteer_id: Volunteer UUID.

        Returns:
            The created ShiftVolunteer.

        Raises:
            ValueError: If volunteer not active, missing emergency contact,
                        already signed up, or shift not found.
        """
        shift = await self._get_shift_raw(session, shift_id)
        if shift is None:
            msg = f"Shift {shift_id} not found"
            raise ValueError(msg)

        volunteer = await self._get_volunteer(session, volunteer_id, shift.campaign_id)

        # Gate: volunteer must be ACTIVE
        if volunteer.status != VolunteerStatus.ACTIVE:
            msg = (
                "Volunteer must be ACTIVE to sign up,"
                f" current status: {volunteer.status}"
            )
            raise ValueError(msg)

        # Gate: emergency contact for field shifts
        self._enforce_emergency_contact(volunteer, shift)

        # Check not already signed up
        existing = await session.execute(
            select(ShiftVolunteer).where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.volunteer_id == volunteer_id,
                ShiftVolunteer.status != SignupStatus.CANCELLED,
            )
        )
        if existing.scalar_one_or_none() is not None:
            msg = f"Volunteer {volunteer_id} already signed up for shift {shift_id}"
            raise ValueError(msg)

        # Count current signed-up volunteers
        count_result = await session.execute(
            select(func.count(ShiftVolunteer.id)).where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.status == SignupStatus.SIGNED_UP,
            )
        )
        signed_up_count = count_result.scalar()

        now = utcnow()
        if signed_up_count < shift.max_volunteers:
            signup_status = SignupStatus.SIGNED_UP
            waitlist_position = None
        else:
            signup_status = SignupStatus.WAITLISTED
            # Get max waitlist position
            max_pos_result = await session.execute(
                select(
                    func.coalesce(func.max(ShiftVolunteer.waitlist_position), 0)
                ).where(
                    ShiftVolunteer.shift_id == shift_id,
                    ShiftVolunteer.status == SignupStatus.WAITLISTED,
                )
            )
            waitlist_position = max_pos_result.scalar() + 1

        shift_volunteer = ShiftVolunteer(
            id=uuid.uuid4(),
            shift_id=shift_id,
            volunteer_id=volunteer_id,
            status=signup_status,
            waitlist_position=waitlist_position,
            signed_up_at=now,
        )
        session.add(shift_volunteer)
        return shift_volunteer

    async def cancel_signup(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
        requester_id: str,
        requester_role: int,
    ) -> ShiftVolunteer:
        """Cancel a volunteer's signup.

        Self-cancel only allowed before shift.start_at.
        Manager+ can cancel any time.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            volunteer_id: Volunteer UUID.
            requester_id: ID of user making the request.
            requester_role: CampaignRole int value of requester.

        Returns:
            The updated ShiftVolunteer.

        Raises:
            ValueError: If signup not found or self-cancel after start.
        """
        from app.core.security import CampaignRole

        shift = await self._get_shift_raw(session, shift_id)
        if shift is None:
            msg = f"Shift {shift_id} not found"
            raise ValueError(msg)

        shift_vol = await self._get_shift_volunteer(session, shift_id, volunteer_id)

        # Check if volunteer resolves to requester (self-cancel check)
        volunteer = await self._get_volunteer(session, volunteer_id, shift.campaign_id)
        is_self = volunteer.user_id == requester_id

        if (
            is_self
            and requester_role < CampaignRole.MANAGER
            and shift.start_at <= utcnow()
        ):
            msg = "Cannot self-cancel after shift has started"
            raise ValueError(msg)

        was_signed_up = shift_vol.status == SignupStatus.SIGNED_UP
        shift_vol.status = SignupStatus.CANCELLED
        shift_vol.waitlist_position = None

        # Auto-promote from waitlist if a signed-up volunteer cancelled
        if was_signed_up:
            await self._promote_from_waitlist(session, shift_id)

        return shift_vol

    async def manager_assign(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
    ) -> ShiftVolunteer:
        """Manager assigns volunteer (bypasses capacity check).

        Still enforces emergency contact for field shifts and active status.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            volunteer_id: Volunteer UUID.

        Returns:
            The created ShiftVolunteer.

        Raises:
            ValueError: If volunteer not active or missing emergency contact.
        """
        shift = await self._get_shift_raw(session, shift_id)
        if shift is None:
            msg = f"Shift {shift_id} not found"
            raise ValueError(msg)

        volunteer = await self._get_volunteer(session, volunteer_id, shift.campaign_id)

        if volunteer.status != VolunteerStatus.ACTIVE:
            msg = f"Volunteer must be ACTIVE, current status: {volunteer.status}"
            raise ValueError(msg)

        self._enforce_emergency_contact(volunteer, shift)

        # Check not already signed up
        existing = await session.execute(
            select(ShiftVolunteer).where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.volunteer_id == volunteer_id,
                ShiftVolunteer.status != SignupStatus.CANCELLED,
            )
        )
        if existing.scalar_one_or_none() is not None:
            msg = f"Volunteer {volunteer_id} already assigned to shift {shift_id}"
            raise ValueError(msg)

        now = utcnow()
        shift_volunteer = ShiftVolunteer(
            id=uuid.uuid4(),
            shift_id=shift_id,
            volunteer_id=volunteer_id,
            status=SignupStatus.SIGNED_UP,
            signed_up_at=now,
        )
        session.add(shift_volunteer)
        return shift_volunteer

    async def _promote_from_waitlist(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
    ) -> ShiftVolunteer | None:
        """Promote next waitlisted volunteer to signed_up status.

        Uses SELECT ... FOR UPDATE to prevent race conditions.

        Args:
            session: Async database session.
            shift_id: Shift UUID.

        Returns:
            The promoted ShiftVolunteer or None if no waitlist.
        """
        result = await session.execute(
            select(ShiftVolunteer)
            .where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.status == SignupStatus.WAITLISTED,
            )
            .order_by(ShiftVolunteer.waitlist_position)
            .limit(1)
            .with_for_update()
        )
        next_vol = result.scalar_one_or_none()
        if next_vol:
            next_vol.status = SignupStatus.SIGNED_UP
            next_vol.waitlist_position = None
        return next_vol

    # -------------------------------------------------------------------
    # Check-in / Check-out
    # -------------------------------------------------------------------

    async def check_in(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
    ) -> ShiftVolunteer:
        """Check in a volunteer to a shift.

        Side effects:
        - Canvassing shift: creates WalkListCanvasser for the turf's walk list
        - Phone banking shift: creates SessionCaller for the linked session

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            volunteer_id: Volunteer UUID.

        Returns:
            The updated ShiftVolunteer.

        Raises:
            ValueError: If signup not found.
        """
        shift_vol = await self._get_shift_volunteer(session, shift_id, volunteer_id)
        shift_vol.check_in_at = utcnow()
        shift_vol.status = SignupStatus.CHECKED_IN

        shift = await self._get_shift_raw(session, shift_id)
        volunteer = await self._get_volunteer(session, volunteer_id, shift.campaign_id)

        # Side effect: canvassing shift -> WalkListCanvasser
        if shift.type == ShiftType.CANVASSING and shift.turf_id:
            if volunteer.user_id:
                from app.models.walk_list import WalkList, WalkListCanvasser

                walk_list_result = await session.execute(
                    select(WalkList.id)
                    .where(WalkList.turf_id == shift.turf_id)
                    .order_by(WalkList.created_at.desc())
                    .limit(1)
                )
                walk_list_id = walk_list_result.scalar_one_or_none()
                if walk_list_id:
                    canvasser = WalkListCanvasser(
                        walk_list_id=walk_list_id,
                        user_id=volunteer.user_id,
                    )
                    session.add(canvasser)
                else:
                    logger.warning(
                        "No walk list found for turf %s on shift %s",
                        shift.turf_id,
                        shift_id,
                    )
            else:
                logger.warning(
                    "Walk-in volunteer %s has no user_id; skipping WalkListCanvasser",
                    volunteer_id,
                )

        # Side effect: phone banking shift -> SessionCaller
        if shift.type == ShiftType.PHONE_BANKING and shift.phone_bank_session_id:
            if volunteer.user_id:
                from sqlalchemy.dialects.postgresql import insert as pg_insert

                from app.models.phone_bank import SessionCaller

                now = utcnow()
                stmt = (
                    pg_insert(SessionCaller)
                    .values(
                        id=uuid.uuid4(),
                        session_id=shift.phone_bank_session_id,
                        user_id=volunteer.user_id,
                        check_in_at=now,
                        check_out_at=None,
                        created_at=now,
                    )
                    .on_conflict_do_update(
                        index_elements=["session_id", "user_id"],
                        set_={"check_in_at": now, "check_out_at": None},
                    )
                )
                await session.execute(stmt)
            else:
                logger.warning(
                    "Walk-in volunteer %s has no user_id; skipping SessionCaller",
                    volunteer_id,
                )

        return shift_vol

    async def check_out(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
    ) -> ShiftVolunteer:
        """Check out a volunteer from a shift.

        If phone banking shift and SessionCaller exists, also sets
        SessionCaller.check_out_at.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            volunteer_id: Volunteer UUID.

        Returns:
            The updated ShiftVolunteer.
        """
        shift_vol = await self._get_shift_volunteer(session, shift_id, volunteer_id)
        now = utcnow()
        shift_vol.check_out_at = now
        shift_vol.status = SignupStatus.CHECKED_OUT

        shift = await self._get_shift_raw(session, shift_id)
        volunteer = await self._get_volunteer(session, volunteer_id, shift.campaign_id)

        # Update SessionCaller check_out_at if phone banking
        if (
            shift.type == ShiftType.PHONE_BANKING
            and shift.phone_bank_session_id
            and volunteer.user_id
        ):
            from app.models.phone_bank import SessionCaller

            caller_result = await session.execute(
                select(SessionCaller).where(
                    SessionCaller.session_id == shift.phone_bank_session_id,
                    SessionCaller.user_id == volunteer.user_id,
                )
            )
            caller = caller_result.scalar_one_or_none()
            if caller:
                caller.check_out_at = now

        return shift_vol

    # -------------------------------------------------------------------
    # Hours tracking
    # -------------------------------------------------------------------

    async def adjust_hours(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
        adjusted_hours: float,
        reason: str,
        adjusted_by: str,
    ) -> ShiftVolunteer:
        """Manager adjusts volunteer hours with audit trail.

        Original check-in/out timestamps are preserved.

        Args:
            session: Async database session.
            shift_id: Shift UUID.
            volunteer_id: Volunteer UUID.
            adjusted_hours: New hours value.
            reason: Adjustment reason.
            adjusted_by: User ID of manager making adjustment.

        Returns:
            The updated ShiftVolunteer.
        """
        shift_vol = await self._get_shift_volunteer(session, shift_id, volunteer_id)
        shift_vol.adjusted_hours = adjusted_hours
        shift_vol.adjustment_reason = reason
        shift_vol.adjusted_by = adjusted_by
        shift_vol.adjusted_at = utcnow()
        return shift_vol

    async def get_volunteer_hours(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> dict:
        """Aggregate hours for a volunteer across all shifts.

        Uses adjusted_hours when available, otherwise computes from
        check_in/check_out timestamps.

        Args:
            session: Async database session.
            volunteer_id: Volunteer UUID.
            campaign_id: Campaign UUID.

        Returns:
            Dict with total_hours, shifts_worked, and per-shift details.
        """
        volunteer = await self._get_volunteer(session, volunteer_id, campaign_id)

        # Get completed shifts (checked out or with adjusted hours)
        stmt = (
            select(
                ShiftVolunteer.id,
                ShiftVolunteer.shift_id,
                ShiftVolunteer.check_in_at,
                ShiftVolunteer.check_out_at,
                ShiftVolunteer.adjusted_hours,
                Shift.name.label("shift_name"),
            )
            .join(Shift, Shift.id == ShiftVolunteer.shift_id)
            .where(
                ShiftVolunteer.volunteer_id == volunteer_id,
                Shift.campaign_id == campaign_id,
                ShiftVolunteer.check_in_at.isnot(None),
            )
        )
        result = await session.execute(stmt)
        rows = result.all()

        total_hours = 0.0
        shifts_worked = 0
        shifts = []

        for row in rows:
            if row.adjusted_hours is not None:
                hours = row.adjusted_hours
            elif row.check_out_at is not None:
                delta = row.check_out_at - row.check_in_at
                hours = delta.total_seconds() / 3600.0
            else:
                continue  # Still checked in, skip

            total_hours += hours
            shifts_worked += 1
            shifts.append(
                {
                    "shift_id": row.shift_id,
                    "shift_name": row.shift_name,
                    "hours": round(hours, 2),
                    "check_in_at": row.check_in_at,
                    "check_out_at": row.check_out_at,
                }
            )

        return {
            "volunteer_id": volunteer.id,
            "campaign_id": volunteer.campaign_id,
            "total_hours": round(total_hours, 2),
            "shifts_worked": shifts_worked,
            "shifts": shifts,
        }

    async def list_shift_volunteers(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
    ) -> list[ShiftVolunteer]:
        """List all volunteers for a shift.

        Args:
            session: Async database session.
            shift_id: Shift UUID.

        Returns:
            List of ShiftVolunteer objects.
        """
        result = await session.execute(
            select(ShiftVolunteer)
            .where(ShiftVolunteer.shift_id == shift_id)
            .order_by(ShiftVolunteer.signed_up_at)
        )
        return list(result.scalars().all())

    # -------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------

    async def _get_volunteer(
        self,
        session: AsyncSession,
        volunteer_id: uuid.UUID,
        campaign_id: uuid.UUID | None = None,
    ) -> Volunteer:
        """Get volunteer or raise ValueError."""
        stmt = select(Volunteer).where(Volunteer.id == volunteer_id)
        if campaign_id is not None:
            stmt = stmt.where(Volunteer.campaign_id == campaign_id)
        result = await session.execute(stmt)
        volunteer = result.scalar_one_or_none()
        if volunteer is None:
            msg = f"Volunteer {volunteer_id} not found"
            raise ValueError(msg)
        return volunteer

    async def _get_shift_volunteer(
        self,
        session: AsyncSession,
        shift_id: uuid.UUID,
        volunteer_id: uuid.UUID,
    ) -> ShiftVolunteer:
        """Get shift-volunteer record or raise ValueError."""
        result = await session.execute(
            select(ShiftVolunteer).where(
                ShiftVolunteer.shift_id == shift_id,
                ShiftVolunteer.volunteer_id == volunteer_id,
                ShiftVolunteer.status != SignupStatus.CANCELLED,
            )
        )
        shift_vol = result.scalar_one_or_none()
        if shift_vol is None:
            msg = f"Volunteer {volunteer_id} not signed up for shift {shift_id}"
            raise ValueError(msg)
        return shift_vol

    @staticmethod
    def _enforce_emergency_contact(volunteer: Volunteer, shift: Shift) -> None:
        """Raise ValueError if field shift requires emergency contact."""
        if shift.type in (ShiftType.CANVASSING, ShiftType.PHONE_BANKING) and (
            not volunteer.emergency_contact_name
            or not volunteer.emergency_contact_phone
        ):
            msg = (
                "Emergency contact required for field shift signup "
                "(canvassing/phone banking)"
            )
            raise ValueError(msg)
