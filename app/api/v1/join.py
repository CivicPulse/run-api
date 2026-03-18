"""Public volunteer join flow API endpoints.

Provides two routes:
- ``GET /join/{slug}`` — public, no auth required; returns campaign info for the
  join landing page.
- ``POST /join/{slug}/register`` — authenticated; registers the current user as
  a volunteer for the campaign.

Authentication for the register endpoint uses ``get_current_user`` directly
(not ``require_role``) because brand-new users will not yet have any campaign
role assigned in ZITADEL.
"""

from __future__ import annotations

import fastapi_problem_details as problem
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import CampaignNotFoundError
from app.core.security import AuthenticatedUser, get_current_user
from app.db.session import get_db
from app.schemas.join import CampaignPublicInfo, JoinResponse
from app.services.join import JoinService

router = APIRouter()
join_service = JoinService()


@router.get(
    "/join/{slug}",
    response_model=CampaignPublicInfo,
    summary="Get public campaign info by slug",
    description=(
        "Public endpoint — no authentication required. "
        "Returns campaign details suitable for the volunteer join landing page."
    ),
)
async def get_campaign_public_info(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> CampaignPublicInfo:
    """Return public campaign information for the given slug.

    Args:
        slug: URL-safe campaign slug from the join link.
        db: Injected async database session.

    Returns:
        ``CampaignPublicInfo`` schema populated from the matching campaign.

    Raises:
        404: If no active campaign exists for the slug.
    """
    campaign = await join_service.get_campaign_public_info(slug, db)
    return CampaignPublicInfo.model_validate(campaign)


@router.post(
    "/join/{slug}/register",
    response_model=JoinResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register authenticated user as volunteer",
    description=(
        "Registers the currently authenticated user as a volunteer for the "
        "campaign identified by ``slug``. Does not require a pre-existing "
        "campaign role — works for brand-new users."
    ),
)
async def register_volunteer(
    slug: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JoinResponse:
    """Register the authenticated user as a volunteer for the campaign.

    Args:
        slug: URL-safe campaign slug from the join link.
        request: FastAPI request (provides access to ``app.state.zitadel_service``).
        user: Authenticated user extracted from the JWT bearer token.
        db: Injected async database session.

    Returns:
        ``JoinResponse`` with campaign and volunteer IDs plus a confirmation message.

    Raises:
        404: If no active campaign exists for the slug.
        409: If the user is already registered for this campaign.
    """
    zitadel = request.app.state.zitadel_service
    try:
        result = await join_service.register_volunteer(slug, user, db, zitadel)
    except CampaignNotFoundError:
        raise
    except ValueError as exc:
        message = str(exc)
        if message.startswith("already_registered:"):
            campaign_id = message.split(":", 1)[1]
            return problem.ProblemResponse(
                status=status.HTTP_409_CONFLICT,
                title="Already Registered",
                detail="Already registered",
                type="volunteer-already-registered",
                campaign_id=campaign_id,
            )
        raise

    return JoinResponse(
        campaign_id=result["campaign_id"],
        campaign_slug=result["campaign_slug"],
        volunteer_id=result["volunteer_id"],
        message="Successfully registered as a volunteer.",
    )
