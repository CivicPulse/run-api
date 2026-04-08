"""Volunteer management API endpoints -- profile CRUD, tags, availability."""

from __future__ import annotations

import uuid

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.models.volunteer import Volunteer
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.volunteer import (
    AvailabilityCreate,
    AvailabilityResponse,
    VolunteerCreate,
    VolunteerDetailResponse,
    VolunteerResponse,
    VolunteerStatusUpdate,
    VolunteerTagCreate,
    VolunteerTagResponse,
    VolunteerTagUpdate,
    VolunteerUpdate,
)
from app.services.invite import InviteService
from app.services.volunteer import VolunteerService

router = APIRouter()

_volunteer_service = VolunteerService()
_invite_service = InviteService()


# ---------------------------------------------------------------------------
# Volunteer CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/volunteers",
    response_model=VolunteerResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def create_volunteer(
    request: Request,
    campaign_id: uuid.UUID,
    body: VolunteerCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Manager creates a volunteer profile.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    volunteer = await _volunteer_service.create_volunteer(
        db, campaign_id, body, user.id
    )
    if body.send_invite and body.email:
        await _invite_service.create_invite(
            db=db,
            campaign_id=campaign_id,
            email=body.email,
            role="volunteer",
            creator=user,
        )
    await db.commit()
    return VolunteerResponse.model_validate(volunteer)


@router.post(
    "/campaigns/{campaign_id}/volunteers/register",
    response_model=VolunteerResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def self_register(
    request: Request,
    campaign_id: uuid.UUID,
    body: VolunteerCreate,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Logged-in user self-registers as a volunteer.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    try:
        volunteer = await _volunteer_service.self_register(
            db, campaign_id, user.id, body
        )
    except ValueError as exc:
        existing = await db.execute(
            sa_select(Volunteer).where(
                Volunteer.campaign_id == campaign_id,
                Volunteer.user_id == user.id,
            )
        )
        existing_vol = existing.scalar_one_or_none()
        return problem.ProblemResponse(
            status=status.HTTP_409_CONFLICT,
            title="Already Registered",
            detail=str(exc),
            type="volunteer-already-registered",
            volunteer_id=str(existing_vol.id) if existing_vol else None,
        )
    await db.commit()
    return VolunteerResponse.model_validate(volunteer)


@router.get(
    "/campaigns/{campaign_id}/volunteers",
    response_model=PaginatedResponse[VolunteerResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_volunteers(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_status: str | None = Query(None, alias="status"),
    skills: str | None = Query(None),
    name: str | None = Query(None),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List volunteers with optional filters.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    skills_list = skills.split(",") if skills else None
    volunteers = await _volunteer_service.list_volunteers(
        db,
        campaign_id,
        status=volunteer_status,
        skills=skills_list,
        name_search=name,
    )
    return PaginatedResponse[VolunteerResponse](
        items=[VolunteerResponse.model_validate(v) for v in volunteers],
        pagination=PaginationResponse(next_cursor=None, has_more=False),
    )


@router.get(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}",
    response_model=VolunteerDetailResponse,
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def get_volunteer_detail(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get volunteer detail including tags and availability.

    Requires volunteer+ role (manager+ or self).
    """
    await ensure_user_synced(user, db)
    detail = await _volunteer_service.get_volunteer_detail(
        db, volunteer_id, campaign_id
    )
    if detail is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Not Found",
            detail=f"Volunteer {volunteer_id} not found",
            type="volunteer-not-found",
        )

    vol = detail["volunteer"]
    return VolunteerDetailResponse(
        id=vol.id,
        campaign_id=vol.campaign_id,
        user_id=vol.user_id,
        first_name=vol.first_name,
        last_name=vol.last_name,
        phone=vol.phone,
        email=vol.email,
        street=vol.street,
        city=vol.city,
        state=vol.state,
        zip_code=vol.zip_code,
        emergency_contact_name=vol.emergency_contact_name,
        emergency_contact_phone=vol.emergency_contact_phone,
        notes=vol.notes,
        status=vol.status,
        skills=vol.skills,
        created_by=vol.created_by,
        created_at=vol.created_at,
        updated_at=vol.updated_at,
        tags=detail["tags"],
        availability=[
            AvailabilityResponse.model_validate(a) for a in detail["availability"]
        ],
    )


@router.patch(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}",
    response_model=VolunteerResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def update_volunteer(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    body: VolunteerUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Update volunteer profile.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        volunteer = await _volunteer_service.update_volunteer(
            db, volunteer_id, campaign_id, body
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Not Found",
            detail=str(exc),
            type="volunteer-not-found",
        )
    await db.commit()
    return VolunteerResponse.model_validate(volunteer)


@router.patch(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/status",
    response_model=VolunteerResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def update_volunteer_status(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    body: VolunteerStatusUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Update volunteer status.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        volunteer = await _volunteer_service.update_status(
            db, volunteer_id, campaign_id, body.status
        )
    except ValueError as exc:
        if "not found" in str(exc):
            return problem.ProblemResponse(
                status=status.HTTP_404_NOT_FOUND,
                title="Volunteer Not Found",
                detail=str(exc),
                type="volunteer-not-found",
            )
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Status Update Failed",
            detail=str(exc),
            type="status-update-failed",
        )
    await db.commit()
    return VolunteerResponse.model_validate(volunteer)


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/availability",
    response_model=AvailabilityResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def add_availability(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    body: AvailabilityCreate,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Add an availability time slot.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    try:
        availability = await _volunteer_service.add_availability(
            db, volunteer_id, campaign_id, body
        )
    except ValueError as exc:
        if "not found" in str(exc):
            return problem.ProblemResponse(
                status=status.HTTP_404_NOT_FOUND,
                title="Volunteer Not Found",
                detail=str(exc),
                type="volunteer-not-found",
            )
        return problem.ProblemResponse(
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            title="Invalid Availability",
            detail=str(exc),
            type="invalid-availability",
        )
    await db.commit()
    return AvailabilityResponse.model_validate(availability)


@router.delete(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/availability/{availability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def delete_availability(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    availability_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Remove an availability slot.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    try:
        await _volunteer_service.delete_availability(
            db, volunteer_id, campaign_id, availability_id
        )
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Availability Not Found",
            detail=str(exc),
            type="availability-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/availability",
    response_model=list[AvailabilityResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_availability(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List availability slots for a volunteer.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    volunteer = await _volunteer_service.get_volunteer(db, volunteer_id, campaign_id)
    if volunteer is None:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Not Found",
            detail=f"Volunteer {volunteer_id} not found",
            type="volunteer-not-found",
        )
    slots = await _volunteer_service.list_availability(db, volunteer_id, campaign_id)
    return [AvailabilityResponse.model_validate(s) for s in slots]


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/volunteer-tags",
    response_model=VolunteerTagResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def create_tag(
    request: Request,
    campaign_id: uuid.UUID,
    body: VolunteerTagCreate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Create a campaign-scoped volunteer tag.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    tag = await _volunteer_service.create_tag(db, campaign_id, body.name)
    await db.commit()
    return VolunteerTagResponse.model_validate(tag)


@router.get(
    "/campaigns/{campaign_id}/volunteer-tags",
    response_model=list[VolunteerTagResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_tags(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """List all volunteer tags for a campaign.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    tags = await _volunteer_service.list_tags(db, campaign_id)
    return [VolunteerTagResponse.model_validate(t) for t in tags]


@router.patch(
    "/campaigns/{campaign_id}/volunteer-tags/{tag_id}",
    response_model=VolunteerTagResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def update_tag(
    request: Request,
    campaign_id: uuid.UUID,
    tag_id: uuid.UUID,
    body: VolunteerTagUpdate,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Rename a campaign-scoped volunteer tag.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        tag = await _volunteer_service.update_tag(db, tag_id, campaign_id, body.name)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Tag Not Found",
            detail=str(exc),
            type="volunteer-tag-not-found",
        )
    await db.commit()
    return VolunteerTagResponse.model_validate(tag)


@router.delete(
    "/campaigns/{campaign_id}/volunteer-tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def delete_tag(
    request: Request,
    campaign_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Delete a campaign-scoped volunteer tag (cascades to member associations).

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        await _volunteer_service.delete_tag(db, tag_id, campaign_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Tag Not Found",
            detail=str(exc),
            type="volunteer-tag-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/tags/{tag_id}",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def add_tag_to_volunteer(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Add a tag to a volunteer.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        await _volunteer_service.add_tag(db, volunteer_id, tag_id, campaign_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer or Tag Not Found",
            detail=str(exc),
            type="volunteer-tag-not-found",
        )
    await db.commit()
    return {"status": "ok"}


@router.delete(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def remove_tag_from_volunteer(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Remove a tag from a volunteer.

    Requires manager+ role.
    """
    await ensure_user_synced(user, db)
    try:
        await _volunteer_service.remove_tag(db, volunteer_id, tag_id, campaign_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Tag Not Found",
            detail=str(exc),
            type="tag-not-found",
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Hours
# ---------------------------------------------------------------------------


@router.get(
    "/campaigns/{campaign_id}/volunteers/{volunteer_id}/hours",
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def get_volunteer_hours(
    request: Request,
    campaign_id: uuid.UUID,
    volunteer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_campaign_db),
):
    """Get volunteer hours summary.

    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)

    from app.services.shift import ShiftService

    shift_service = ShiftService()
    try:
        return await shift_service.get_volunteer_hours(db, volunteer_id, campaign_id)
    except ValueError as exc:
        return problem.ProblemResponse(
            status=status.HTTP_404_NOT_FOUND,
            title="Volunteer Not Found",
            detail=str(exc),
            type="volunteer-not-found",
        )
