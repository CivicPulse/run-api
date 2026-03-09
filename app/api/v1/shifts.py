"""Shift management and signup API endpoints."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.shift import (
    CheckInResponse,
    HoursAdjustment,
    ShiftCreate,
    ShiftResponse,
    ShiftSignupResponse,
    ShiftUpdate,
    VolunteerHoursSummary,
)
from app.services.shift import ShiftService
from app.services.volunteer import VolunteerService

router = APIRouter()

_shift_service = ShiftService()
_volunteer_service = VolunteerService()


def _shift_to_response(shift_data: dict) -> ShiftResponse:
    """Convert shift dict (from get_shift) to ShiftResponse."""
    shift = shift_data["shift"]
    return ShiftResponse(
        id=shift.id,
        campaign_id=shift.campaign_id,
        name=shift.name,
        description=shift.description,
        type=shift.type,
        status=shift.status,
        start_at=shift.start_at,
        end_at=shift.end_at,
        max_volunteers=shift.max_volunteers,
        location_name=shift.location_name,
        street=shift.street,
        city=shift.city,
        state=shift.state,
        zip_code=shift.zip_code,
        latitude=shift.latitude,
        longitude=shift.longitude,
        turf_id=shift.turf_id,
        phone_bank_session_id=shift.phone_bank_session_id,
        created_by=shift.created_by,
        created_at=shift.created_at,
        updated_at=shift.updated_at,
        signed_up_count=shift_data["signed_up_count"],
        waitlist_count=shift_data["waitlist_count"],
    )


# ---------------------------------------------------------------------------
# Shift CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/shifts",
    response_model=ShiftResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_shift(
    campaign_id: uuid.UUID,
    body: ShiftCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create a shift.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    shift = await _shift_service.create_shift(db, campaign_id, body, user.id)
    await db.commit()
    # Re-fetch to get counts
    shift_data = await _shift_service.get_shift(db, shift.id)
    return _shift_to_response(shift_data)


@router.get(
    "/campaigns/{campaign_id}/shifts",
    response_model=list[ShiftResponse],
)
async def list_shifts(
    campaign_id: uuid.UUID,
    shift_status: str | None = Query(None, alias="status"),
    shift_type: str | None = Query(None, alias="type"),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List shifts with optional filters.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    shifts = await _shift_service.list_shifts(
        db, campaign_id, status=shift_status, shift_type=shift_type
    )
    # For list view, return with zero counts (or fetch per-shift)
    return [
        ShiftResponse.model_validate(
            {**{c.key: getattr(s, c.key) for c in s.__table__.columns},
             "signed_up_count": 0, "waitlist_count": 0}
        )
        for s in shifts
    ]


@router.get(
    "/campaigns/{campaign_id}/shifts/{shift_id}",
    response_model=ShiftResponse,
)
async def get_shift(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get shift detail with signup counts.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    shift_data = await _shift_service.get_shift(db, shift_id)
    if shift_data is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Shift Not Found",
            detail=f"Shift {shift_id} not found",
            type="shift-not-found",
        )
    return _shift_to_response(shift_data)


@router.patch(
    "/campaigns/{campaign_id}/shifts/{shift_id}",
    response_model=ShiftResponse,
)
async def update_shift(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    body: ShiftUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update shift fields (only when SCHEDULED).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _shift_service.update_shift(db, shift_id, body)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Shift Update Failed",
            detail=str(exc),
            type="shift-update-failed",
        )
    await db.commit()
    shift_data = await _shift_service.get_shift(db, shift_id)
    return _shift_to_response(shift_data)


@router.patch(
    "/campaigns/{campaign_id}/shifts/{shift_id}/status",
    response_model=ShiftResponse,
)
async def update_shift_status(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    body: dict,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update shift status.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _shift_service.update_status(db, shift_id, body["status"])
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Status Update Failed",
            detail=str(exc),
            type="status-update-failed",
        )
    await db.commit()
    shift_data = await _shift_service.get_shift(db, shift_id)
    return _shift_to_response(shift_data)


@router.delete(
    "/campaigns/{campaign_id}/shifts/{shift_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_shift(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a shift (scheduled only, no checked-in volunteers).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _shift_service.delete_shift(db, shift_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Delete Failed",
            detail=str(exc),
            type="shift-delete-failed",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Signup / Assignment
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/shifts/{shift_id}/signup",
    response_model=ShiftSignupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup_for_shift(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Volunteer self-signup for a shift.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context
    from sqlalchemy import select as sa_select

    from app.models.volunteer import Volunteer

    await set_campaign_context(db, str(campaign_id))

    # Resolve volunteer from user_id
    vol_result = await db.execute(
        sa_select(Volunteer).where(
            Volunteer.campaign_id == campaign_id,
            Volunteer.user_id == user.id,
        )
    )
    volunteer = vol_result.scalar_one_or_none()
    if volunteer is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Not Registered",
            detail="You must register as a volunteer before signing up for shifts",
            type="volunteer-not-registered",
        )

    try:
        shift_vol = await _shift_service.signup_volunteer(
            db, shift_id, volunteer.id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Signup Failed",
            detail=str(exc),
            type="shift-signup-failed",
        )
    await db.commit()
    return ShiftSignupResponse.model_validate(shift_vol)


@router.post(
    "/campaigns/{campaign_id}/shifts/{shift_id}/assign/{volunteer_id}",
    response_model=ShiftSignupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_volunteer(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Manager assigns volunteer to shift (bypasses capacity).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        shift_vol = await _shift_service.manager_assign(
            db, shift_id, volunteer_id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Assignment Failed",
            detail=str(exc),
            type="shift-assignment-failed",
        )
    await db.commit()
    return ShiftSignupResponse.model_validate(shift_vol)


@router.delete(
    "/campaigns/{campaign_id}/shifts/{shift_id}/signup",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_self_signup(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Volunteer self-cancels their shift signup.

    Only allowed before shift start time.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context
    from sqlalchemy import select as sa_select

    from app.models.volunteer import Volunteer

    await set_campaign_context(db, str(campaign_id))

    # Resolve volunteer from user_id
    vol_result = await db.execute(
        sa_select(Volunteer).where(
            Volunteer.campaign_id == campaign_id,
            Volunteer.user_id == user.id,
        )
    )
    volunteer = vol_result.scalar_one_or_none()
    if volunteer is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Not Registered",
            detail="Volunteer record not found",
            type="volunteer-not-registered",
        )

    try:
        await _shift_service.cancel_signup(
            db, shift_id, volunteer.id, user.id, user.role
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Cancel Failed",
            detail=str(exc),
            type="signup-cancel-failed",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/campaigns/{campaign_id}/shifts/{shift_id}/volunteers/{volunteer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def manager_remove_volunteer(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Manager removes a volunteer from a shift.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        await _shift_service.cancel_signup(
            db, shift_id, volunteer_id, user.id, user.role
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Not Found",
            detail=str(exc),
            type="volunteer-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Check-in / Check-out
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/shifts/{shift_id}/check-in/{volunteer_id}",
    response_model=CheckInResponse,
)
async def check_in(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Check in a volunteer to a shift.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        shift_vol = await _shift_service.check_in(db, shift_id, volunteer_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Check-in Failed",
            detail=str(exc),
            type="check-in-failed",
        )
    await db.commit()
    return CheckInResponse.model_validate(shift_vol)


@router.post(
    "/campaigns/{campaign_id}/shifts/{shift_id}/check-out/{volunteer_id}",
    response_model=CheckInResponse,
)
async def check_out(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Check out a volunteer from a shift.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        shift_vol = await _shift_service.check_out(db, shift_id, volunteer_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Check-out Failed",
            detail=str(exc),
            type="check-out-failed",
        )
    await db.commit()
    return CheckInResponse.model_validate(shift_vol)


# ---------------------------------------------------------------------------
# Hours
# ---------------------------------------------------------------------------


@router.patch(
    "/campaigns/{campaign_id}/shifts/{shift_id}/volunteers/{volunteer_id}/hours",
    response_model=CheckInResponse,
)
async def adjust_hours(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    body: HoursAdjustment,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Adjust volunteer hours for a shift with audit trail.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    try:
        shift_vol = await _shift_service.adjust_hours(
            db, shift_id, volunteer_id,
            body.adjusted_hours, body.adjustment_reason, user.id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Hours Adjustment Failed",
            detail=str(exc),
            type="hours-adjustment-failed",
        )
    await db.commit()
    return CheckInResponse.model_validate(shift_vol)


@router.get(
    "/campaigns/{campaign_id}/shifts/{shift_id}/volunteers",
    response_model=list[ShiftSignupResponse],
)
async def list_shift_volunteers(
    campaign_id: uuid.UUID,
    shift_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """List volunteers signed up for a shift.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    from app.db.rls import set_campaign_context

    await set_campaign_context(db, str(campaign_id))
    volunteers = await _shift_service.list_shift_volunteers(db, shift_id)
    return [ShiftSignupResponse.model_validate(v) for v in volunteers]
