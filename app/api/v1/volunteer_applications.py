"""Volunteer application endpoints for public intake and admin review."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import (
    AuthenticatedUser,
    get_optional_current_user,
    require_role,
)
from app.db.session import get_db
from app.schemas.volunteer_application import (
    PublicVolunteerApplicationStatus,
    VolunteerApplicationCreate,
    VolunteerApplicationDecision,
    VolunteerApplicationResponse,
)
from app.services.volunteer_application import VolunteerApplicationService

router = APIRouter()
volunteer_application_service = VolunteerApplicationService()


@router.get(
    "/public/signup-links/{token}/application",
    response_model=PublicVolunteerApplicationStatus,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def get_my_volunteer_application(
    request: Request,
    token: uuid.UUID,
    user: AuthenticatedUser | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        return PublicVolunteerApplicationStatus(status="none")
    application = await volunteer_application_service.get_current_application(
        db,
        token,
        user.id,
    )
    if application is None:
        return PublicVolunteerApplicationStatus(status="none")
    return PublicVolunteerApplicationStatus(
        status=application.status,
        application=VolunteerApplicationResponse.model_validate(application),
    )


@router.post(
    "/public/signup-links/{token}/applications",
    response_model=VolunteerApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def submit_volunteer_application(
    request: Request,
    token: uuid.UUID,
    data: VolunteerApplicationCreate,
    user: AuthenticatedUser | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        application = await volunteer_application_service.submit_application(
            db,
            token,
            applicant_user_id=user.id if user is not None else None,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            phone=data.phone,
            notes=data.notes,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    return VolunteerApplicationResponse.model_validate(application)


@router.get(
    "/campaigns/{campaign_id}/volunteer-applications",
    response_model=list[VolunteerApplicationResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_volunteer_applications(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    applications = await volunteer_application_service.list_applications(
        db,
        campaign_id,
    )
    return [
        VolunteerApplicationResponse.model_validate(application)
        for application in applications
    ]


@router.post(
    "/campaigns/{campaign_id}/volunteer-applications/{application_id}/approve",
    response_model=VolunteerApplicationResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def approve_volunteer_application(
    request: Request,
    campaign_id: uuid.UUID,
    application_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    try:
        application = await volunteer_application_service.approve_application(
            db,
            campaign_id,
            application_id,
            user.id,
            request.app.state.zitadel_service,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if detail.endswith("not found")
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return VolunteerApplicationResponse.model_validate(application)


@router.post(
    "/campaigns/{campaign_id}/volunteer-applications/{application_id}/reject",
    response_model=VolunteerApplicationResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def reject_volunteer_application(
    request: Request,
    campaign_id: uuid.UUID,
    application_id: uuid.UUID,
    data: VolunteerApplicationDecision,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    try:
        application = await volunteer_application_service.reject_application(
            db,
            campaign_id,
            application_id,
            user.id,
            data.rejection_reason,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if detail.endswith("not found")
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return VolunteerApplicationResponse.model_validate(application)
