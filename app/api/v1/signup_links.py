"""Signup-link endpoints for campaign admin management and public entry."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, require_role
from app.db.session import get_db
from app.schemas.signup_link import (
    PublicSignupLinkResponse,
    SignupLinkCreate,
    SignupLinkResponse,
)
from app.services.signup_link import SignupLinkService

router = APIRouter()
signup_link_service = SignupLinkService()


@router.post(
    "/campaigns/{campaign_id}/signup-links",
    response_model=SignupLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("40/minute", key_func=get_user_or_ip_key)
async def create_signup_link(
    request: Request,
    campaign_id: uuid.UUID,
    data: SignupLinkCreate,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    link = await signup_link_service.create_link(db, campaign_id, data.label, user.id)
    return SignupLinkResponse.model_validate(link)


@router.get(
    "/campaigns/{campaign_id}/signup-links",
    response_model=list[SignupLinkResponse],
)
@limiter.limit("240/minute", key_func=get_user_or_ip_key)
async def list_signup_links(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    links = await signup_link_service.list_links(db, campaign_id)
    return [SignupLinkResponse.model_validate(link) for link in links]


@router.post(
    "/campaigns/{campaign_id}/signup-links/{link_id}/disable",
    response_model=SignupLinkResponse,
)
@limiter.limit("40/minute", key_func=get_user_or_ip_key)
async def disable_signup_link(
    request: Request,
    campaign_id: uuid.UUID,
    link_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    link = await signup_link_service.disable_link(db, campaign_id, link_id)
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signup link not found",
        )
    return SignupLinkResponse.model_validate(link)


@router.post(
    "/campaigns/{campaign_id}/signup-links/{link_id}/regenerate",
    response_model=SignupLinkResponse,
)
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def regenerate_signup_link(
    request: Request,
    campaign_id: uuid.UUID,
    link_id: uuid.UUID,
    user: AuthenticatedUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_campaign_db),
):
    await ensure_user_synced(user, db)
    try:
        link = await signup_link_service.regenerate_link(
            db,
            campaign_id,
            link_id,
            user.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signup link not found",
        )
    return SignupLinkResponse.model_validate(link)


@router.get(
    "/public/signup-links/{token}",
    response_model=PublicSignupLinkResponse,
)
@limiter.limit("120/minute", key_func=get_user_or_ip_key)
async def get_public_signup_link(
    request: Request,
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    link, campaign, organization = await signup_link_service.get_public_link(db, token)
    if link is None or campaign is None:
        return PublicSignupLinkResponse(token=token, status="unavailable")
    return PublicSignupLinkResponse(
        token=token,
        status="valid",
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        organization_name=organization.name if organization else None,
        candidate_name=campaign.candidate_name,
        jurisdiction_name=campaign.jurisdiction_name,
        election_date=campaign.election_date,
        link_label=link.label,
    )
