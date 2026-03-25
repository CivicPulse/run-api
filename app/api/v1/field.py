"""Field endpoints -- volunteer assignment detection for the landing hub."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced, get_campaign_db
from app.core.rate_limit import get_user_or_ip_key, limiter
from app.core.security import AuthenticatedUser, get_current_user
from app.schemas.field import FieldMeResponse
from app.services.field import FieldService

router = APIRouter()

_field_service = FieldService()


@router.get(
    "/campaigns/{campaign_id}/field/me",
    response_model=FieldMeResponse,
)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_field_me(
    request: Request,
    campaign_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_campaign_db),
) -> FieldMeResponse:
    """Return volunteer's active assignments for the field landing page.

    Returns volunteer name, campaign name, and at most one canvassing
    assignment and one phone banking assignment (most recent active).
    """
    await ensure_user_synced(user, db)

    result = await _field_service.get_field_me(
        db=db,
        campaign_id=campaign_id,
        user_id=user.id,
        display_name=user.display_name,
        email=user.email,
    )

    return FieldMeResponse.model_validate(result)
