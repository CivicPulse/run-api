"""Voter interaction history endpoints -- append-only event log."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.models.user import User
from app.models.voter_interaction import InteractionType
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.voter_interaction import InteractionCreateRequest, InteractionResponse
from app.services.voter_interaction import VoterInteractionService

logger = logging.getLogger(__name__)

router = APIRouter()

_service = VoterInteractionService()


@router.get(
    "/campaigns/{campaign_id}/voters/{voter_id}/interactions",
    response_model=PaginatedResponse[InteractionResponse],
)
async def get_voter_interactions(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    interaction_type: str | None = Query(None, alias="type"),
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Get voter interaction history ordered by created_at DESC.

    Optional type filter narrows results to a specific interaction type.
    Cursor-based pagination via cursor and limit params.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    type_filter = None
    if interaction_type is not None:
        try:
            type_filter = InteractionType(interaction_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid interaction type: {interaction_type}",
            ) from None

    page = await _service.get_voter_history(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        type_filter=type_filter,
        cursor=cursor,
        limit=limit,
    )

    # Resolve user display names for created_by IDs
    user_ids = {e.created_by for e in page.items}
    user_name_map: dict[str, str] = {}
    if user_ids:
        user_result = await db.execute(
            select(User.id, User.display_name).where(User.id.in_(user_ids))
        )
        for uid, display_name in user_result.all():
            if display_name:
                user_name_map[uid] = display_name

        unresolved = user_ids - set(user_name_map.keys())
        if unresolved:
            logger.warning(
                "Could not resolve display names for user IDs: %s",
                unresolved,
            )

    items = []
    for e in page.items:
        resp = InteractionResponse.model_validate(e)
        resp.created_by_name = user_name_map.get(e.created_by)
        items.append(resp)

    return PaginatedResponse[InteractionResponse](
        items=items,
        pagination=PaginationResponse(
            next_cursor=page.next_cursor,
            has_more=page.has_more,
        ),
    )


@router.post(
    "/campaigns/{campaign_id}/voters/{voter_id}/interactions",
    response_model=InteractionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_voter_interaction(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    body: InteractionCreateRequest,
    user: AuthenticatedUser = Depends(require_role("volunteer")),
    db: AsyncSession = Depends(get_db),
):
    """Add a manual interaction event (note only via API).

    Other interaction types (tag_added, import, etc.) are created
    by system operations, not directly via this endpoint.
    Requires volunteer+ role.
    """
    await ensure_user_synced(user, db)
    await set_campaign_context(db, str(campaign_id))

    if body.type != "note":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only 'note' type interactions can be created via API",
        )

    interaction = await _service.record_interaction(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        interaction_type=InteractionType.NOTE,
        payload=body.payload,
        user_id=user.id,
    )
    await db.commit()

    resp = InteractionResponse.model_validate(interaction)
    # Resolve display name for the creating user
    user_result = await db.execute(select(User.display_name).where(User.id == user.id))
    display_name = user_result.scalar_one_or_none()
    if display_name:
        resp.created_by_name = display_name
    else:
        logger.warning(
            "Could not resolve display_name for user %s",
            user.id,
        )

    return resp
