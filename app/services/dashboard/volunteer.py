"""Volunteer dashboard aggregation service."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import case, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shift import Shift, ShiftStatus, ShiftType, ShiftVolunteer, SignupStatus
from app.models.volunteer import Volunteer, VolunteerStatus
from app.schemas.dashboard import (
    ShiftBreakdown,
    VolunteerBreakdown,
    VolunteerSummary,
    apply_date_filter,
)


class VolunteerDashboardService:
    """Aggregation queries for volunteer dashboard metrics."""

    @staticmethod
    async def get_summary(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> VolunteerSummary:
        # Active and total volunteer counts (no date filter on volunteers themselves)
        vol_q = select(
            func.count().label("total_volunteers"),
            func.count(case((Volunteer.status == VolunteerStatus.ACTIVE, 1))).label(
                "active_volunteers"
            ),
        ).where(Volunteer.campaign_id == campaign_id)
        vol_result = (await session.execute(vol_q)).mappings().one()

        # Shift counts with date filter on start_at
        shift_q = select(
            func.count(case((Shift.status == ShiftStatus.SCHEDULED, 1))).label(
                "scheduled_shifts"
            ),
            func.count(case((Shift.status == ShiftStatus.COMPLETED, 1))).label(
                "completed_shifts"
            ),
        ).where(Shift.campaign_id == campaign_id)
        shift_q = apply_date_filter(shift_q, Shift.start_at, start_date, end_date)
        shift_result = (await session.execute(shift_q)).mappings().one()

        # Total hours from checked-out shift volunteers
        hours_expr = func.coalesce(
            ShiftVolunteer.adjusted_hours,
            extract("epoch", ShiftVolunteer.check_out_at - ShiftVolunteer.check_in_at)
            / 3600.0,
        )
        hours_q = (
            select(func.coalesce(func.sum(hours_expr), 0.0).label("total_hours"))
            .select_from(ShiftVolunteer)
            .where(ShiftVolunteer.check_out_at.is_not(None))
            .join(Shift, Shift.id == ShiftVolunteer.shift_id)
            .where(Shift.campaign_id == campaign_id)
        )
        hours_q = apply_date_filter(
            hours_q, ShiftVolunteer.check_in_at, start_date, end_date
        )
        hours_result = (await session.execute(hours_q)).mappings().one()

        return VolunteerSummary(
            active_volunteers=vol_result["active_volunteers"],
            total_volunteers=vol_result["total_volunteers"],
            scheduled_shifts=shift_result["scheduled_shifts"],
            completed_shifts=shift_result["completed_shifts"],
            total_hours=round(float(hours_result["total_hours"]), 2),
        )

    @staticmethod
    async def get_by_volunteer(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[VolunteerBreakdown]:
        hours_expr = func.coalesce(
            ShiftVolunteer.adjusted_hours,
            extract("epoch", ShiftVolunteer.check_out_at - ShiftVolunteer.check_in_at)
            / 3600.0,
        )

        q = (
            select(
                Volunteer.id.label("volunteer_id"),
                Volunteer.first_name,
                Volunteer.last_name,
                Volunteer.status,
                func.count(
                    case((ShiftVolunteer.status == SignupStatus.CHECKED_OUT, 1))
                ).label("shifts_completed"),
                func.coalesce(
                    func.sum(
                        case(
                            (ShiftVolunteer.check_out_at.is_not(None), hours_expr),
                            else_=0.0,
                        )
                    ),
                    0.0,
                ).label("hours_worked"),
            )
            .select_from(Volunteer)
            .outerjoin(ShiftVolunteer, ShiftVolunteer.volunteer_id == Volunteer.id)
            .outerjoin(Shift, Shift.id == ShiftVolunteer.shift_id)
            .where(Volunteer.campaign_id == campaign_id)
            .group_by(
                Volunteer.id,
                Volunteer.first_name,
                Volunteer.last_name,
                Volunteer.status,
            )
            .order_by(Volunteer.id)
            .limit(limit)
        )
        q = apply_date_filter(q, ShiftVolunteer.check_in_at, start_date, end_date)

        if cursor:
            q = q.where(Volunteer.id > uuid.UUID(cursor))

        rows = (await session.execute(q)).mappings().all()
        return [
            VolunteerBreakdown(
                volunteer_id=r["volunteer_id"],
                first_name=r["first_name"],
                last_name=r["last_name"],
                shifts_completed=r["shifts_completed"],
                hours_worked=round(float(r["hours_worked"]), 2),
                status=r["status"],
            )
            for r in rows
        ]

    @staticmethod
    async def get_by_shift(
        session: AsyncSession,
        campaign_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        shift_type: ShiftType | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> list[ShiftBreakdown]:
        q = (
            select(
                Shift.id.label("shift_id"),
                Shift.name.label("shift_name"),
                Shift.type,
                Shift.status,
                Shift.max_volunteers,
                func.count(
                    case((ShiftVolunteer.status != SignupStatus.CANCELLED, 1))
                ).label("signed_up"),
                func.count(
                    case(
                        (
                            ShiftVolunteer.status.in_(
                                [
                                    SignupStatus.CHECKED_IN,
                                    SignupStatus.CHECKED_OUT,
                                ]
                            ),
                            1,
                        )
                    )
                ).label("checked_in"),
                func.count(
                    case((ShiftVolunteer.status == SignupStatus.CHECKED_OUT, 1))
                ).label("checked_out"),
            )
            .select_from(Shift)
            .outerjoin(ShiftVolunteer, ShiftVolunteer.shift_id == Shift.id)
            .where(Shift.campaign_id == campaign_id)
            .group_by(
                Shift.id,
                Shift.name,
                Shift.type,
                Shift.status,
                Shift.max_volunteers,
            )
            .order_by(Shift.id)
            .limit(limit)
        )
        q = apply_date_filter(q, Shift.start_at, start_date, end_date)

        if shift_type is not None:
            q = q.where(Shift.type == shift_type)
        if cursor:
            q = q.where(Shift.id > uuid.UUID(cursor))

        rows = (await session.execute(q)).mappings().all()
        return [
            ShiftBreakdown(
                shift_id=r["shift_id"],
                shift_name=r["shift_name"],
                type=r["type"],
                status=r["status"],
                max_volunteers=r["max_volunteers"],
                signed_up=r["signed_up"],
                checked_in=r["checked_in"],
                checked_out=r["checked_out"],
            )
            for r in rows
        ]
