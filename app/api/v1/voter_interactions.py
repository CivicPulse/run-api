"""Voter interaction history endpoints -- append-only event log."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_user_synced
from app.core.security import AuthenticatedUser, require_role
from app.db.rls import set_campaign_context
from app.db.session import get_db
from app.models.voter_interaction import InteractionType
from app.schemas.common import PaginatedResponse, PaginationResponse
from app.schemas.voter_interaction import InteractionCreateRequest, InteractionResponse
from app.services.voter_interaction import VoterInteractionService

router = APIRouter()

_service = VoterInteractionService()


@router.get(
    "/campaigns/{campaign_id}/voters/{voter_id}/interactions",
    response_model=PaginatedResponse[InteractionResponse],
)
async def get_voter_interactions(
    campaign_id: uuid.UUID,
    voter_id: uuid.UUID,
    type: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
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
    if type is not None:
        try:
            type_filter = InteractionType(type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid interaction type: {type}",
            ) from None

    page = await _service.get_voter_history(
        session=db,
        campaign_id=campaign_id,
        voter_id=voter_id,
        type_filter=type_filter,
        cursor=cursor,
        limit=limit,
    )

    return PaginatedResponse[InteractionResponse](
        items=[InteractionResponse.model_validate(e) for e in page.items],
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

    return InteractionResponse.model_validate(interaction)
