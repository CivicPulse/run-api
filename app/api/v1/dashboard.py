"""Dashboard API endpoints -- operational metrics for all domains."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.dashboard import (
    CallerBreakdown,
    CallListBreakdown,
    CanvasserBreakdown,
    CanvassingSummary,
    MyStatsResponse,
    OverviewResponse,
    PhoneBankingSummary,
    SessionBreakdown,
    ShiftBreakdown,
    TurfBreakdown,
    VolunteerBreakdown,
    VolunteerSummary,
    apply_date_filter,
)
from app.services.dashboard import (
    CanvassingDashboardService,
    PhoneBankingDashboardService,
    VolunteerDashboardService,
)

router = APIRouter()

_canvassing = CanvassingDashboardService()
_phone_banking = PhoneBankingDashboardService()
_volunteer = VolunteerDashboardService()


# ---------------------------------------------------------------------------
# Pagination helper
# ---------------------------------------------------------------------------


def _paginate(items: list, limit: int, id_field: str) -> PaginatedResponse:
    """Build a PaginatedResponse with cursor from the last item's ID field."""
    has_more = len(items) == limit
    next_cursor = str(getattr(items[-1], id_field)) if has_more and items else None
    return PaginatedResponse(
        items=items,
        pagination=PaginationResponse(next_cursor=next_cursor, has_more=has_more),
    )


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/dashboard/overview",
    response_model=OverviewResponse,
)
async def get_overview(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Combined dashboard overview across all domains.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    canvassing = await _canvassing.get_summary(db, campaign_id, start_date, end_date)
    phone_banking = await _phone_banking.get_summary(
        db,
        campaign_id,
        start_date,
        end_date,
    )
    volunteers = await _volunteer.get_summary(db, campaign_id, start_date, end_date)

    return OverviewResponse(
        canvassing=canvassing,
        phone_banking=phone_banking,
        volunteers=volunteers,
    )


# ---------------------------------------------------------------------------
# My Stats
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/dashboard/my-stats",
    response_model=MyStatsResponse,
)
async def get_my_stats(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Personal activity stats for the authenticated user.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    from app.models.shift import Shift, ShiftVolunteer, SignupStatus
    from app.models.volunteer import Volunteer
    from app.models.voter_interaction import InteractionType, VoterInteraction

    # Door knocks by this user
    dk_q = (
        select(func.count().label("doors_knocked"))
        .where(VoterInteraction.campaign_id == campaign_id)
        .where(VoterInteraction.type == InteractionType.DOOR_KNOCK)
        .where(VoterInteraction.created_by == user.id)
    )
    dk_q = apply_date_filter(dk_q, VoterInteraction.created_at, start_date, end_date)
    dk_result = (await db.execute(dk_q)).mappings().one()

    # Phone calls by this user
    pc_q = (
        select(func.count().label("calls_made"))
        .where(VoterInteraction.campaign_id == campaign_id)
        .where(VoterInteraction.type == InteractionType.PHONE_CALL)
        .where(VoterInteraction.created_by == user.id)
    )
    pc_q = apply_date_filter(pc_q, VoterInteraction.created_at, start_date, end_date)
    pc_result = (await db.execute(pc_q)).mappings().one()

    # Shifts completed and hours worked
    hours_expr = func.coalesce(
        ShiftVolunteer.adjusted_hours,
        extract("epoch", ShiftVolunteer.check_out_at - ShiftVolunteer.check_in_at)
        / 3600.0,
    )
    shift_q = (
        select(
            func.count().label("shifts_completed"),
            func.coalesce(func.sum(hours_expr), 0.0).label("hours_worked"),
        )
        .select_from(ShiftVolunteer)
        .join(Shift, Shift.id == ShiftVolunteer.shift_id)
        .join(Volunteer, Volunteer.id == ShiftVolunteer.volunteer_id)
        .where(Volunteer.user_id == user.id)
        .where(Shift.campaign_id == campaign_id)
        .where(ShiftVolunteer.status == SignupStatus.CHECKED_OUT)
    )
    shift_q = apply_date_filter(
        shift_q,
        ShiftVolunteer.check_in_at,
        start_date,
        end_date,
    )
    shift_result = (await db.execute(shift_q)).mappings().one()

    return MyStatsResponse(
        doors_knocked=dk_result["doors_knocked"],
        calls_made=pc_result["calls_made"],
        shifts_completed=shift_result["shifts_completed"],
        hours_worked=round(float(shift_result["hours_worked"]), 2),
    )


# ---------------------------------------------------------------------------
# Canvassing
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/dashboard/canvassing",
    response_model=CanvassingSummary,
)
async def get_canvassing_summary(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Campaign-wide canvassing totals with outcome breakdown.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _canvassing.get_summary(db, campaign_id, start_date, end_date)


@router.get(
    "/campaigns/{campaign_id}/dashboard/canvassing/canvassers",
    response_model=list[CanvasserBreakdown],
)
async def get_canvassing_canvassers(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """All canvasser stats as a flat list (no pagination).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _canvassing.get_by_canvasser(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor=None,
        limit=100,
    )


@router.get(
    "/campaigns/{campaign_id}/dashboard/canvassing/turfs",
    response_model=list[TurfBreakdown],
)
async def get_canvassing_turfs(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """All turf stats as a flat list (no pagination).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _canvassing.get_by_turf(
        db,
        campaign_id,
        start_date,
        end_date,
        turf_id=None,
        cursor=None,
        limit=100,
    )


@router.get(
    "/campaigns/{campaign_id}/dashboard/canvassing/by-turf",
    response_model=PaginatedResponse[TurfBreakdown],
)
async def get_canvassing_by_turf(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    turf_id: uuid.UUID | None = None,
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-turf canvassing stats with cursor pagination.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _canvassing.get_by_turf(
        db,
        campaign_id,
        start_date,
        end_date,
        turf_id,
        cursor,
        limit,
    )
    return _paginate(items, limit, "turf_id")


@router.get(
    "/campaigns/{campaign_id}/dashboard/canvassing/by-canvasser",
    response_model=PaginatedResponse[CanvasserBreakdown],
)
async def get_canvassing_by_canvasser(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-canvasser canvassing stats with cursor pagination.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _canvassing.get_by_canvasser(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor,
        limit,
    )
    return _paginate(items, limit, "user_id")


# ---------------------------------------------------------------------------
# Phone Banking
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/dashboard/phone-banking",
    response_model=PhoneBankingSummary,
)
async def get_phone_banking_summary(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Campaign-wide phone banking totals.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _phone_banking.get_summary(db, campaign_id, start_date, end_date)


@router.get(
    "/campaigns/{campaign_id}/dashboard/phone-banking/sessions",
    response_model=list[SessionBreakdown],
)
async def get_phone_banking_sessions(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """All session stats as a flat list (no pagination).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _phone_banking.get_by_session(
        db,
        campaign_id,
        start_date,
        end_date,
        session_id=None,
        cursor=None,
        limit=100,
    )


@router.get(
    "/campaigns/{campaign_id}/dashboard/phone-banking/callers",
    response_model=list[CallerBreakdown],
)
async def get_phone_banking_callers(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """All caller stats as a flat list (no pagination).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _phone_banking.get_by_caller(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor=None,
        limit=100,
    )


@router.get(
    "/campaigns/{campaign_id}/dashboard/phone-banking/by-session",
    response_model=PaginatedResponse[SessionBreakdown],
)
async def get_phone_banking_by_session(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    session_id: uuid.UUID | None = None,
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-session phone banking stats.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _phone_banking.get_by_session(
        db,
        campaign_id,
        start_date,
        end_date,
        session_id,
        cursor,
        limit,
    )
    return _paginate(items, limit, "session_id")


@router.get(
    "/campaigns/{campaign_id}/dashboard/phone-banking/by-caller",
    response_model=PaginatedResponse[CallerBreakdown],
)
async def get_phone_banking_by_caller(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-caller phone banking stats.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _phone_banking.get_by_caller(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor,
        limit,
    )
    return _paginate(items, limit, "user_id")


@router.get(
    "/campaigns/{campaign_id}/dashboard/phone-banking/by-call-list",
    response_model=PaginatedResponse[CallListBreakdown],
)
async def get_phone_banking_by_call_list(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-call-list completion stats.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _phone_banking.get_by_call_list(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor,
        limit,
    )
    return _paginate(items, limit, "call_list_id")


# ---------------------------------------------------------------------------
# Volunteers
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/dashboard/volunteers",
    response_model=VolunteerSummary,
)
async def get_volunteer_summary(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Campaign-wide volunteer totals.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _volunteer.get_summary(db, campaign_id, start_date, end_date)


@router.get(
    "/campaigns/{campaign_id}/dashboard/volunteers/volunteers",
    response_model=list[VolunteerBreakdown],
)
async def get_volunteers_list(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """All volunteer stats as a flat list (no pagination).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _volunteer.get_by_volunteer(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor=None,
        limit=100,
    )


@router.get(
    "/campaigns/{campaign_id}/dashboard/volunteers/shifts",
    response_model=list[ShiftBreakdown],
)
async def get_volunteers_shifts(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """All shift stats as a flat list (no pagination).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    return await _volunteer.get_by_shift(
        db,
        campaign_id,
        start_date,
        end_date,
        shift_type=None,
        cursor=None,
        limit=100,
    )


@router.get(
    "/campaigns/{campaign_id}/dashboard/volunteers/by-volunteer",
    response_model=PaginatedResponse[VolunteerBreakdown],
)
async def get_volunteers_by_volunteer(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-volunteer shift and hours stats.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _volunteer.get_by_volunteer(
        db,
        campaign_id,
        start_date,
        end_date,
        cursor,
        limit,
    )
    return _paginate(items, limit, "volunteer_id")


@router.get(
    "/campaigns/{campaign_id}/dashboard/volunteers/by-shift",
    response_model=PaginatedResponse[ShiftBreakdown],
)
async def get_volunteers_by_shift(
    campaign_id: uuid.UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    shift_type: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Per-shift fill and completion stats.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))
    items = await _volunteer.get_by_shift(
        db,
        campaign_id,
        start_date,
        end_date,
        shift_type,
        cursor,
        limit,
    )
    return _paginate(items, limit, "shift_id")
